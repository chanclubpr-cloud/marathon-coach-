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

const guessType = t => {
  const s=(t||'').toLowerCase()
  if(!t||t.includes('พัก')||s==='rest'||s==='-'||s==='') return 'rest'
  if(s.includes('long run')||s.includes('longrun')) return 'longrun'
  if(s.includes('interval')||/\d00\s*[×x*]/.test(s)||/[×x*]\s*\d{2,}/.test(s)) return 'interval'
  if(s.includes('tempo')||s.includes('threshold')) return 'tempo'
  if(s.includes('fastlek')||s.includes('fartlek')||s.includes('สลับ')) return 'fastlek'
  if(s.includes('stride')||s.includes('สตรายด์')) return 'stride'
  if(s.includes('easy')||s.includes('อีซี่')) return 'easy'
  return 'other'
}

const emptyDay=(day,idx)=>({day,dayIndex:idx,plan:'',type:'rest',done:false,distance:'',duration:'',pace:'',hr:'',rpe:0,feel:'',notes:''})
const emptyWeek=(num=1,phase='base')=>({weekNum:num,phase,targetVolume:40,notes:'',sessions:DAYS.map((d,i)=>emptyDay(d,i))})
const phaseObj=id=>PHASES.find(p=>p.id===id)||PHASES[0]
const totalVol=w=>w.sessions.reduce((s,d)=>s+(d.done?+d.distance||0:0),0)
const doneSess=w=>w.sessions.filter(d=>d.done&&d.type!=='rest').length
const planSess=w=>w.sessions.filter(d=>d.plan&&d.type!=='rest').length
const avgRPE=w=>{const a=w.sessions.filter(d=>d.done&&d.rpe>0);return a.length?(a.reduce((s,d)=>s+ +d.rpe,0)/a.length).toFixed(1):'-'}
const lrKm=w=>{const lr=w.sessions.find(d=>d.type==='longrun'&&d.done);return lr?+lr.distance||0:0}

// ── PACE UTILS ────────────────────────────────────────────────────────────────
const paceToDecimal=str=>{
  if(!str) return 6.0
  const s=String(str).trim()
  if(s.includes(':')){const[m,sec]=s.split(':').map(Number);if(isNaN(m)||isNaN(sec)||sec>=60) return 6.0;return m+sec/60}
  return parseFloat(s)||6.0
}
const decimalToPace=dec=>{
  if(!dec||isNaN(dec)) return '--:--'
  const m=Math.floor(dec),sec=Math.round((dec-m)*60)
  return `${m}:${String(sec).padStart(2,'0')}`
}

const IC={background:'#0d1117',border:'1px solid #374151',borderRadius:8,color:'#f9fafb',padding:'9px 12px',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}
const BTN=(bg,fg='#000')=>({background:bg,color:fg,border:'none',borderRadius:10,padding:'11px 16px',cursor:'pointer',fontWeight:'bold',fontSize:13,fontFamily:'inherit'})

// ── ANTHROPIC API ─────────────────────────────────────────────────────────────
async function callClaude(sys,usr){
  const apiKey=import.meta.env.VITE_ANTHROPIC_API_KEY
  const res=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1200,system:sys,messages:[{role:'user',content:usr}]})
  })
  const d=await res.json()
  return d.content?.[0]?.text||''
}

// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const[ready,setReady]=useState(false)
  const[userId,setUserId]=useState(null)
  const[profile,setProfile]=useState(null)
  const[week,setWeek]=useState(emptyWeek())
  const[weekId,setWeekId]=useState(null)
  const[history,setHistory]=useState([])
  const[zones,setZones]=useState(null)
  const[screen,setScreen]=useState('plan')
  const[aiResult,setAiResult]=useState(null)
  const[aiLoad,setAiLoad]=useState(false)
  const[valResult,setValResult]=useState(null)
  const[valLoad,setValLoad]=useState(false)
  const[activeDay,setActiveDay]=useState(null)
  const[saving,setSaving]=useState(false)
  const[loginName,setLoginName]=useState('')
  const[loginErr,setLoginErr]=useState('')

  useEffect(()=>{
    (async()=>{
      const uid=localStorage.getItem('mc_uid')
      if(uid){setUserId(uid);await loadData(uid)}
      else setReady(true)
    })()
  },[])

  const loadData=useCallback(async(uid)=>{
    try{
      const{data:prof}=await supabase.from('profiles').select('*').eq('user_id',uid).single()
      if(prof) setProfile(prof)
      const{data:wks}=await supabase.from('weeks').select('*').eq('user_id',uid).is('archived_at',null).order('week_num',{ascending:false}).limit(1)
      if(wks?.length){
        const w=wks[0];setWeekId(w.id)
        const{data:sess}=await supabase.from('sessions').select('*').eq('week_id',w.id).order('day_index')
        setWeek({weekNum:w.week_num,phase:w.phase,targetVolume:w.target_volume,notes:w.notes||'',sessions:sess||DAYS.map((d,i)=>emptyDay(d,i))})
      }
      const{data:hist}=await supabase.from('weeks').select('*, sessions(*)').eq('user_id',uid).not('archived_at','is',null).order('week_num')
      if(hist) setHistory(hist.map(w=>({weekNum:w.week_num,phase:w.phase,targetVolume:w.target_volume,notes:w.notes||'',archivedAt:w.archived_at,sessions:(w.sessions||[]).sort((a,b)=>a.day_index-b.day_index)})))
      const{data:z}=await supabase.from('zones').select('*').eq('user_id',uid).order('tested_at',{ascending:false}).limit(1)
      if(z?.length) setZones(z[0])
    }catch(e){console.error(e)}
    setReady(true)
  },[])

  const handleLogin=async()=>{
    const uid=loginName.trim().toLowerCase()
    if(!uid){setLoginErr('กรุณากรอกชื่อหรือ Email');return}
    setUserId(uid);localStorage.setItem('mc_uid',uid);await loadData(uid)
  }

  const save=async(k,v)=>{try{await supabase.from('weeks').update({[k]:v}).eq('id',weekId)}catch(e){console.error(e)}}

  const saveWeekToDb=useCallback(async(w,wid)=>{
    if(!userId) return;setSaving(true)
    try{
      let cwid=wid
      if(!cwid){
        const{data}=await supabase.from('weeks').insert({user_id:userId,week_num:w.weekNum,phase:w.phase,target_volume:w.targetVolume,notes:w.notes}).select().single()
        cwid=data.id;setWeekId(cwid)
      }else{
        await supabase.from('weeks').update({phase:w.phase,target_volume:w.targetVolume,notes:w.notes}).eq('id',cwid)
      }
      for(const s of w.sessions){
        await supabase.from('sessions').upsert({week_id:cwid,user_id:userId,day_name:s.day,day_index:s.dayIndex||DAYS.indexOf(s.day),plan:s.plan||'',session_type:s.type||'rest',done:s.done||false,distance:+s.distance||0,duration:+s.duration||0,pace:s.pace||'',hr:+s.hr||null,rpe:+s.rpe||0,feel:s.feel||'',notes:s.notes||''},{onConflict:'week_id,day_name'})
      }
    }catch(e){console.error(e)}
    setSaving(false)
  },[userId])

  const updateWeek=w=>{setWeek(w);clearTimeout(window._st);window._st=setTimeout(()=>saveWeekToDb(w,weekId),1500)}

  const saveProfile=async p=>{
    setProfile(p)
    await supabase.from('profiles').upsert({user_id:userId,target_pace:p.targetPace,race_date:p.raceDate,phase:p.phase,max_long_run:+p.maxLongRun,week_num:+p.weekNum},{onConflict:'user_id'})
    const nw=emptyWeek(+p.weekNum||1,p.phase)
    const{data}=await supabase.from('weeks').insert({user_id:userId,week_num:nw.weekNum,phase:nw.phase,target_volume:nw.targetVolume,notes:''}).select().single()
    setWeekId(data.id);setWeek(nw);setScreen('plan')
  }

  const saveZones=async zData=>{
    const{data}=await supabase.from('zones').insert({user_id:userId,...zData}).select().single()
    setZones(data)
  }

  const archiveAndNext=async nextWeek=>{
    if(!weekId) return
    await supabase.from('weeks').update({archived_at:new Date().toISOString()}).eq('id',weekId)
    const nw=nextWeek||emptyWeek((week.weekNum||1)+1,week.phase)
    const{data}=await supabase.from('weeks').insert({user_id:userId,week_num:nw.weekNum,phase:nw.phase,target_volume:nw.targetVolume,notes:''}).select().single()
    const nwid=data.id
    if(nw.sessions?.some(s=>s.plan)){
      for(const s of nw.sessions) await supabase.from('sessions').insert({week_id:nwid,user_id:userId,day_name:s.day,day_index:DAYS.indexOf(s.day),plan:s.plan||'',session_type:s.type||'rest',done:false})
    }
    setWeekId(nwid);setWeek(nw)
    setHistory(h=>[...h,{...week,archivedAt:new Date().toISOString()}])
    setAiResult(null);setValResult(null);setScreen('plan')
  }

  const validatePlan=async()=>{
    setValLoad(true);setValResult(null)
    try{
      const sys=`คุณคือโค้ชมาราธอน Elite ตรวจโปรแกรมว่าถูกหลักการสากล 80/20, Progressive Overload, Stress-Recovery, Phase Specificity ไหม ตอบ JSON เท่านั้น ไม่มี markdown`
      const planText=week.sessions.map((d,i)=>`${DAY_SHORT[i]} ${d.day}: ${d.plan||'พัก'}`).join('\n')
      const zoneInfo=zones?`Zone ของนักวิ่ง: Easy ${zones.fatmax_slow}-${zones.lt1_fast} / Threshold ${zones.lt2_slow}-${zones.lt2_fast} / Marathon Pace ${zones.marathon_pace}`:'(ยังไม่มีข้อมูล Zone)'
      const usr=`Phase: ${week.phase} | W${week.weekNum} | เป้า: ${week.targetVolume}km | Pace: ${profile?.targetPace||'5:30'}\n${zoneInfo}\n\nโปรแกรม:\n${planText}\n\nตอบ JSON:\n{"verdict":"ผ่าน|ปรับเล็กน้อย|ต้องแก้","score":85,"summary":"สรุป 1-2 ประโยค","checks":[{"rule":"80/20 Rule","pass":true,"comment":"..."},{"rule":"วันหนักไม่ติดกัน","pass":true,"comment":"..."},{"rule":"Long Run","pass":true,"comment":"..."},{"rule":"Phase Specificity","pass":true,"comment":"..."},{"rule":"Volume","pass":true,"comment":"..."}],"dayFeedback":[{"day":"จันทร์","ok":true,"comment":""},{"day":"อังคาร","ok":true,"comment":""},{"day":"พุธ","ok":true,"comment":""},{"day":"พฤหัส","ok":true,"comment":""},{"day":"ศุกร์","ok":true,"comment":""},{"day":"เสาร์","ok":true,"comment":""},{"day":"อาทิตย์","ok":true,"comment":""}],"suggestions":["แนะนำ1"]}`
      const raw=await callClaude(sys,usr)
      setValResult(JSON.parse(raw.replace(/```json|```/g,'').trim()))
    }catch(e){setValResult({error:'ตรวจไม่สำเร็จ: '+e.message})}
    setValLoad(false)
  }

  const runAI=async()=>{
    setAiLoad(true);setAiResult(null)
    try{
      const sys=`คุณคือโค้ชมาราธอน Elite ใช้หลักการ Maffetone, Daniels, Seiler 80/20, Norwegian Method ตอบภาษาไทย กระชับ ตอบ JSON เท่านั้น ไม่มี markdown`
      const planText=week.sessions.map(d=>`${d.day}: ${d.plan||(d.type==='rest'?'พัก':'ไม่ได้วาง')}`).join('\n')
      const actText=week.sessions.map(d=>`${d.day}: ${d.done?`✓ ${d.distance}km pace:${d.pace} HR:${d.hr} RPE:${d.rpe} "${d.feel}"`:d.type==='rest'?'พัก':'ไม่ได้ทำ'}`).join('\n')
      const prevText=history.slice(-3).map(w2=>`W${w2.weekNum}[${w2.phase}]: vol=${totalVol(w2).toFixed(1)}km sessions=${doneSess(w2)}/${planSess(w2)} RPE=${avgRPE(w2)} LR=${lrKm(w2)}km`).join('\n')
      const zoneInfo=zones?`Zone ของนักวิ่ง: Easy ${zones.fatmax_slow}-${zones.lt1_fast} | Moderate ${zones.moderate_slow}-${zones.moderate_fast} | Threshold ${zones.lt2_slow}-${zones.lt2_fast} | Marathon Pace ${zones.marathon_pace} | VO2max ${zones.vo2max?.toFixed(1)}`:'(ยังไม่ได้ทำ Speed Test)'
      const usr=`นักวิ่ง: Pace ${profile?.targetPace||'5:30'} | Phase: ${week.phase} | W${week.weekNum}\n${zoneInfo}\nแผน:\n${planText}\nจริง:\n${actText}\nVol: ${totalVol(week).toFixed(1)}/${week.targetVolume}km | Sessions: ${doneSess(week)}/${planSess(week)} | RPE: ${avgRPE(week)} | LR: ${lrKm(week)}km\nNote: ${week.notes||'(ไม่มี)'}\nประวัติ:\n${prevText||'(ยังไม่มี)'}\n\nตอบ JSON: {"assessment":"...","signals":["s1","s2","s3"],"decision":"เพิ่ม|คงที่|ถอย|DownWeek","reason":"...","nextPhase":"${week.phase}","nextVolume":42,"coachTip":"...","nextPlan":[{"day":"จันทร์","plan":"พัก"},{"day":"อังคาร","plan":"Easy 60 นาที + Stride ×4"},{"day":"พุธ","plan":"Fastlek 1/1 ×18"},{"day":"พฤหัส","plan":"พัก"},{"day":"ศุกร์","plan":"Long run 20 km Easy"},{"day":"เสาร์","plan":"Easy 50 นาที + Stride ×4"},{"day":"อาทิตย์","plan":"พัก"}]}`
      const raw=await callClaude(sys,usr)
      setAiResult(JSON.parse(raw.replace(/```json|```/g,'').trim()))
    }catch(e){setAiResult({error:'วิเคราะห์ไม่สำเร็จ: '+e.message})}
    setAiLoad(false)
  }

  const applyAIPlan=()=>{
    if(!aiResult?.nextPlan) return
    const nw={...emptyWeek((week.weekNum||1)+1,aiResult.nextPhase||week.phase),targetVolume:aiResult.nextVolume||week.targetVolume,sessions:DAYS.map((dayName,i)=>{const ai=aiResult.nextPlan.find(x=>x.day===dayName);const p=ai?.plan||'';return{...emptyDay(dayName,i),plan:p,type:guessType(p)}})}
    archiveAndNext(nw)
  }

  if(!ready) return <Loader/>
  if(!userId) return <LoginScreen name={loginName} setName={setLoginName} err={loginErr} onLogin={handleLogin}/>
  if(!profile) return <SetupScreen userId={userId} onSave={saveProfile}/>

  const screens={
    plan:    <PlanScreen    week={week} onUpdate={updateWeek} valResult={valResult} valLoad={valLoad} onValidate={validatePlan} onGoLog={()=>setScreen('log')} saving={saving}/>,
    log:     <LogScreen     week={week} onUpdate={updateWeek} activeDay={activeDay} setActiveDay={setActiveDay} onBack={()=>setScreen('plan')} saving={saving}/>,
    summary: <SummaryScreen week={week} profile={profile} aiResult={aiResult} aiLoad={aiLoad} onAnalyze={runAI} onApply={applyAIPlan} onArchive={()=>archiveAndNext()} onGoLog={()=>setScreen('log')}/>,
    volume:  <VolumeScreen  profile={profile} zones={zones}/>,
    zone:    <ZoneScreen    userId={userId} zones={zones} onSave={saveZones}/>,
    history: <HistoryScreen history={history} onBack={()=>setScreen('plan')}/>,
  }

  return(
    <div style={{background:'#0a0f1a',minHeight:'100vh',color:'#e2e8f0',fontFamily:"'Courier New',monospace",paddingBottom:72}}>
      <div style={{background:'#0d1117',borderBottom:'1px solid #1f2937',padding:'8px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontSize:13,fontWeight:'bold',color:'#22c55e',letterSpacing:2}}>🏃 MARATHON COACH</div>
        <div style={{fontSize:11,color:'#4b5563'}}>{userId}{saving&&' • saving...'}</div>
      </div>
      {screens[screen]||screens.plan}
      <BottomNav screen={screen} setScreen={setScreen} done={doneSess(week)} hasZone={!!zones}/>
    </div>
  )
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({name,setName,err,onLogin}){
  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a0f1a,#0f1f10)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{fontSize:56,marginBottom:8}}>🏃</div>
      <div style={{fontSize:28,fontWeight:'bold',color:'#22c55e',letterSpacing:3,marginBottom:4}}>MARATHON COACH</div>
      <div style={{color:'#6b7280',marginBottom:40,fontSize:13}}>Self-Coached Marathon Platform</div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:16,padding:28,width:'100%',maxWidth:380}}>
        <div style={{color:'#9ca3af',fontSize:13,marginBottom:6}}>ชื่อหรือ Email ของคุณ</div>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onLogin()} placeholder="เช่น channarong@email.com" style={IC}/>
        {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:6}}>{err}</div>}
        <div style={{fontSize:11,color:'#4b5563',marginTop:8,marginBottom:16}}>ใช้เป็น ID สำหรับดึงข้อมูลของคุณ</div>
        <button onClick={onLogin} style={{...BTN('#22c55e'),width:'100%',padding:14,fontSize:15}}>เข้าสู่ระบบ →</button>
      </div>
    </div>
  )
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
function SetupScreen({userId,onSave}){
  const[f,setF]=useState({targetPace:'5:30',raceDate:'',phase:'base',maxLongRun:15,weekNum:1})
  const s=(k,v)=>setF(x=>({...x,[k]:v}))
  return(
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
function PlanScreen({week,onUpdate,valResult,valLoad,onValidate,onGoLog,saving}){
  const ph=phaseObj(week.phase)
  const vc={'ผ่าน':'#22c55e','ปรับเล็กน้อย':'#f59e0b','ต้องแก้':'#ef4444'}
  const sc=s=>s>=80?'#22c55e':s>=60?'#f59e0b':'#ef4444'
  const updDay=(i,plan)=>{const sessions=week.sessions.map((d,idx)=>idx===i?{...d,plan,type:guessType(plan)}:d);onUpdate({...week,sessions})}
  return(
    <div style={{padding:'20px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <div><div style={{fontSize:11,color:'#6b7280',letterSpacing:2}}>วางแผนสัปดาห์ที่</div><div style={{fontSize:38,fontWeight:'bold',color:'#f9fafb',lineHeight:1}}>{week.weekNum}</div></div>
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
        const color=S_COLORS[d.type]||'#6b7280',hasPlan=d.plan&&d.plan.trim()&&d.plan!=='-'
        const vday=valResult?.dayFeedback?.[i]
        return(
          <div key={i} style={{background:'#111827',border:`1px solid ${hasPlan?color+'50':'#1f2937'}`,borderRadius:12,marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px'}}>
              <div style={{width:34,textAlign:'center',flexShrink:0}}><div style={{fontSize:9,color:'#6b7280'}}>{DAY_SHORT[i]}</div><div style={{fontSize:18,lineHeight:1.4}}>{S_ICONS[d.type]||'🔵'}</div></div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color,fontWeight:'bold',marginBottom:3}}>{d.day}</div>
                <input value={d.plan} onChange={e=>updDay(i,e.target.value)} placeholder="พัก / Easy 60 min / 400×12 rest1min ..." style={{...IC,padding:'7px 10px',fontSize:13,border:'none',background:'#1a2030'}}/>
              </div>
              {d.done&&<div style={{fontSize:14}}>✅</div>}
            </div>
            {vday&&!vday.ok&&vday.comment&&<div style={{padding:'4px 14px 8px 60px',fontSize:11,color:'#fbbf24'}}>⚠️ {vday.comment}</div>}
          </div>
        )
      })}
      <button onClick={onValidate} disabled={valLoad} style={{...BTN(valLoad?'#1f2937':'#7c3aed','#fff'),width:'100%',marginTop:4,marginBottom:10}}>{valLoad?'⏳ AI กำลังตรวจ...':'🔍 ตรวจโปรแกรม (Plan Validator)'}</button>
      {valResult&&!valResult.error&&(
        <div style={{background:'#0d1117',border:`1px solid ${(vc[valResult.verdict]||'#374151')+'50'}`,borderRadius:14,padding:16,marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:11,color:'#6b7280',letterSpacing:2}}>PLAN VALIDATOR</div>
            <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{fontSize:22,fontWeight:'bold',color:sc(valResult.score||0)}}>{valResult.score}</div><div style={{background:(vc[valResult.verdict]||'#374151')+'25',color:vc[valResult.verdict]||'#9ca3af',padding:'3px 10px',borderRadius:99,fontSize:12,fontWeight:'bold'}}>{valResult.verdict}</div></div>
          </div>
          <div style={{fontSize:13,color:'#d1d5db',marginBottom:12,lineHeight:1.6}}>{valResult.summary}</div>
          {valResult.checks?.map((c,i)=><div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:5,fontSize:12}}><span style={{color:c.pass?'#22c55e':'#ef4444',flexShrink:0}}>{c.pass?'✓':'✗'}</span><div><span style={{color:c.pass?'#9ca3af':'#fca5a5',fontWeight:'bold'}}>{c.rule}</span>{c.comment&&<span style={{color:'#6b7280'}}> — {c.comment}</span>}</div></div>)}
          {valResult.suggestions?.length>0&&<div style={{background:'#0f1a30',borderRadius:8,padding:10,marginTop:10}}>{valResult.suggestions.map((s,i)=><div key={i} style={{fontSize:12,color:'#93c5fd',marginBottom:3}}>→ {s}</div>)}</div>}
        </div>
      )}
      {valResult?.error&&<div style={{background:'#1c0a0a',border:'1px solid #7f1d1d',borderRadius:10,padding:12,color:'#fca5a5',fontSize:12,marginBottom:10}}>{valResult.error}</div>}
      <button onClick={onGoLog} style={{...BTN('#3b82f6','#fff'),width:'100%',fontSize:14}}>✏️ ไปบันทึกผลการซ้อม →</button>
    </div>
  )
}

