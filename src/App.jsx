import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const PHASES = [
  { id:'base',  label:'BASE',  color:'#22c55e', bg:'#052e16', desc:'สร้างฐาน Aerobic + Mitochondria' },
  { id:'build', label:'BUILD', color:'#f59e0b', bg:'#1c1007', desc:'ยก Lactate Threshold' },
  { id:'peak',  label:'PEAK',  color:'#ef4444', bg:'#1c0505', desc:'Marathon Pace Economy' },
  { id:'taper', label:'TAPER', color:'#a78bfa', bg:'#0d0a1e', desc:'Supercompensation' },
]
const DAYS      = ['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์']
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const S_ICONS   = { easy:'🟢',fastlek:'🟡',interval:'🔴',tempo:'🟠',longrun:'⭐',stride:'⚡',rest:'💤',other:'🔵' }
const S_COLORS  = { easy:'#22c55e',fastlek:'#f59e0b',interval:'#ef4444',tempo:'#f97316',longrun:'#3b82f6',stride:'#a78bfa',rest:'#4b5563',other:'#06b6d4' }
const S_HARD    = new Set(['interval','tempo','fastlek','longrun'])

const guessType = t => {
  const s = (t||'').toLowerCase()
  if (!t||t.includes('พัก')||s==='rest'||s==='-'||s==='') return 'rest'
  if (s.includes('long run')||s.includes('longrun')) return 'longrun'
  if (s.includes('interval')||/\d00\s*[×x*]/.test(s)||/[×x*]\s*\d{2,}/.test(s)) return 'interval'
  if (s.includes('tempo')||s.includes('threshold')) return 'tempo'
  if (s.includes('fastlek')||s.includes('fartlek')||s.includes('สลับ')) return 'fastlek'
  if (s.includes('stride')||s.includes('สตรายด์')) return 'stride'
  if (s.includes('easy')||s.includes('อีซี่')) return 'easy'
  return 'other'
}

const emptyDay = (day, idx) => ({ day, dayIndex:idx, plan:'', type:'rest', done:false, distance:'', duration:'', pace:'', hr:'', rpe:0, feel:'', notes:'' })
const emptyWeek = (num=1, phase='base') => ({ weekNum:num, phase, targetVolume:40, notes:'', sessions: DAYS.map((d,i)=>emptyDay(d,i)) })

const phaseObj  = id => PHASES.find(p=>p.id===id)||PHASES[0]
const totalVol  = w  => w.sessions.reduce((s,d)=>s+(d.done?+d.distance||0:0),0)
const doneSess  = w  => w.sessions.filter(d=>d.done&&d.type!=='rest').length
const planSess  = w  => w.sessions.filter(d=>d.plan&&d.type!=='rest').length
const avgRPE    = w  => { const a=w.sessions.filter(d=>d.done&&d.rpe>0); return a.length?(a.reduce((s,d)=>s+ +d.rpe,0)/a.length).toFixed(1):'-' }
const lrKm      = w  => { const lr=w.sessions.find(d=>d.type==='longrun'&&d.done); return lr?+lr.distance||0:0 }

const IC = { background:'#0d1117',border:'1px solid #374151',borderRadius:8,color:'#f9fafb',padding:'9px 12px',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit',boxSizing:'border-box' }
const BTN = (bg,fg='#000') => ({ background:bg,color:fg,border:'none',borderRadius:10,padding:'11px 16px',cursor:'pointer',fontWeight:'bold',fontSize:13,fontFamily:'inherit' })

// ── ANTHROPIC API ─────────────────────────────────────────────────────────────
async function callClaude(sys, usr) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
    body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1200, system:sys, messages:[{role:'user',content:usr}] })
  })
  const d = await res.json()
  return d.content?.[0]?.text||''
}

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [ready,    setReady]    = useState(false)
  const [userId,   setUserId]   = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [week,     setWeek]     = useState(emptyWeek())
  const [weekId,   setWeekId]   = useState(null)
  const [history,  setHistory]  = useState([])
  const [screen,   setScreen]   = useState('plan')
  const [aiResult, setAiResult] = useState(null)
  const [aiLoad,   setAiLoad]   = useState(false)
  const [valResult,setValResult]= useState(null)
  const [valLoad,  setValLoad]  = useState(false)
  const [activeDay,setActiveDay]= useState(null)
  const [saving,   setSaving]   = useState(false)
  const [loginName,setLoginName]= useState('')
  const [loginErr, setLoginErr] = useState('')

  // ── Load / Login ───────────────────────────────────────────────────────────
  const loadData = useCallback(async (uid) => {
    try {
      // Profile
      const { data:prof } = await supabase.from('profiles').select('*').eq('user_id',uid).single()
      if (prof) setProfile(prof)

      // Current week (latest non-archived)
      const { data:weeks } = await supabase.from('weeks').select('*').eq('user_id',uid).is('archived_at',null).order('week_num',{ascending:false}).limit(1)
      if (weeks?.length) {
        const w = weeks[0]
        setWeekId(w.id)
        const { data:sess } = await supabase.from('sessions').select('*').eq('week_id',w.id).order('day_index')
        setWeek({ weekNum:w.week_num, phase:w.phase, targetVolume:w.target_volume, notes:w.notes||'', sessions: sess||DAYS.map((d,i)=>emptyDay(d,i)) })
      }

      // History (archived weeks)
      const { data:hist } = await supabase.from('weeks').select('*, sessions(*)').eq('user_id',uid).not('archived_at','is',null).order('week_num')
      if (hist) {
        setHistory(hist.map(w=>({
          weekNum:w.week_num, phase:w.phase, targetVolume:w.target_volume, notes:w.notes||'',
          archivedAt:w.archived_at,
          sessions:(w.sessions||[]).sort((a,b)=>a.day_index-b.day_index)
        })))
      }
    } catch(e) { console.error(e) }
    setReady(true)
  }, [])

  const handleLogin = async () => {
    const uid = loginName.trim().toLowerCase()
    if (!uid) { setLoginErr('กรุณากรอกชื่อหรือ Email'); return }
    setUserId(uid)
    localStorage.setItem('mc_uid', uid)
    await loadData(uid)
  }

  useEffect(()=>{
    const uid = localStorage.getItem('mc_uid')
    if (uid) { setUserId(uid); loadData(uid) }
    else setReady(true)
  },[loadData])

  // ── Save Week to Supabase ──────────────────────────────────────────────────
  const saveWeekToDb = useCallback(async (w, wid) => {
    if (!userId) return
    setSaving(true)
    try {
      let currentWeekId = wid
      if (!currentWeekId) {
        const { data } = await supabase.from('weeks').insert({ user_id:userId, week_num:w.weekNum, phase:w.phase, target_volume:w.targetVolume, notes:w.notes }).select().single()
        currentWeekId = data.id
        setWeekId(currentWeekId)
      } else {
        await supabase.from('weeks').update({ phase:w.phase, target_volume:w.targetVolume, notes:w.notes }).eq('id',currentWeekId)
      }
      // Upsert sessions
      for (const s of w.sessions) {
        await supabase.from('sessions').upsert({
          week_id:currentWeekId, user_id:userId,
          day_name:s.day, day_index:s.dayIndex||DAYS.indexOf(s.day),
          plan:s.plan||'', session_type:s.type||'rest',
          done:s.done||false, distance:+s.distance||0, duration:+s.duration||0,
          pace:s.pace||'', hr:+s.hr||null, rpe:+s.rpe||0,
          feel:s.feel||'', notes:s.notes||''
        }, { onConflict:'week_id,day_name' })
      }
    } catch(e) { console.error('save error',e) }
    setSaving(false)
  }, [userId])

  const updateWeek = (w) => {
    setWeek(w)
    clearTimeout(window._saveTimer)
    window._saveTimer = setTimeout(()=>saveWeekToDb(w,weekId), 1500)
  }

  // ── Save Profile ───────────────────────────────────────────────────────────
  const saveProfile = async (p) => {
    setProfile(p)
    await supabase.from('profiles').upsert({ user_id:userId, target_pace:p.targetPace, race_date:p.raceDate, phase:p.phase, max_long_run:+p.maxLongRun, week_num:+p.weekNum }, { onConflict:'user_id' })
    const nw = emptyWeek(+p.weekNum||1, p.phase)
    const { data } = await supabase.from('weeks').insert({ user_id:userId, week_num:nw.weekNum, phase:nw.phase, target_volume:nw.targetVolume, notes:'' }).select().single()
    setWeekId(data.id)
    setWeek(nw)
    setScreen('plan')
  }

  // ── Archive & Next Week ────────────────────────────────────────────────────
  const archiveAndNext = async (nextWeek) => {
    if (!weekId) return
    await supabase.from('weeks').update({ archived_at:new Date().toISOString() }).eq('id',weekId)
    const nw = nextWeek||emptyWeek((week.weekNum||1)+1, week.phase)
    const { data } = await supabase.from('weeks').insert({ user_id:userId, week_num:nw.weekNum, phase:nw.phase, target_volume:nw.targetVolume, notes:'' }).select().single()
    const newWid = data.id
    if (nw.sessions?.some(s=>s.plan)) {
      for (const s of nw.sessions) {
        await supabase.from('sessions').insert({ week_id:newWid, user_id:userId, day_name:s.day, day_index:DAYS.indexOf(s.day), plan:s.plan||'', session_type:s.type||'rest', done:false })
      }
    }
    setWeekId(newWid)
    setWeek(nw)
    const newH = [...history,{...week,archivedAt:new Date().toISOString()}]
    setHistory(newH)
    setAiResult(null); setValResult(null)
    setScreen('plan')
  }

  // ── Plan Validator ─────────────────────────────────────────────────────────
  const validatePlan = async () => {
    setValLoad(true); setValResult(null)
    try {
      const sys = `คุณคือโค้ชมาราธอน Elite ตรวจโปรแกรมว่าถูกหลักการสากล 80/20, Progressive Overload, Stress-Recovery, Phase Specificity ไหม ตอบ JSON เท่านั้น ไม่มี markdown`
      const planText = week.sessions.map((d,i)=>`${DAY_SHORT[i]} ${d.day}: ${d.plan||'พัก'}`).join('\n')
      const usr = `Phase: ${week.phase} | W${week.weekNum} | เป้า Volume: ${week.targetVolume}km | Target Pace: ${profile?.targetPace||'5:30'}

โปรแกรม:\n${planText}

ตอบ JSON:
{"verdict":"ผ่าน|ปรับเล็กน้อย|ต้องแก้","score":85,"summary":"สรุป 1-2 ประโยค","checks":[{"rule":"80/20 Rule","pass":true,"comment":"..."},{"rule":"วันหนักไม่ติดกัน","pass":true,"comment":"..."},{"rule":"Long Run","pass":true,"comment":"..."},{"rule":"Phase Specificity","pass":true,"comment":"..."},{"rule":"Volume","pass":true,"comment":"..."}],"dayFeedback":[{"day":"จันทร์","ok":true,"comment":""},{"day":"อังคาร","ok":true,"comment":""},{"day":"พุธ","ok":true,"comment":""},{"day":"พฤหัส","ok":true,"comment":""},{"day":"ศุกร์","ok":true,"comment":""},{"day":"เสาร์","ok":true,"comment":""},{"day":"อาทิตย์","ok":true,"comment":""}],"suggestions":["แนะนำ1","แนะนำ2"]}`
      const raw = await callClaude(sys,usr)
      setValResult(JSON.parse(raw.replace(/```json|```/g,'').trim()))
    } catch(e) { setValResult({error:'ตรวจไม่สำเร็จ: '+e.message}) }
    setValLoad(false)
  }

  // ── Weekly AI Analysis ─────────────────────────────────────────────────────
  const runAI = async () => {
    setAiLoad(true); setAiResult(null)
    try {
      const sys = `คุณคือโค้ชมาราธอน Elite ใช้หลักการ Maffetone, Daniels, Seiler 80/20, Norwegian Method ตอบภาษาไทย กระชับ ตอบ JSON เท่านั้น ไม่มี markdown`
      const planText = week.sessions.map(d=>`${d.day}: ${d.plan||(d.type==='rest'?'พัก':'ไม่ได้วาง')}`).join('\n')
      const actText  = week.sessions.map(d=>`${d.day}: ${d.done?`✓ ${d.distance}km pace:${d.pace} HR:${d.hr} RPE:${d.rpe} "${d.feel}"`:d.type==='rest'?'พัก':'ไม่ได้ทำ'}`).join('\n')
      const prevText = history.slice(-3).map(w2=>`W${w2.weekNum}[${w2.phase}]: vol=${totalVol(w2).toFixed(1)}km sessions=${doneSess(w2)}/${planSess(w2)} RPE=${avgRPE(w2)} LR=${lrKm(w2)}km`).join('\n')
      const usr = `นักวิ่ง: Pace ${profile?.targetPace||'5:30'} | Phase: ${week.phase} | W${week.weekNum}
แผน:\n${planText}\nจริง:\n${actText}
Vol: ${totalVol(week).toFixed(1)}/${week.targetVolume}km | Sessions: ${doneSess(week)}/${planSess(week)} | RPE: ${avgRPE(week)} | LR: ${lrKm(week)}km
Note: ${week.notes||'(ไม่มี)'}
ประวัติ:\n${prevText||'(ยังไม่มี)'}

ตอบ JSON: {"assessment":"...","signals":["s1","s2","s3"],"decision":"เพิ่ม|คงที่|ถอย|DownWeek","reason":"...","nextPhase":"${week.phase}","nextVolume":42,"coachTip":"...","nextPlan":[{"day":"จันทร์","plan":"พัก"},{"day":"อังคาร","plan":"Easy 60 นาที + Stride 100m ×4"},{"day":"พุธ","plan":"Fastlek 1/1 ×18 รอบ"},{"day":"พฤหัส","plan":"พัก"},{"day":"ศุกร์","plan":"Long run 20 km Easy"},{"day":"เสาร์","plan":"Easy 50 นาที + Stride ×4"},{"day":"อาทิตย์","plan":"พัก"}]}`
      const raw = await callClaude(sys,usr)
      setAiResult(JSON.parse(raw.replace(/```json|```/g,'').trim()))
    } catch(e) { setAiResult({error:'วิเคราะห์ไม่สำเร็จ: '+e.message}) }
    setAiLoad(false)
  }

  const applyAIPlan = () => {
    if (!aiResult?.nextPlan) return
    const nw = { ...emptyWeek((week.weekNum||1)+1, aiResult.nextPhase||week.phase), targetVolume:aiResult.nextVolume||week.targetVolume,
      sessions: DAYS.map((dayName,i) => { const ai=aiResult.nextPlan.find(x=>x.day===dayName); const p=ai?.plan||''; return {...emptyDay(dayName,i),plan:p,type:guessType(p)} })
    }
    archiveAndNext(nw)
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  if (!ready) return <Loader/>
  if (!userId) return <LoginScreen name={loginName} setName={setLoginName} err={loginErr} onLogin={handleLogin}/>
  if (!profile) return <SetupScreen userId={userId} onSave={saveProfile}/>

  const screens = {
    plan:    <PlanScreen    week={week} onUpdate={updateWeek} valResult={valResult} valLoad={valLoad} onValidate={validatePlan} onGoLog={()=>setScreen('log')} saving={saving}/>,
    log:     <LogScreen     week={week} onUpdate={updateWeek} activeDay={activeDay} setActiveDay={setActiveDay} onBack={()=>setScreen('plan')} saving={saving}/>,
    summary: <SummaryScreen week={week} profile={profile} aiResult={aiResult} aiLoad={aiLoad} onAnalyze={runAI} onApply={applyAIPlan} onArchive={()=>archiveAndNext()} onGoLog={()=>setScreen('log')}/>,
    history: <HistoryScreen history={history} onBack={()=>setScreen('plan')}/>,
  }

  return (
    <div style={{background:'#0a0f1a',minHeight:'100vh',color:'#e2e8f0',fontFamily:"'Courier New',monospace",paddingBottom:72}}>
      <div style={{background:'#0d1117',borderBottom:'1px solid #1f2937',padding:'8px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontSize:13,fontWeight:'bold',color:'#22c55e',letterSpacing:2}}>🏃 MARATHON COACH</div>
        <div style={{fontSize:11,color:'#4b5563'}}>{userId} {saving&&'• saving...'}</div>
      </div>
      {screens[screen]||screens.plan}
      <BottomNav screen={screen} setScreen={setScreen} done={doneSess(week)} planned={planSess(week)}/>
    </div>
  )
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({name,setName,err,onLogin}) {
  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a0f1a,#0f1f10)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{fontSize:56,marginBottom:8}}>🏃</div>
      <div style={{fontSize:28,fontWeight:'bold',color:'#22c55e',letterSpacing:3,marginBottom:4}}>MARATHON COACH</div>
      <div style={{color:'#6b7280',marginBottom:40,fontSize:13}}>Self-Coached Marathon Platform</div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:16,padding:28,width:'100%',maxWidth:380}}>
        <div style={{color:'#9ca3af',fontSize:13,marginBottom:6}}>ชื่อหรือ Email ของคุณ</div>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onLogin()} placeholder="เช่น channarong@email.com" style={IC}/>
        {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:6}}>{err}</div>}
        <div style={{fontSize:11,color:'#4b5563',marginTop:8,marginBottom:16}}>ใช้เป็น ID สำหรับดึงข้อมูลของคุณ ครั้งต่อไปกรอกชื่อเดิมเพื่อเข้าถึงข้อมูล</div>
        <button onClick={onLogin} style={{...BTN('#22c55e'),width:'100%',padding:14,fontSize:15}}>เข้าสู่ระบบ →</button>
      </div>
    </div>
  )
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
function SetupScreen({userId,onSave}) {
  const [f,setF] = useState({targetPace:'5:30',raceDate:'',phase:'base',maxLongRun:15,weekNum:1})
  const s=(k,v)=>setF(x=>({...x,[k]:v}))
  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a0f1a,#0f1f10)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{fontSize:52,marginBottom:8}}>⚙️</div>
      <div style={{fontSize:22,fontWeight:'bold',color:'#22c55e',letterSpacing:2,marginBottom:4}}>ตั้งค่าโปรไฟล์</div>
      <div style={{color:'#6b7280',marginBottom:28,fontSize:13}}>สวัสดี {userId}</div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:16,padding:28,width:'100%',maxWidth:400}}>
        {[{l:'🎯 Target Pace (min/km)',k:'targetPace',ph:'5:30'},{l:'📅 วันแข่ง',k:'raceDate',t:'date'},{l:'📏 Long Run สูงสุดที่เคยทำ (km)',k:'maxLongRun',t:'number'},{l:'📆 เริ่มต้นที่สัปดาห์ที่',k:'weekNum',t:'number'}].map(({l,k,t='text',ph})=>(
          <div key={k} style={{marginBottom:14}}>
            <div style={{color:'#9ca3af',fontSize:12,marginBottom:5}}>{l}</div>
            <input type={t} value={f[k]} onChange={e=>s(k,e.target.value)} placeholder={ph} style={IC}/>
          </div>
        ))}
        <div style={{marginBottom:16}}>
          <div style={{color:'#9ca3af',fontSize:12,marginBottom:6}}>📍 Phase เริ่มต้น</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {PHASES.map(p=><button key={p.id} onClick={()=>s('phase',p.id)} style={{padding:8,borderRadius:8,border:`2px solid ${f.phase===p.id?p.color:'#374151'}`,background:f.phase===p.id?p.bg:'transparent',color:f.phase===p.id?p.color:'#6b7280',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:'bold'}}>{p.label}</button>)}
          </div>
        </div>
        <button onClick={()=>onSave(f)} style={{...BTN('#22c55e'),width:'100%',padding:14,fontSize:15,marginTop:4}}>บันทึกและเริ่ม →</button>
      </div>
    </div>
  )
}