// ── LOG SCREEN ────────────────────────────────────────────────────────────────
function LogScreen({week,onUpdate,activeDay,setActiveDay,onBack,saving}){
  const updAct=(di,field,val)=>{const sessions=week.sessions.map((d,i)=>i===di?{...d,[field]:val}:d);onUpdate({...week,sessions})}
  const vol=totalVol(week),pct=Math.min(100,(vol/(week.targetVolume||1))*100)
  return(
    <div style={{padding:'20px 16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:'#22c55e',fontSize:22,cursor:'pointer'}}>←</button>
        <div><div style={{fontSize:18,fontWeight:'bold',color:'#f9fafb'}}>บันทึกผลการซ้อม</div><div style={{fontSize:12,color:'#6b7280'}}>W{week.weekNum} — {doneSess(week)}/{planSess(week)} session{saving&&' • saving...'}</div></div>
      </div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6}}><span style={{color:'#9ca3af'}}>Volume สะสม</span><span style={{color:pct>=100?'#22c55e':'#3b82f6',fontWeight:'bold'}}>{vol.toFixed(1)} / {week.targetVolume} km ({pct.toFixed(0)}%)</span></div>
        <div style={{background:'#1f2937',borderRadius:99,height:10}}><div style={{width:`${pct}%`,background:pct>=100?'#22c55e':'#3b82f6',borderRadius:99,height:10,transition:'width 0.4s'}}/></div>
        <div style={{display:'flex',gap:5,marginTop:10,justifyContent:'center'}}>
          {week.sessions.map((d,i)=>{const color=S_COLORS[d.type]||'#4b5563';return<div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}><div style={{width:28,height:28,borderRadius:6,background:d.done?color+'30':'#1f2937',border:`1px solid ${d.done?color:'#374151'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,cursor:'pointer'}} onClick={()=>setActiveDay(activeDay===i?null:i)}>{d.done?S_ICONS[d.type]||'✓':d.type==='rest'?'💤':'○'}</div><div style={{fontSize:8,color:'#4b5563'}}>{DAY_SHORT[i]}</div></div>})}
        </div>
      </div>
      {week.sessions.map((d,i)=>{
        const color=S_COLORS[d.type]||'#6b7280',open=activeDay===i,hasPlan=d.plan&&d.plan.trim()&&d.plan!=='-'
        return(
          <div key={i} style={{background:'#111827',border:`1px solid ${d.done?color+'60':'#1f2937'}`,borderRadius:12,marginBottom:8,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}} onClick={()=>setActiveDay(open?null:i)}>
              <input type="checkbox" checked={d.done} onChange={e=>{e.stopPropagation();updAct(i,'done',e.target.checked)}} style={{width:18,height:18,accentColor:color,cursor:'pointer',flexShrink:0}} onClick={e=>e.stopPropagation()}/>
              <div style={{width:30,textAlign:'center',flexShrink:0}}><div style={{fontSize:8,color:'#6b7280'}}>{DAY_SHORT[i]}</div><div style={{fontSize:16}}>{S_ICONS[d.type]||'🔵'}</div></div>
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
                    <div key={key}><div style={{fontSize:10,color:'#6b7280',marginBottom:4}}>{label}</div><input type={type} value={d[key]||''} step={step} onChange={e=>updAct(i,key,e.target.value)} placeholder={ph} style={{...IC,padding:'8px 10px'}}/></div>
                  ))}
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#6b7280',marginBottom:6}}><span>RPE</span><span style={{color:['#22c55e','#22c55e','#22c55e','#84cc16','#84cc16','#f59e0b','#f59e0b','#f97316','#ef4444','#ef4444','#dc2626'][d.rpe||0],fontWeight:'bold',fontSize:16}}>{d.rpe||0}/10</span></div>
                  <input type="range" min="0" max="10" value={d.rpe||0} onChange={e=>updAct(i,'rpe',+e.target.value)} style={{width:'100%',accentColor:color}}/>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#4b5563'}}><span>สบาย</span><span>ปานกลาง</span><span>หนักมาก</span></div>
                </div>
                <div style={{marginBottom:10}}><div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>ความรู้สึก</div><input value={d.feel||''} onChange={e=>updAct(i,'feel',e.target.value)} style={{...IC,padding:'8px 10px'}} placeholder="ขา ฟอร์ม HR..."/></div>
                <div><div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>รายละเอียดเพิ่มเติม</div><textarea value={d.notes||''} onChange={e=>updAct(i,'notes',e.target.value)} style={{...IC,height:60,resize:'none',fontSize:12}} placeholder="Split time, รอบที่ทำได้, สภาพอากาศ..."/></div>
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
function SummaryScreen({week,profile,aiResult,aiLoad,onAnalyze,onApply,onArchive,onGoLog}){
  const ph=phaseObj(week.phase),vol=totalVol(week),pct=Math.min(100,(vol/(week.targetVolume||1))*100)
  const DC={'เพิ่ม':'#22c55e','คงที่':'#3b82f6','ถอย':'#f59e0b','DownWeek':'#a78bfa'}
  return(
    <div style={{padding:'20px 16px'}}>
      <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:4}}>สรุปสัปดาห์ที่</div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div style={{fontSize:38,fontWeight:'bold',color:'#f9fafb'}}>{week.weekNum}</div>
        <div style={{background:ph.bg,color:ph.color,border:`1px solid ${ph.color}40`,borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:'bold',letterSpacing:2}}>{ph.label}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
        {[{l:'Volume',v:`${vol.toFixed(1)}`,u:'km',c:'#3b82f6'},{l:'Sessions',v:`${doneSess(week)}`,u:`/${planSess(week)}`,c:'#22c55e'},{l:'Avg RPE',v:avgRPE(week),u:'/10',c:'#f59e0b'},{l:'เป้า',v:`${pct.toFixed(0)}`,u:'%',c:pct>=100?'#22c55e':'#6b7280'}].map(s=>(
          <div key={s.l} style={{background:'#0d1117',border:'1px solid #1f2937',borderRadius:10,padding:'10px 8px',textAlign:'center'}}><div style={{fontSize:9,color:'#6b7280'}}>{s.l}</div><div style={{fontSize:19,fontWeight:'bold',color:s.c,lineHeight:1.2}}>{s.v}<span style={{fontSize:10,color:'#6b7280'}}>{s.u}</span></div></div>
        ))}
      </div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:12}}>PLAN vs ACTUAL</div>
        {week.sessions.map((d,i)=>{
          const color=S_COLORS[d.type]||'#4b5563',hasPlan=d.plan&&d.plan.trim()&&d.plan!=='-'
          if(!hasPlan&&!d.done) return null
          return(
            <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid #1f2937'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}><span>{S_ICONS[d.type]||'🔵'}</span><span style={{fontSize:13,fontWeight:'bold',color}}>{d.day}</span></div>
              {hasPlan&&<div style={{fontSize:11,color:'#374151',paddingLeft:22,marginBottom:2}}>📋 {d.plan}</div>}
              {d.done?<div style={{paddingLeft:22}}><div style={{fontSize:11,color:'#86efac'}}>✓ {[d.distance&&`${d.distance}km`,d.pace&&`Pace ${d.pace}`,d.hr&&`HR ${d.hr}`,d.rpe>0&&`RPE ${d.rpe}`].filter(Boolean).join(' · ')}</div>{d.feel&&<div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>💬 "{d.feel}"</div>}</div>:hasPlan&&d.type!=='rest'?<div style={{fontSize:11,color:'#7f1d1d',paddingLeft:22}}>✗ ไม่ได้ทำ</div>:null}
            </div>
          )
        })}
        {week.notes&&<div style={{fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>📝 "{week.notes}"</div>}
      </div>
      {!aiResult&&<button onClick={onAnalyze} disabled={aiLoad} style={{...BTN(aiLoad?'#374151':'#22c55e',aiLoad?'#9ca3af':'#000'),width:'100%',marginBottom:10}}>{aiLoad?'⏳ AI กำลังวิเคราะห์...':'🤖 ให้ AI วิเคราะห์ + ออกโปรแกรมสัปดาห์หน้า'}</button>}
      {aiResult&&!aiResult.error&&(
        <div style={{background:'#0d1117',border:`1px solid ${(DC[aiResult.decision]||'#374151')+'50'}`,borderRadius:14,padding:16,marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div style={{fontSize:11,color:'#6b7280',letterSpacing:2}}>AI COACH</div><div style={{background:(DC[aiResult.decision]||'#374151')+'25',color:DC[aiResult.decision]||'#9ca3af',padding:'3px 12px',borderRadius:99,fontSize:12,fontWeight:'bold'}}>{aiResult.decision}</div></div>
          <div style={{fontSize:13,color:'#d1d5db',marginBottom:10,lineHeight:1.65}}>{aiResult.assessment}</div>
          {aiResult.signals?.map((s,i)=><div key={i} style={{fontSize:12,color:'#6b7280',marginBottom:3}}>• {s}</div>)}
          <div style={{fontSize:12,color:'#9ca3af',margin:'8px 0',fontStyle:'italic'}}>{aiResult.reason}</div>
          {aiResult.nextPlan&&<div style={{background:'#111827',borderRadius:10,padding:12,marginTop:10}}><div style={{fontSize:11,color:'#6b7280',marginBottom:8}}>โปรแกรมสัปดาห์หน้า — Vol {aiResult.nextVolume} km</div>{aiResult.nextPlan.map((s,i)=><div key={i} style={{display:'flex',gap:8,marginBottom:5,fontSize:12}}><span style={{color:'#4b5563',width:42,flexShrink:0}}>{s.day.slice(0,3)}</span><span style={{flexShrink:0}}>{S_ICONS[guessType(s.plan)]||'🔵'}</span><span style={{color:'#d1d5db'}}>{s.plan}</span></div>)}</div>}
          {aiResult.coachTip&&<div style={{background:'#0f2015',border:'1px solid #22c55e20',borderRadius:8,padding:10,fontSize:12,color:'#86efac',marginTop:10}}>💡 {aiResult.coachTip}</div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}><button onClick={onApply} style={BTN('#22c55e')}>✅ ใช้โปรแกรม AI</button><button onClick={onAnalyze} style={BTN('#1f2937','#9ca3af')}>🔄 วิเคราะห์ใหม่</button></div>
        </div>
      )}
      {aiResult?.error&&<div style={{background:'#1c0a0a',border:'1px solid #7f1d1d',borderRadius:10,padding:12,color:'#fca5a5',fontSize:12,marginBottom:10}}>{aiResult.error}</div>}
      <button onClick={onGoLog} style={{...BTN('#1f2937','#9ca3af'),width:'100%',marginBottom:8}}>✏️ กลับไปแก้ไขข้อมูล</button>
      <button onClick={onArchive} style={{...BTN('#111827','#6b7280'),width:'100%',fontSize:12}}>เก็บสัปดาห์นี้และเริ่มสัปดาห์ใหม่</button>
    </div>
  )
}

// ── ZONE SCREEN ───────────────────────────────────────────────────────────────
function ZoneScreen({userId,zones,onSave}){
  const[form,setForm]=useState({dist12:'',dist3:'',dist20:'',weight:'',height:'',bodyFat:''})
  const[result,setResult]=useState(null)
  const[saved,setSaved]=useState(false)
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}))

  const calculate=()=>{
    const d12=parseFloat(form.dist12),d3=parseFloat(form.dist3),d20=parseFloat(form.dist20)
    const weight=parseFloat(form.weight),height=parseFloat(form.height),bf=parseFloat(form.bodyFat)
    if(!d12||!d3||!d20||!weight||!height||!bf) return
    const pace12=(12*60)/(d12/1000),pace3=(3*60)/(d3/1000),pace20=20/(d20/1000)
    const vo2max=Math.max((d12-504.9)/44.73,20)
    const lt2Pace=pace3*1.08
    const lt1Pace=lt2Pace*1.28
    const bfFactor=1+(bf-15)*0.008
    const fatmaxPace=lt1Pace*1.12*bfFactor
    const marathonPace=lt2Pace+38
    setResult({vo2max,pace12,pace3,pace20,lt2Pace,lt1Pace,fatmaxPace,marathonPace,weight,height,bf,d12,d3,d20})
    setSaved(false)
  }

  const handleSave=async()=>{
    if(!result) return
    await onSave({
      dist_12min:result.d12,dist_3min:result.d3,dist_20sec:result.d20,
      weight_kg:result.weight,height_cm:result.height,body_fat_pct:result.bf,
      vo2max:result.vo2max,
      fatmax_slow:decimalToPace(result.fatmaxPace*1.05),fatmax_fast:decimalToPace(result.fatmaxPace*0.95),
      lt1_slow:decimalToPace(result.lt1Pace*1.05),lt1_fast:decimalToPace(result.lt1Pace*0.94),
      moderate_slow:decimalToPace(result.lt2Pace*1.15),moderate_fast:decimalToPace(result.lt2Pace*1.02),
      lt2_slow:decimalToPace(result.lt2Pace*1.04),lt2_fast:decimalToPace(result.lt2Pace*0.95),
      vo2max_slow:decimalToPace(result.pace20*1.15),vo2max_fast:decimalToPace(result.pace20),
      marathon_pace:decimalToPace(result.marathonPace)
    })
    setSaved(true)
  }

  const zc=(label,slow,fast,color)=>(
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:12,color,fontWeight:'bold'}}>{label}</span>
        <span style={{fontSize:14,fontFamily:'monospace',fontWeight:'bold',color}}>{slow} – {fast}</span>
      </div>
      <div style={{background:'#1f2937',borderRadius:99,height:8}}><div style={{width:'100%',background:color,borderRadius:99,height:8}}/></div>
    </div>
  )

  return(
    <div style={{padding:'20px 16px'}}>
      <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:4}}>SPEED TEST</div>
      <div style={{fontSize:26,fontWeight:'bold',color:'#f9fafb',marginBottom:16}}>🎯 Zone Calculator</div>

      {zones&&(
        <div style={{background:'#111827',border:'1px solid #22c55e30',borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontSize:11,color:'#22c55e',letterSpacing:2,marginBottom:10}}>ZONE ปัจจุบัน</div>
          {zc('Fatmax / LT1 Easy',zones.fatmax_slow,zones.lt1_fast,'#22c55e')}
          {zc('Moderate',zones.moderate_slow,zones.moderate_fast,'#f59e0b')}
          {zc('LT2 Threshold',zones.lt2_slow,zones.lt2_fast,'#ef4444')}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,fontSize:12}}>
            <span style={{color:'#6b7280'}}>Marathon Pace</span>
            <span style={{color:'#3b82f6',fontWeight:'bold',fontSize:16,fontFamily:'monospace'}}>{zones.marathon_pace}</span>
          </div>
          <div style={{fontSize:11,color:'#4b5563',marginTop:6}}>VO2max: {zones.vo2max?.toFixed(1)} | ทดสอบ: {zones.tested_at?new Date(zones.tested_at).toLocaleDateString('th-TH'):'-'}</div>
        </div>
      )}

      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:11,color:'#6b7280',marginBottom:12,letterSpacing:1}}>กรอกผล Speed Test</div>
        <div style={{background:'#0d1520',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:11,color:'#93c5fd'}}>วิ่งแต่ละช่วงด้วย Pace คงที่เร็วที่สุด พักอย่างน้อย 10 นาทีระหว่างช่วง</div>
        {[{l:'ระยะ 12 นาที (เมตร)',k:'dist12',ph:'2580'},{l:'ระยะ 3 นาที (เมตร)',k:'dist3',ph:'674'},{l:'ระยะ 20 วินาที All out (เมตร)',k:'dist20',ph:'117'},{l:'น้ำหนัก (กก.)',k:'weight',ph:'70'},{l:'ส่วนสูง (ซม.)',k:'height',ph:'175'},{l:'% Body Fat',k:'bodyFat',ph:'20'}].map(({l,k,ph})=>(
          <div key={k} style={{marginBottom:10}}>
            <div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>{l}</div>
            <input type="number" value={form[k]} onChange={e=>sf(k,e.target.value)} placeholder={ph} style={{...IC,padding:'8px 10px'}}/>
          </div>
        ))}
        <button onClick={calculate} style={{...BTN('#3b82f6','#fff'),width:'100%',marginTop:4}}>คำนวณ Zone →</button>
      </div>

      {result&&(
        <div style={{background:'#0d1117',border:'1px solid #374151',borderRadius:14,padding:16,marginBottom:12}}>
          <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:12}}>ผลการคำนวณ</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
            <div style={{background:'#111827',borderRadius:10,padding:'10px 12px',textAlign:'center'}}><div style={{fontSize:10,color:'#6b7280'}}>VO2max</div><div style={{fontSize:24,fontWeight:'bold',color:'#3b82f6'}}>{result.vo2max.toFixed(1)}</div></div>
            <div style={{background:'#111827',borderRadius:10,padding:'10px 12px',textAlign:'center'}}><div style={{fontSize:10,color:'#6b7280'}}>Marathon Pace</div><div style={{fontSize:24,fontWeight:'bold',color:'#a78bfa',fontFamily:'monospace'}}>{decimalToPace(result.marathonPace)}</div></div>
          </div>
          {zc('Fatmax / LT1 Easy',decimalToPace(result.fatmaxPace*1.05),decimalToPace(result.lt1Pace*0.94),'#22c55e')}
          {zc('Moderate',decimalToPace(result.lt2Pace*1.15),decimalToPace(result.lt2Pace*1.02),'#f59e0b')}
          {zc('LT2 Threshold',decimalToPace(result.lt2Pace*1.04),decimalToPace(result.lt2Pace*0.95),'#ef4444')}
          {zc('VO2max Zone',decimalToPace(result.pace20*1.15),decimalToPace(result.pace20),'#a78bfa')}
          {saved?<div style={{background:'#0f2015',border:'1px solid #22c55e30',borderRadius:8,padding:10,fontSize:12,color:'#86efac',marginTop:10,textAlign:'center'}}>✅ บันทึก Zone ลง Supabase แล้ว AI จะใช้ค่านี้ในการวิเคราะห์</div>:<button onClick={handleSave} style={{...BTN('#22c55e'),width:'100%',marginTop:12}}>💾 บันทึก Zone นี้ลง Supabase</button>}
        </div>
      )}
    </div>
  )
}

// ── VOLUME SCREEN ─────────────────────────────────────────────────────────────
function VolumeScreen({profile,zones}){
  const[phase,setPhase]=useState(profile?.phase||'base')
  const[target,setTarget]=useState(40)
  const[longRun,setLongRun]=useState(18)
  const[sessions,setSessions]=useState([])
  const[result,setResult]=useState(null)

  const LR_GUIDE={base:[['W1-4','14-18'],['W5-8','18-22']],build:[['W1-4','22-26'],['W5-8','26-28']],peak:[['W1-4','28-32'],['W5-8','30-35']],taper:[['W1-2','16-20']]}

  const addSession=type=>{
    const id=Date.now()
    const def={easy:{type:'easy',minutes:60,pace:'6:30'},fastlek:{type:'fastlek',ratio:'1:1',rounds:18,fastPace:zones?zones.lt2_slow||'5:10':'5:10',slowPace:zones?zones.moderate_slow||'6:20':'6:20'},interval:{type:'interval',dist:1000,sets:8,pace:'5:00'},tempo:{type:'tempo',km:10},stride:{type:'stride',reps:4}}
    setSessions(s=>[...s,{id,...def[type]}]);setResult(null)
  }
  const removeSession=id=>{setSessions(s=>s.filter(x=>x.id!==id));setResult(null)}
  const updSession=(id,f,v)=>{setSessions(s=>s.map(x=>x.id===id?{...x,[f]:v}:x));setResult(null)}

  const calculate=()=>{
    const lrKm=+longRun||0,items=[];let qualityKm=0
    sessions.forEach(s=>{
      let km=0,label=''
      if(s.type==='easy'){km=(+s.minutes/60)*(60/paceToDecimal(s.pace||'6:30'));label=`Easy ${s.minutes} นาที @ ${s.pace}`}
      else if(s.type==='fastlek'){const fp=paceToDecimal(s.fastPace||'5:10'),sp=paceToDecimal(s.slowPace||'6:20'),r=s.ratio==='1:1'?[1,1]:[2,1];km=((r[0]*+s.rounds/60)*(60/fp))+((r[1]*+s.rounds/60)*(60/sp));label=`Fastlek ${s.ratio} ×${s.rounds}`;qualityKm+=km}
      else if(s.type==='interval'){km=((+s.dist*+s.sets)/1000)+2;label=`Interval ${s.dist}m ×${s.sets}`;qualityKm+=km}
      else if(s.type==='tempo'){km=+s.km+2;label=`Tempo ${s.km}km`;qualityKm+=km}
      else if(s.type==='stride'){km=(+s.reps*100/1000)+0.5;label=`Stride ×${s.reps}`}
      items.push({label,km:+km.toFixed(1),type:s.type})
    })
    const sessTotal=items.reduce((a,x)=>a+x.km,0),total=lrKm+sessTotal,rem=+target-total
    setResult({lrKm,items,sessTotal,total,rem,target:+target,qualityKm})
  }

  const ph=phaseObj(phase),pct=(v,t)=>Math.min(100,Math.round((v/t)*100))
  const SC={easy:'#22c55e',fastlek:'#f59e0b',interval:'#ef4444',tempo:'#f97316',stride:'#a78bfa'}

  return(
    <div style={{padding:'20px 16px'}}>
      <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:4}}>PLANNING TOOL</div>
      <div style={{fontSize:26,fontWeight:'bold',color:'#f9fafb',marginBottom:16}}>🧮 Volume Calculator</div>

      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          {PHASES.map(p=><button key={p.id} onClick={()=>{setPhase(p.id);setResult(null)}} style={{padding:8,borderRadius:8,border:`2px solid ${phase===p.id?p.color:'#374151'}`,background:phase===p.id?p.bg:'transparent',color:phase===p.id?p.color:'#6b7280',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:'bold'}}>{p.label}</button>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div><div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>🎯 Target Volume (km)</div><input type="number" value={target} onChange={e=>{setTarget(e.target.value);setResult(null)}} style={{...IC,fontSize:18,fontWeight:'bold',color:'#3b82f6',textAlign:'center'}}/></div>
          <div><div style={{fontSize:11,color:'#6b7280',marginBottom:4}}>⭐ Long Run (km)</div><input type="number" value={longRun} onChange={e=>{setLongRun(e.target.value);setResult(null)}} style={{...IC,fontSize:18,fontWeight:'bold',color:'#f59e0b',textAlign:'center'}}/></div>
        </div>
        <div style={{marginTop:10,background:'#0d1520',borderRadius:8,padding:'6px 10px',display:'flex',gap:10,flexWrap:'wrap'}}>
          {(LR_GUIDE[phase]||[]).map(([w,r])=><span key={w} style={{fontSize:11,color:ph.color}}>{w}: <b>{r} km</b></span>)}
        </div>
      </div>

      {zones&&<div style={{background:'#0d1520',border:'1px solid #1e3a5f',borderRadius:10,padding:'8px 12px',marginBottom:12,fontSize:11,color:'#93c5fd'}}>✓ ใช้ Zone จาก Speed Test ของคุณ: Fast {zones.lt2_slow} / Slow {zones.moderate_slow}</div>}

      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:11,color:'#6b7280',letterSpacing:1,marginBottom:10}}>เพิ่ม SESSION</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:14}}>
          {[{t:'easy',l:'🟢 Easy'},{t:'fastlek',l:'🟡 Fastlek'},{t:'interval',l:'🔴 Interval'},{t:'tempo',l:'🟠 Tempo'},{t:'stride',l:'⚡ Stride'}].map(b=>(
            <button key={b.t} onClick={()=>addSession(b.t)} style={{padding:'7px 12px',border:`1px solid ${SC[b.t]||'#374151'}50`,background:(SC[b.t]||'#374151')+'15',color:SC[b.t]||'#9ca3af',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:'bold'}}>+ {b.l}</button>
          ))}
        </div>
        {sessions.length===0&&<div style={{textAlign:'center',color:'#374151',fontSize:13,padding:'16px 0'}}>กด + เพื่อเพิ่ม Session</div>}
        {sessions.map((s,i)=>(
          <div key={s.id} style={{background:'#0d1117',border:`1px solid ${SC[s.type]||'#374151'}40`,borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}><span style={{fontSize:13,fontWeight:'bold',color:SC[s.type]||'#9ca3af'}}>{{easy:'🟢 Easy',fastlek:'🟡 Fastlek',interval:'🔴 Interval',tempo:'🟠 Tempo',stride:'⚡ Stride'}[s.type]}</span><button onClick={()=>removeSession(s.id)} style={{background:'none',border:'none',color:'#4b5563',cursor:'pointer',fontSize:18}}>×</button></div>
            {s.type==='easy'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><VField l="เวลา (นาที)" v={s.minutes} onChange={v=>updSession(s.id,'minutes',v)} t="number"/><VField l="Pace (min:sec)" v={s.pace} onChange={v=>updSession(s.id,'pace',v)} ph="6:30"/></div>}
            {s.type==='fastlek'&&<div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}><div><div style={{fontSize:10,color:'#6b7280',marginBottom:3}}>อัตราส่วน</div><select value={s.ratio} onChange={e=>updSession(s.id,'ratio',e.target.value)} style={{...IC,fontSize:13}}><option value="1:1">1:1 (BASE)</option><option value="2:1">2:1 (BUILD)</option></select></div><VField l="จำนวนรอบ" v={s.rounds} onChange={v=>updSession(s.id,'rounds',v)} t="number"/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><VField l="⚡ Fast Pace (LT2)" v={s.fastPace} onChange={v=>updSession(s.id,'fastPace',v)} ph="5:10"/><VField l="🐢 Slow Pace (Mod)" v={s.slowPace} onChange={v=>updSession(s.id,'slowPace',v)} ph="6:20"/></div></div>}
            {s.type==='interval'&&<div><div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>{[200,400,600,800,1000,1200,1600,2000].map(d=><button key={d} onClick={()=>updSession(s.id,'dist',d)} style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${s.dist===d?'#ef4444':'#374151'}`,background:s.dist===d?'#ef444420':'transparent',color:s.dist===d?'#ef4444':'#6b7280',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>{d}m</button>)}</div><VField l="จำนวน Set" v={s.sets} onChange={v=>updSession(s.id,'sets',v)} t="number"/></div>}
            {s.type==='tempo'&&<VField l="ระยะ Tempo (km)" v={s.km} onChange={v=>updSession(s.id,'km',v)} t="number"/>}
            {s.type==='stride'&&<VField l="จำนวนรอบ (100m/รอบ)" v={s.reps} onChange={v=>updSession(s.id,'reps',v)} t="number"/>}
          </div>
        ))}
      </div>

      <button onClick={calculate} style={{...BTN('#22c55e'),width:'100%',marginBottom:14,fontSize:15}}>คำนวณ Volume →</button>

      {result&&(
        <div style={{background:'#0d1117',border:`1px solid ${Math.abs(result.rem)<=2?'#22c55e':'#f59e0b'}40`,borderRadius:14,padding:16}}>
          <div style={{textAlign:'center',marginBottom:14}}>
            <div style={{fontSize:48,fontWeight:'bold',color:Math.abs(result.rem)<=2?'#22c55e':'#f59e0b'}}>{result.total.toFixed(1)}</div>
            <div style={{fontSize:14,color:'#6b7280'}}>/ {result.target} km</div>
            <div style={{fontSize:13,marginTop:4,color:Math.abs(result.rem)<=2?'#22c55e':'#f59e0b',fontWeight:'bold'}}>{Math.abs(result.rem)<=2?'✅ ได้ตามเป้า':result.rem>0?`ขาดอีก ${result.rem.toFixed(1)} km`:`เกิน ${Math.abs(result.rem).toFixed(1)} km`}</div>
          </div>
          <div style={{marginBottom:14}}>
            {[{label:'⭐ Long Run',km:result.lrKm,color:'#3b82f6'},...result.items].map((item,i)=>(
              <div key={i} style={{marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color:item.color||SC[item.type]||'#9ca3af'}}>{item.label}</span><span style={{fontWeight:'bold',color:item.color||SC[item.type]||'#9ca3af'}}>{item.km} km ({pct(item.km,result.target)}%)</span></div>
                <div style={{background:'#1f2937',borderRadius:99,height:6}}><div style={{width:`${pct(item.km,result.target)}%`,background:item.color||SC[item.type]||'#6b7280',borderRadius:99,height:6}}/></div>
              </div>
            ))}
            {result.rem>0&&<div style={{background:'#0d1520',border:'1px dashed #1e3a5f',borderRadius:8,padding:'10px 12px',marginTop:6}}><div style={{fontSize:12,color:'#93c5fd',marginBottom:2}}>💡 ควรเพิ่ม Easy Run อีก</div><div style={{fontSize:20,fontWeight:'bold',color:'#3b82f6'}}>{result.rem.toFixed(1)} km</div><div style={{fontSize:11,color:'#4b5563',marginTop:2}}>≈ Easy {Math.round(result.rem/paceToDecimal('6:30')*60)} นาที</div></div>}
          </div>
          <div style={{background:'#111827',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:11,color:'#6b7280',marginBottom:6}}>80/20 CHECK</div>
            {[{l:'Easy Zone',v:100-Math.min(25,Math.round(result.qualityKm/result.total*100)),c:'#22c55e'},{l:'Hard Zone',v:Math.min(100,Math.round(result.qualityKm/result.total*100)),c:'#ef4444'}].map(x=>(
              <div key={x.l} style={{marginBottom:6}}><div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}><span style={{color:x.c}}>{x.l}</span><span style={{color:x.c,fontWeight:'bold'}}>{x.v}%</span></div><div style={{background:'#1f2937',borderRadius:99,height:6}}><div style={{width:`${x.v}%`,background:x.c,borderRadius:99,height:6}}/></div></div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── HISTORY SCREEN ────────────────────────────────────────────────────────────
function HistoryScreen({history,onBack}){
  const[idx,setIdx]=useState(0)
  if(!history.length) return<div style={{padding:'20px 16px'}}><button onClick={onBack} style={{background:'none',border:'none',color:'#22c55e',fontSize:22,cursor:'pointer',marginBottom:20}}>←</button><div style={{textAlign:'center',color:'#6b7280',marginTop:100}}>ยังไม่มีประวัติ</div></div>
  const w=history[history.length-1-idx],ph=phaseObj(w.phase),vol=totalVol(w)
  return(
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
            {d.done&&<div style={{fontSize:11,color:'#86efac',paddingLeft:20}}>✓ {[d.distance&&`${d.distance}km`,d.pace&&`Pace ${d.pace}`,d.hr&&`HR ${d.hr}`,d.rpe>0&&`RPE ${d.rpe}`].filter(Boolean).join(' · ')}</div>}
          </div>
        ))}
        {w.notes&&<div style={{marginTop:8,fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>📝 "{w.notes}"</div>}
      </div>
      <div style={{background:'#111827',border:'1px solid #1f2937',borderRadius:12,padding:14}}>
        <div style={{fontSize:11,color:'#6b7280',letterSpacing:2,marginBottom:12}}>VOLUME TREND</div>
        <div style={{display:'flex',alignItems:'flex-end',gap:5,height:80}}>
          {history.slice(-12).map((w2,i)=>{const v=totalVol(w2),max=Math.max(...history.slice(-12).map(x=>totalVol(x)),1),h=Math.max(4,(v/max)*72),isSel=history.length-1-idx===i;return<div key={i} onClick={()=>setIdx(history.length-1-i)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',cursor:'pointer'}}><div style={{fontSize:9,color:isSel?'#f9fafb':'#4b5563',marginBottom:2}}>{v.toFixed(0)}</div><div style={{width:'100%',height:h,background:phaseObj(w2.phase).color,borderRadius:'3px 3px 0 0',opacity:isSel?1:0.4}}/><div style={{fontSize:8,color:'#4b5563',marginTop:2}}>W{w2.weekNum}</div></div>})}
        </div>
      </div>
    </div>
  )
}

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
function PhasePicker({phase,onChange}){
  const ph=phaseObj(phase),[open,setOpen]=useState(false)
  return<div style={{position:'relative'}}><div onClick={()=>setOpen(!open)} style={{background:ph.bg,color:ph.color,border:`1px solid ${ph.color}40`,borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:'bold',letterSpacing:2,cursor:'pointer'}}>{ph.label} ▾</div>{open&&<div style={{position:'absolute',right:0,top:32,background:'#111827',border:'1px solid #374151',borderRadius:8,zIndex:50,overflow:'hidden',minWidth:100}}>{PHASES.map(p=><div key={p.id} onClick={()=>{onChange(p.id);setOpen(false)}} style={{padding:'8px 16px',color:p.color,fontSize:12,cursor:'pointer',fontWeight:'bold',background:phase===p.id?p.bg:'transparent'}}>{p.label}</div>)}</div>}</div>
}

function BottomNav({screen,setScreen,done,hasZone}){
  const items=[{id:'plan',icon:'📋',label:'วางแผน'},{id:'log',icon:'✏️',label:'บันทึก'},{id:'summary',icon:'🤖',label:'AI'},{id:'volume',icon:'🧮',label:'Volume'},{id:'zone',icon:'🎯',label:'Zone'},{id:'history',icon:'📊',label:'ประวัติ'}]
  return<div style={{position:'fixed',bottom:0,left:0,right:0,background:'#0d1117',borderTop:'1px solid #1f2937',display:'flex',justifyContent:'space-around',padding:'8px 0 14px',zIndex:100}}>
    {items.map(item=>(
      <button key={item.id} onClick={()=>setScreen(item.id)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,color:screen===item.id?'#22c55e':'#4b5563',fontFamily:'inherit',position:'relative'}}>
        <span style={{fontSize:18}}>{item.icon}</span>
        <span style={{fontSize:8,letterSpacing:0.5}}>{item.label}</span>
        {item.id==='log'&&done>0&&<span style={{position:'absolute',top:-2,right:-4,background:'#22c55e',color:'#000',borderRadius:99,fontSize:8,padding:'0 4px',fontWeight:'bold'}}>{done}</span>}
        {item.id==='zone'&&!hasZone&&<span style={{position:'absolute',top:-2,right:-4,background:'#f59e0b',color:'#000',borderRadius:99,fontSize:8,padding:'0 4px',fontWeight:'bold'}}>!</span>}
      </button>
    ))}
  </div>
}

function VField({l,v,onChange,t='text',ph}){
  return<div><div style={{fontSize:10,color:'#6b7280',marginBottom:3}}>{l}</div><input type={t} value={v||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={{...IC,padding:'7px 10px',fontSize:13}}/></div>
}

function Loader(){return<div style={{background:'#0a0f1a',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'#22c55e',fontFamily:'monospace'}}>⏳ กำลังโหลด...</div>}