// ── PLAN SCREEN ───────────────────────────────────────────────────────────────
function PlanScreen({week,onUpdate,valResult,valLoad,onValidate,onGoLog,saving}) {
  const ph = phaseObj(week.phase)
  const vc = {'ผ่าน':'#22c55e','ปรับเล็กน้อย':'#f59e0b','ต้องแก้':'#ef4444'}
  const sc = s => s>=80?'#22c55e':s>=60?'#f59e0b':'#ef4444'
  const updDay = (i,plan) => { const sessions=week.sessions.map((d,idx)=>idx===i?{...d,plan,type:guessType(plan)}:d); onUpdate({...week,sessions}) }
  return (
    <div style={{padding:'20px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <div>
          <div style={{fontSize:11,color:'#6b7280',letterSpacing:2}}>วางแผนสัปดาห์ที่</div>
          <div style={{fontSize:38,fontWeight:'bold',color:'#f9fafb',lineHeight:1}}>{week.weekNum}</div>
        </div>
        <PhasePicker phase={week.phase} onChange={p=>onUpdate({...week,phase:p})}/>
      </div>
      <div style={{background:ph.bg,border:`1px solid ${ph.color}30`,borderRadius:10,padding:'10px 14px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:10,color:ph.color,letterSpacing:1}}>{ph.label} PHASE</div><div style={{fontSize:12,color:'#9ca3af'}}>{ph.desc}</div></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:11,color:'#6b7280'}}>เป้า</span>
          <input value={week.targetVolume} onChange={e=>onUpdate({...week,targetVolume:e.target.value})} type="number" style={{...IC,width:52,textAlign:'center',padding:'4px 6px',fontSize:14,fontWeight:'bold',color:'#3b82f6'}}/>
          <span style={{fontSize:11,color:'#6b7280'}}>km</span>
        </div>
      </div>
      <div style={{background:'#0d1520',border:'1px solid #1e3a5f',borderRadius:10,padding:'9px 13px',marginBottom:14,fontSize:12,color:'#93c5fd'}}>
        💡 <span style={{color:'#60a5fa'}}>Easy 60 + Stride 100×3</span> · <span style={{color:'#f87171'}}>400×12 rest1min</span> · <span style={{color:'#34d399'}}>Long run 18km</span>
      </div>
      {week.sessions.map((d,i)=>{
        const color=S_COLORS[d.type]||'#6b7280', icon=S_ICONS[d.type]||'🔵'
        const hasPlan=d.plan&&d.plan.trim()&&d.plan!=='-'
        const vday=valResult?.dayFeedback?.[i]
        return (
          <div key={i} style={{background:'#111827',border:`1px solid ${hasPlan?color+'50':'#1f2937'}`,borderRadius:12,marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px'}}>
              <div style={{width:34,textAlign:'center',flexShrink:0}}>
                <div style={{fontSize:9,color:'#6b7280'}}>{DAY_SHORT[i]}</div>
                <div style={{fontSize:18,lineHeight:1.4}}>{icon}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color,fontWeight:'bold',marginBottom:3}}>{d.day}</div>
                <input value={d.plan} onChange={e=>updDay(i,e.target.value)} placeholder="พัก / Easy 60 min / 400×12 rest1min ..." style={{...IC,padding:'7px 10px',fontSize:13,border:'none',background:'#1a2030'}}/>
              </div>
              {d.done&&<div style={{fontSize:14}}>✅</div>}
            </div>
            {vday&&!vday.ok&&vday.comment&&<div style={{padding:'4px 14px 8px 60px',fontSize:11,color:'#fbbf24'}}>⚠️ {vday.comment}</div>}
            {vday&&vday.ok&&vday.comment&&<div style={{padding:'4px 14px 8px 60px',fontSize:11,color:'#374151'}}>✓ {vday.comment}</div>}
          </div>
        )
      })}
      <button onClick={onValidate} disabled={valLoad} style={{...BTN(valLoad?'#1f2937':'#7c3aed','#fff'),width:'100%',marginTop:4,marginBottom:10}}>
        {valLoad?'⏳ AI กำลังตรวจ...':'🔍 ตรวจโปรแกรม (Plan Validator)'}
      </button>
      {valResult&&!valResult.error&&(
        <div style={{background:'#0d1117',border:`1px solid ${(vc[valResult.verdict]||'#374151')+'50'}`,borderRadius:14,padding:16,marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:11,color:'#6b7280',letterSpacing:2}}>PLAN VALIDATOR</div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontSize:22,fontWeight:'bold',color:sc(valResult.score||0)}}>{valResult.score}</div>
              <div style={{background:(vc[valResult.verdict]||'#374151')+'25',color:vc[valResult.verdict]||'#9ca3af',padding:'3px 10px',borderRadius:99,fontSize:12,fontWeight:'bold'}}>{valResult.verdict}</div>
            </div>
          </div>
          <div style={{fontSize:13,color:'#d1d5db',marginBottom:12,lineHeight:1.6}}>{valResult.summary}</div>
          {valResult.checks?.map((c,i)=>(
            <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:5,fontSize:12}}>
              <span style={{color:c.pass?'#22c55e':'#ef4444',flexShrink:0}}>{c.pass?'✓':'✗'}</span>
              <div><span style={{color:c.pass?'#9ca3af':'#fca5a5',fontWeight:'bold'}}>{c.rule}</span>{c.comment&&<span style={{color:'#6b7280'}}> — {c.comment}</span>}</div>
            </div>
          ))}
          {valResult.suggestions?.length>0&&(
            <div style={{background:'#0f1a30',borderRadius:8,padding:10,marginTop:10}}>
              {valResult.suggestions.map((s,i)=><div key={i} style={{fontSize:12,color:'#93c5fd',marginBottom:3}}>→ {s}</div>)}
            </div>
          )}
        </div>
      )}
      {valResult?.error&&<div style={{background:'#1c0a0a',border:'1px solid #7f1d1d',borderRadius:10,padding:12,color:'#fca5a5',fontSize:12,marginBottom:10}}>{valResult.error}</div>}
      <button onClick={onGoLog} style={{...BTN('#3b82f6','#fff'),width:'100%',fontSize:14}}>✏️ ไปบันทึกผลการซ้อม →</button>
      {saving&&<div style={{textAlign:'center',fontSize:11,color:'#4b5563',marginTop:8}}>⏳ กำลังบันทึก...</div>}
    </div>
  )
}

// ── LOG SCREEN ────────────────────────────────────────────────────────────────
function LogScreen({week,onUpdate,activeDay,setActiveDay,onBack,saving}) {
  const updAct = (di,field,val) => { const sessions=week.sessions.map((d,i)=>i===di?{...d,[field]:val}:d); onUpdate({...week,sessions}) }
  const vol=totalVol(week), pct=Math.min(100,(vol/(week.targetVolume||1))*100)
  return (
    <div style={{padding:'20px 16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:'#22c55e',fontSize:22,cursor:'pointer'}}>←</button>
        <div>
          <div style={{fontSize:18,fontWeight:'bold',color:'#f9fafb'}}>บันทึกผลการซ้อม</div>
          <div style={{fontSize:12,color:'#6b7280'}}>W{week.weekNum} — {doneSess(week)}/{planSess(week)} session {saving&&'• saving...'}</div>
        </div>
      </div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6}}>
          <span style={{color:'#9ca3af'}}>Volume สะสม</span>
          <span style={{color:pct>=100?'#22c55e':'#3b82f6',fontWeight:'bold'}}>{vol.toFixed(1)} / {week.targetVolume} km ({pct.toFixed(0)}%)</span>
        </div>
        <div style={{background:'#1f2937',borderRadius:99,height:10}}>
          <div style={{width:`${pct}%`,background:pct>=100?'#22c55e':'#3b82f6',borderRadius:99,height:10,transition:'width 0.4s'}}/>
        </div>
        <div style={{display:'flex',gap:5,marginTop:10,justifyContent:'center'}}>
          {week.sessions.map((d,i)=>{
            const color=S_COLORS[d.type]||'#4b5563'
            return <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <div style={{width:28,height:28,borderRadius:6,background:d.done?color+'30':'#1f2937',border:`1px solid ${d.done?color:'#374151'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,cursor:'pointer'}} onClick={()=>setActiveDay(activeDay===i?null:i)}>
                {d.done?S_ICONS[d.type]||'✓':d.type==='rest'?'💤':'○'}
              </div>
              <div style={{fontSize:8,color:'#4b5563'}}>{DAY_SHORT[i]}</div>
            </div>
          })}
        </div>
      </div>
      {week.sessions.map((d,i)=>{
        const color=S_COLORS[d.type]||'#6b7280', open=activeDay===i
        const hasPlan=d.plan&&d.plan.trim()&&d.plan!=='-'
        return (
          <div key={i} style={{background:'#111827',border:`1px solid ${d.done?color+'60':'#1f2937'}`,borderRadius:12,marginBottom:8,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}} onClick={()=>setActiveDay(open?null:i)}>
              <input type="checkbox" checked={d.done} onChange={e=>{e.stopPropagation();updAct(i,'done',e.target.checked)}} style={{width:18,height:18,accentColor:color,cursor:'pointer',flexShrink:0}} onClick={e=>e.stopPropagation()}/>
              <div style={{width:30,textAlign:'center',flexShrink:0}}>
                <div style={{fontSize:8,color:'#6b7280'}}>{DAY_SHORT[i]}</div>
                <div style={{fontSize:16}}>{S_ICONS[d.type]||'🔵'}</div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:'bold',color:d.done?color:'#9ca3af'}}>{d.day}</div>
                {hasPlan&&<div style={{fontSize:11,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>📋 {d.plan}</div>}
                {d.done&&<div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{[d.distance&&`${d.distance}km`,d.pace&&`${d.pace}min/km`,d.hr&&`HR${d.hr}`,d.rpe>0&&`RPE${d.rpe}`].filter(Boolean).join(' · ')}</div>}
              </div>
              <span style={{color:'#4b5563',fontSize:11,flexShrink:0}}>{open?'▲':'▼'}</span>
            </div>
            {open&&(
              <div style={{padding:'0 14px 16px',borderTop:'1px solid #1f2937'}}>
                {hasPlan&&<div style={{background:'#0d1520',borderRadius:8,padding:'8px 12px',margin:'10px 0 12px',fontSize:12,color:'#93c5fd'}}><span style={{color:'#4b5563'}}>แผน: </span>{d.plan}</div>}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  {[{label:'ระยะทาง (km)',key:'distance',type:'number',ph:'0.0',step:'0.1'},{label:'เวลา (นาที)',key:'duration',type:'number',ph:'60'},{label:'Pace (min/km)',key:'pace',type:'text',ph:'5:30'},{label:'HR เฉลี่ย',key:'hr',type:'number',ph:'140'}].map(({label,key,type,ph,step})=>(
                    <div key={key}><div style={{fontSize:10,color:'#6b7280',marginBottom:4}}>{label}</div>
                    <input type={type} value={d[key]||''} step={step} onChange={e=>updAct(i,key,e.target.value)} placeholder={ph} style={{...IC,padding:'8px 10px'}}/></div>
                  ))}
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#6b7280',marginBottom:6}}>
                    <span>RPE</span>
                    <span style={{color:['#22c55e','#22c55e','#22c55e','#84cc16','#84cc16','#f59e0b','#f59e0b','#f97316','#ef4444','#ef4444','#dc2626'][d.rpe||0],fontWeight:'bold',fontSize:16}}>{d.rpe||0}/10</span>
                  </div>
                  <input type="range" min="0" max="10" value={d.rpe||0} onChange={e=>updAct(i,'rpe',+e.target.value)} style={{width:'100%',accentColor:color}}/>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#4b5563'}}><span>สบาย</span><span>ปานกลาง</span><span>หนักมาก</span></div>
                </div>
                <div style={{marginBottom:10}}><div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>ความรู้สึก</div><input value={d.feel||''} onChange={e=>updAct(i,'feel',e.target.value)} style={{...IC,padding:'8px 10px'}} placeholder="ขา ฟอร์ม HR..."/></div>
                <div><div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>รายละเอียดเพิ่มเติม</div><textarea value={d.notes||''} onChange={e=>updAct(i,'notes',e.target.value)} style={{...IC,height:60,resize:'none',fontSize:12}} placeholder="Split time, รอบที่ทำได้, สภาพอากาศ, บาดเจ็บ..."/></div>
              </div>
            )}
          </div>
        )
      })}
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14,marginTop:4}}>
        <div style={{fontSize:11,color:'#6b7280',marginBottom:6}}>📝 NOTE สัปดาห์นี้</div>
        <textarea value={week.notes} onChange={e=>onUpdate({...week,notes:e.target.value})} placeholder="ชีวิต นอน งาน ครอบครัว..." style={{...IC,height:70,resize:'none',fontSize:13}}/>
      </div>
    </div>
  )
}

// ── SUMMARY SCREEN ────────────────────────────────────────────────────────────
function SummaryScreen({week,profile,aiResult,aiLoad,onAnalyze,onApply,onArchive,onGoLog}) {
  const ph=phaseObj(week.phase), vol=totalVol(week), pct=Math.min(100,(vol/(week.targetVolume||1))*100)
  const DC={'เพิ่ม':'#22c55e','คงที่':'#3b82f6','ถอย':'#f59e0b','DownWeek':'#a78bfa'}
  return (
    <div style={{padding:'20px 16px'}}>
      <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:4}}>สรุปสัปดาห์ที่</div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div style={{fontSize:38,fontWeight:'bold',color:'#f9fafb'}}>{week.weekNum}</div>
        <div style={{background:ph.bg,color:ph.color,border:`1px solid ${ph.color}40`,borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:'bold',letterSpacing:2}}>{ph.label}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
        {[{l:'Volume',v:`${vol.toFixed(1)}`,u:'km',c:'#3b82f6'},{l:'Sessions',v:`${doneSess(week)}`,u:`/${planSess(week)}`,c:'#22c55e'},{l:'Avg RPE',v:avgRPE(week),u:'/10',c:'#f59e0b'},{l:'เป้า',v:`${pct.toFixed(0)}`,u:'%',c:pct>=100?'#22c55e':'#6b7280'}].map(s=>(
          <div key={s.l} style={{background:'#0d1117',border:'1px solid #1f2937',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
            <div style={{fontSize:9,color:'#6b7280'}}>{s.l}</div>
            <div style={{fontSize:19,fontWeight:'bold',color:s.c,lineHeight:1.2}}>{s.v}<span style={{fontSize:10,color:'#6b7280'}}>{s.u}</span></div>
          </div>
        ))}
      </div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:12}}>PLAN vs ACTUAL</div>
        {week.sessions.map((d,i)=>{
          const color=S_COLORS[d.type]||'#4b5563', hasPlan=d.plan&&d.plan.trim()&&d.plan!=='-'
          if(!hasPlan&&!d.done) return null
          return (
            <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid #1f2937'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}><span>{S_ICONS[d.type]||'🔵'}</span><span style={{fontSize:13,fontWeight:'bold',color}}>{d.day}</span></div>
              {hasPlan&&<div style={{fontSize:11,color:'#374151',paddingLeft:22,marginBottom:2}}>📋 {d.plan}</div>}
              {d.done?<div style={{paddingLeft:22}}>
                <div style={{fontSize:11,color:'#86efac'}}>✓ {[d.distance&&`${d.distance}km`,d.pace&&`Pace ${d.pace}`,d.hr&&`HR ${d.hr}`,d.rpe>0&&`RPE ${d.rpe}`].filter(Boolean).join(' · ')}</div>
                {d.feel&&<div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>💬 "{d.feel}"</div>}
                {d.notes&&<div style={{fontSize:11,color:'#4b5563',marginTop:1}}>📝 {d.notes}</div>}
              </div>:hasPlan&&d.type!=='rest'?<div style={{fontSize:11,color:'#7f1d1d',paddingLeft:22}}>✗ ไม่ได้ทำ</div>:null}
            </div>
          )
        })}
        {week.notes&&<div style={{fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>📝 "{week.notes}"</div>}
      </div>
      {!aiResult&&<button onClick={onAnalyze} disabled={aiLoad} style={{...BTN(aiLoad?'#374151':'#22c55e',aiLoad?'#9ca3af':'#000'),width:'100%',marginBottom:10}}>{aiLoad?'⏳ AI กำลังวิเคราะห์...':'🤖 ให้ AI วิเคราะห์ + ออกโปรแกรมสัปดาห์หน้า'}</button>}
      {aiResult&&!aiResult.error&&(
        <div style={{background:'#0d1117',border:`1px solid ${(DC[aiResult.decision]||'#374151')+'50'}`,borderRadius:14,padding:16,marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:11,color:'#6b7280',letterSpacing:2}}>AI COACH</div>
            <div style={{background:(DC[aiResult.decision]||'#374151')+'25',color:DC[aiResult.decision]||'#9ca3af',padding:'3px 12px',borderRadius:99,fontSize:12,fontWeight:'bold'}}>{aiResult.decision}</div>
          </div>
          <div style={{fontSize:13,color:'#d1d5db',marginBottom:10,lineHeight:1.65}}>{aiResult.assessment}</div>
          {aiResult.signals?.map((s,i)=><div key={i} style={{fontSize:12,color:'#6b7280',marginBottom:3}}>• {s}</div>)}
          <div style={{fontSize:12,color:'#9ca3af',margin:'8px 0',fontStyle:'italic'}}>{aiResult.reason}</div>
          {aiResult.nextPlan&&<div style={{background:'#111827',borderRadius:10,padding:12,marginTop:10}}>
            <div style={{fontSize:11,color:'#6b7280',marginBottom:8}}>โปรแกรมสัปดาห์หน้า — Vol {aiResult.nextVolume} km</div>
            {aiResult.nextPlan.map((s,i)=><div key={i} style={{display:'flex',gap:8,marginBottom:5,fontSize:12}}><span style={{color:'#4b5563',width:42,flexShrink:0}}>{s.day.slice(0,3)}</span><span style={{flexShrink:0}}>{S_ICONS[guessType(s.plan)]||'🔵'}</span><span style={{color:'#d1d5db'}}>{s.plan}</span></div>)}
          </div>}
          {aiResult.coachTip&&<div style={{background:'#0f2015',border:'1px solid #22c55e20',borderRadius:8,padding:10,fontSize:12,color:'#86efac',marginTop:10}}>💡 {aiResult.coachTip}</div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}>
            <button onClick={onApply} style={BTN('#22c55e')}>✅ ใช้โปรแกรม AI</button>
            <button onClick={onAnalyze} style={BTN('#1f2937','#9ca3af')}>🔄 วิเคราะห์ใหม่</button>
          </div>
        </div>
      )}
      {aiResult?.error&&<div style={{background:'#1c0a0a',border:'1px solid #7f1d1d',borderRadius:10,padding:12,color:'#fca5a5',fontSize:12,marginBottom:10}}>{aiResult.error}</div>}
      <button onClick={onGoLog} style={{...BTN('#1f2937','#9ca3af'),width:'100%',marginBottom:8}}>✏️ กลับไปแก้ไขข้อมูล</button>
      <button onClick={onArchive} style={{...BTN('#111827','#6b7280'),width:'100%',fontSize:12}}>เก็บสัปดาห์นี้และเริ่มสัปดาห์ใหม่</button>
    </div>
  )
}

// ── HISTORY SCREEN ────────────────────────────────────────────────────────────
function HistoryScreen({history,onBack}) {
  const [idx,setIdx]=useState(0)
  if(!history.length) return <div style={{padding:'20px 16px'}}><button onClick={onBack} style={{background:'none',border:'none',color:'#22c55e',fontSize:22,cursor:'pointer',marginBottom:20}}>←</button><div style={{textAlign:'center',color:'#6b7280',marginTop:100}}>ยังไม่มีประวัติ</div></div>
  const w=history[history.length-1-idx], ph=phaseObj(w.phase), vol=totalVol(w)
  return (
    <div style={{padding:'20px 16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:'#22c55e',fontSize:22,cursor:'pointer'}}>←</button>
        <div><div style={{fontSize:18,fontWeight:'bold',color:'#f9fafb'}}>ประวัติการซ้อม</div><div style={{fontSize:12,color:'#6b7280'}}>{history.length} สัปดาห์</div></div>
      </div>
      <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:6,marginBottom:14}}>
        {history.slice().reverse().map((w2,i)=>{const c=phaseObj(w2.phase).color;return<button key={i} onClick={()=>setIdx(i)} style={{flexShrink:0,padding:'5px 12px',borderRadius:99,border:`1px solid ${i===idx?c:'#374151'}`,background:i===idx?c+'20':'transparent',color:i===idx?c:'#6b7280',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>W{w2.weekNum}</button>})}
      </div>
      <div style={{background:'#111827',border:`1px solid ${ph.color}30`,borderRadius:14,padding:16,marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
          <div><div style={{fontSize:26,fontWeight:'bold',color:'#f9fafb'}}>สัปดาห์ที่ {w.weekNum}</div><div style={{fontSize:11,color:'#6b7280'}}>{w.archivedAt?new Date(w.archivedAt).toLocaleDateString('th-TH'):''}</div></div>
          <div style={{background:ph.bg,color:ph.color,border:`1px solid ${ph.color}40`,borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:'bold'}}>{ph.label}</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
          {[{l:'Volume',v:`${vol.toFixed(1)}km`,c:'#3b82f6'},{l:'Sessions',v:`${doneSess(w)}/${planSess(w)}`,c:'#22c55e'},{l:'Avg RPE',v:`${avgRPE(w)}/10`,c:'#f59e0b'},{l:'Long Run',v:`${lrKm(w)}km`,c:'#a78bfa'}].map(s=><div key={s.l} style={{background:'#0d1117',borderRadius:8,padding:'8px 6px',textAlign:'center'}}><div style={{fontSize:9,color:'#6b7280'}}>{s.l}</div><div style={{fontSize:14,fontWeight:'bold',color:s.c,marginTop:2}}>{s.v}</div></div>)}
        </div>
        {w.sessions?.filter(d=>d.plan||d.done).map((d,i)=>(
          <div key={i} style={{borderBottom:'1px solid #1f2937',padding:'5px 0'}}>
            <div style={{fontSize:12,color:S_COLORS[d.type]||'#4b5563'}}>{S_ICONS[d.type]||'🔵'} {d.day}{d.plan&&<span style={{color:'#374151'}}> — {d.plan}</span>}</div>
            {d.done&&<div style={{fontSize:11,color:'#86efac',paddingLeft:20}}>✓ {[d.distance&&`${d.distance}km`,d.pace&&`Pace ${d.pace}`,d.hr&&`HR ${d.hr}`,d.rpe>0&&`RPE ${d.rpe}`].filter(Boolean).join(' · ')}{d.feel&&<span style={{color:'#6b7280'}}> · "{d.feel}"</span>}</div>}
            {d.notes&&<div style={{fontSize:11,color:'#4b5563',paddingLeft:20}}>📝 {d.notes}</div>}
          </div>
        ))}
        {w.notes&&<div style={{marginTop:8,fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>📝 "{w.notes}"</div>}
      </div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14}}>
        <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:12}}>VOLUME TREND</div>
        <div style={{display:'flex',alignItems:'flex-end',gap:5,height:80}}>
          {history.slice(-12).map((w2,i)=>{
            const v=totalVol(w2),max=Math.max(...history.slice(-12).map(x=>totalVol(x)),1),h=Math.max(4,(v/max)*72),isSel=history.length-1-idx===i
            return <div key={i} onClick={()=>setIdx(history.length-1-i)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',cursor:'pointer'}}>
              <div style={{fontSize:9,color:isSel?'#f9fafb':'#4b5563',marginBottom:2}}>{v.toFixed(0)}</div>
              <div style={{width:'100%',height:h,background:phaseObj(w2.phase).color,borderRadius:'3px 3px 0 0',opacity:isSel?1:0.4}}/>
              <div style={{fontSize:8,color:'#4b5563',marginTop:2}}>W{w2.weekNum}</div>
            </div>
          })}
        </div>
      </div>
    </div>
  )
}

// ── SHARED ────────────────────────────────────────────────────────────────────
function PhasePicker({phase,onChange}) {
  const ph=phaseObj(phase),[open,setOpen]=useState(false)
  return <div style={{position:'relative'}}>
    <div onClick={()=>setOpen(!open)} style={{background:ph.bg,color:ph.color,border:`1px solid ${ph.color}40`,borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:'bold',letterSpacing:2,cursor:'pointer'}}>{ph.label} ▾</div>
    {open&&<div style={{position:'absolute',right:0,top:32,background:'#111827',border:'1px solid #374151',borderRadius:8,zIndex:50,overflow:'hidden',minWidth:100}}>
      {PHASES.map(p=><div key={p.id} onClick={()=>{onChange(p.id);setOpen(false)}} style={{padding:'8px 16px',color:p.color,fontSize:12,cursor:'pointer',fontWeight:'bold',background:phase===p.id?p.bg:'transparent'}}>{p.label}</div>)}
    </div>}
  </div>
}

function BottomNav({screen,setScreen,done,planned}) {
  return <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#0d1117',borderTop:'1px solid #1f2937',display:'flex',justifyContent:'space-around',padding:'10px 0 16px',zIndex:100}}>
    {[{id:'plan',icon:'📋',label:'วางแผน'},{id:'log',icon:'✏️',label:'บันทึก'},{id:'summary',icon:'🤖',label:'สรุป/AI'},{id:'history',icon:'📊',label:'ประวัติ'}].map(item=>(
      <button key={item.id} onClick={()=>setScreen(item.id)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,color:screen===item.id?'#22c55e':'#4b5563',fontFamily:'inherit',position:'relative'}}>
        <span style={{fontSize:20}}>{item.icon}</span>
        <span style={{fontSize:9,letterSpacing:1}}>{item.label}</span>
        {item.id==='log'&&done>0&&<span style={{position:'absolute',top:-2,right:-4,background:'#22c55e',color:'#000',borderRadius:99,fontSize:9,padding:'0 5px',fontWeight:'bold'}}>{done}</span>}
      </button>
    ))}
  </div>
}

function Loader() { return <div style={{background:'#0a0f1a',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'#22c55e',fontFamily:'monospace'}}>⏳ กำลังโหลด...</div> }
