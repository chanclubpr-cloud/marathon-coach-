import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase.js'

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const PHASES = [
  { id:'base',  label:'BASE',  color:'#22c55e', bg:'#052e16', desc:'สร้างฐาน Aerobic + Mitochondria', weeks:'10-12',
    volRange:[30,50], sessions:['Easy 3 วัน','Fastlek 1:1','Long run เพิ่มช้าๆ','Stride ทุกวัน'] },
  { id:'build', label:'BUILD', color:'#f59e0b', bg:'#1c1007', desc:'ยก Lactate Threshold', weeks:'8-10',
    volRange:[45,65], sessions:['Easy 2-3 วัน','Interval 400-1000m','Long run + Moderate ช่วงท้าย','Stride'] },
  { id:'peak',  label:'PEAK',  color:'#ef4444', bg:'#1c0505', desc:'Marathon Pace Economy', weeks:'6-8',
    volRange:[55,75], sessions:['Easy 2 วัน','Tempo / Interval 1000-2000m','Long run + Marathon Pace ช่วงท้าย'] },
  { id:'taper', label:'TAPER', color:'#a78bfa', bg:'#0d0a1e', desc:'Supercompensation', weeks:'2-3',
    volRange:[20,35], sessions:['Easy เบาๆ','Fastlek 1:1 สั้น','Long run สั้นลง 40%'] },
]

const SESSION_TYPES = [
  { id:'rest',     label:'พัก',      icon:'💤', color:'#4b5563' },
  { id:'easy',     label:'Easy',     icon:'🟢', color:'#22c55e' },
  { id:'fastlek',  label:'Fastlek',  icon:'🟡', color:'#f59e0b' },
  { id:'interval', label:'Interval', icon:'🔴', color:'#ef4444' },
  { id:'tempo',    label:'Tempo',    icon:'🟠', color:'#f97316' },
  { id:'longrun',  label:'Long Run', icon:'⭐', color:'#3b82f6' },
  { id:'stride',   label:'Stride',   icon:'⚡', color:'#a78bfa' },
  { id:'other',    label:'อื่นๆ',    icon:'🔵', color:'#06b6d4' },
]

const DAYS = ['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์']
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const guessType = t => {
  const s=(t||'').toLowerCase()
  if(!t||t.includes('พัก')||s==='rest'||s==='-'||s==='') return 'rest'
  if(s.includes('long run')||s.includes('longrun')||s.includes('long')) return 'longrun'
  if(s.includes('interval')||/\d{3,4}\s*[×x*xX]/.test(s)||/[×x*xX]\s*\d{2,}/.test(s)) return 'interval'
  if(s.includes('fastlek')||s.includes('fartlek')||s.includes('สลับ')||s.includes('fast')) return 'fastlek'
  if(s.includes('easy')||s.includes('อีซี่')||s.includes('ง่าย')) return 'easy'
  if(s.includes('stride')||s.includes('สตรายด์')) return 'stride'
  return 'other'
}

const phaseObj = id => PHASES.find(p=>p.id===id)||PHASES[0]
const sessObj  = id => SESSION_TYPES.find(s=>s.id===id)||SESSION_TYPES[0]
const totalVol = w => (w.sessions||[]).reduce((s,d)=>s+(d.done?+d.distance||0:0),0)
const doneSess = w => (w.sessions||[]).filter(d=>d.done&&d.type!=='rest').length
const planSess = w => (w.sessions||[]).filter(d=>d.plan&&d.type!=='rest').length
const avgRPE   = w => { const a=(w.sessions||[]).filter(d=>d.done&&d.rpe>0); return a.length?(a.reduce((s,d)=>s+ +d.rpe,0)/a.length).toFixed(1):'-' }
const lrKm     = w => { const lr=(w.sessions||[]).find(d=>d.type==='longrun'&&d.done); return lr?+lr.distance||0:0 }

const emptyDay  = (day,idx) => ({ day, dayIndex:idx, plan:'', type:'rest', done:false, distance:'', duration:'', pace:'', hr:'', rpe:0, feel:'', notes:'' })
const emptyWeek = (num=1, phase='base') => ({ weekNum:num, phase, targetVolume:40, notes:'', sessions:DAYS.map((d,i)=>emptyDay(d,i)) })

const IC = { background:'#0d1117', border:'1px solid #374151', borderRadius:8, color:'#f9fafb', padding:'11px 14px', fontSize:16, width:'100%', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }
const BTN = (bg, fg='#000') => ({ background:bg, color:fg, border:'none', borderRadius:10, padding:'16px 20px', cursor:'pointer', fontWeight:'bold', fontSize:16, fontFamily:'inherit' })

// ── ANTHROPIC API ─────────────────────────────────────────────────────────────
async function callClaude(sys, usr) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: sys,
      messages: [{ role: 'user', content: usr }]
    })
  })
  if (!res.ok) throw new Error(`API Error: ${res.status}`)
  const d = await res.json()
  return d.content?.[0]?.text || ''
}

// ── VOLUME CALCULATOR HELPERS ─────────────────────────────────────────────────
const paceToDecimal = str => {
  if (!str) return 6.0
  const s = String(str).trim()
  if (s.includes(':')) { const [m,sec]=s.split(':').map(Number); return m+sec/60 }
  return parseFloat(s)||6.0
}
const decimalToPace = dec => {
  if (!dec||isNaN(dec)) return '--:--'
  const m=Math.floor(dec), sec=Math.round((dec-m)*60)
  return `${m}:${String(sec).padStart(2,'0')}`
}

// ── WEEKLY VOLUME GUIDE ───────────────────────────────────────────────────────
const getVolumeGuide = (phase, weekNum, prevVol) => {
  const ph = phaseObj(phase)
  const [minV, maxV] = ph.volRange
  let suggested = prevVol ? Math.min(prevVol * 1.08, maxV) : minV
  suggested = Math.max(suggested, minV)
  const isDownWeek = weekNum % 4 === 0
  if (isDownWeek) suggested = suggested * 0.7
  return {
    suggested: Math.round(suggested),
    min: isDownWeek ? Math.round(minV*0.6) : minV,
    max: isDownWeek ? Math.round(maxV*0.7) : maxV,
    isDownWeek,
    sessions: ph.sessions
  }
}

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,    setScreen]    = useState('loading')
  const [user,      setUser]      = useState(null)
  const [profile,   setProfile]   = useState(null)
  const [week,      setWeek]      = useState(emptyWeek())
  const [weekId,    setWeekId]    = useState(null)
  const [history,   setHistory]   = useState([])
  const [zones,     setZones]     = useState(null)
  const [tab,       setTab]       = useState('plan')
  const [aiResult,  setAiResult]  = useState(null)
  const [aiLoad,    setAiLoad]    = useState(false)
  const [valResult, setValResult] = useState(null)
  const [valLoad,   setValLoad]   = useState(false)
  const [activeDay, setActiveDay] = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState('')
  const [editGoal,  setEditGoal]  = useState(false)
  const saveTimer = useRef(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); loadData(session.user) }
      else setScreen('login')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) { setUser(session.user); loadData(session.user) }
      else { setUser(null); setScreen('login') }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loginWithGoogle = async () => {
    const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl } })
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null); setProfile(null); setWeek(emptyWeek()); setHistory([]); setZones(null)
    setScreen('login')
  }

  // ── Load Data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (authUser) => {
    const uid = authUser.id
    try {
      // Profile — ใช้ uuid จาก auth
      const { data: prof, error: profErr } = await supabase
        .from('profiles').select('*').eq('user_id', uid).maybeSingle()

      if (profErr && profErr.code !== 'PGRST116') console.error('profile error', profErr)

      if (!prof) { setScreen('goal'); return }
      setProfile(prof)

      // Current week
      const { data: wks } = await supabase.from('weeks').select('*')
        .eq('user_id', uid).is('archived_at', null)
        .order('week_num', { ascending: false }).limit(1)

      if (wks?.length) {
        const w = wks[0]; setWeekId(w.id)
        const { data: sess } = await supabase.from('sessions').select('*')
          .eq('week_id', w.id).order('day_index')
        const loadedSessions = sess?.length
          ? DAYS.map((dayName, i) => {
              const found = sess.find(s => s.day_name === dayName || s.day === dayName)
              if (found) return {
                ...emptyDay(dayName, i),
                ...found,
                day: dayName,
                dayIndex: i,
                type: found.session_type || found.type || 'rest',
                plan: found.plan || '',
                done: found.done || false,
                distance: found.distance || '',
                duration: found.duration || '',
                pace: found.pace || '',
                hr: found.hr || '',
                rpe: found.rpe || 0,
                feel: found.feel || '',
                notes: found.notes || '',
              }
              return emptyDay(dayName, i)
            })
          : DAYS.map((d, i) => emptyDay(d, i))
        setWeek({
          weekNum: w.week_num, phase: w.phase,
          targetVolume: w.target_volume, notes: w.notes || '',
          sessions: loadedSessions
        })
      } else {
        const { data: nw } = await supabase.from('weeks')
          .insert({ user_id: uid, week_num: prof.week_num||1, phase: prof.phase||'base', target_volume: 40, notes: '' })
          .select().single()
        if (nw) { setWeekId(nw.id); setWeek(emptyWeek(prof.week_num||1, prof.phase||'base')) }
      }

      // History
      const { data: hist } = await supabase.from('weeks').select('*,sessions(*)')
        .eq('user_id', uid).not('archived_at', 'is', null).order('week_num')
      if (hist) setHistory(hist.map(w2 => ({
        weekNum: w2.week_num, phase: w2.phase, targetVolume: w2.target_volume,
        notes: w2.notes || '', archivedAt: w2.archived_at,
        sessions: (w2.sessions || []).sort((a, b) => a.day_index - b.day_index)
          .map(s => ({ ...s, type: s.session_type }))
      })))

      // Zones
      const { data: z } = await supabase.from('zones').select('*')
        .eq('user_id', uid).order('tested_at', { ascending: false }).limit(1)
      if (z?.length) setZones(z[0])

      setScreen('app')
    } catch (e) { console.error(e); setScreen('goal') }
  }, [])

  // ── Save Goal ─────────────────────────────────────────────────────────────
  const saveGoal = async (goalData) => {
    const uid = user?.id
    if (!uid) return
    const upsertData = {
      user_id: uid,
      target_pace: goalData.targetPace,
      race_date: goalData.raceDate || null,
      phase: goalData.phase || 'base',
      max_long_run: +goalData.maxLongRun || 15,
      week_num: +goalData.weekNum || 1,
      display_name: user.user_metadata?.full_name || '',
      avatar_url: user.user_metadata?.avatar_url || ''
    }
    const { error } = await supabase.from('profiles').upsert(upsertData, { onConflict: 'user_id' })
    if (error) { console.error('saveGoal error', error); return }
    setProfile(upsertData)
    if (!weekId) {
      const { data: nw } = await supabase.from('weeks')
        .insert({ user_id: uid, week_num: +goalData.weekNum||1, phase: goalData.phase||'base', target_volume: 40, notes: '' })
        .select().single()
      if (nw) { setWeekId(nw.id); setWeek(emptyWeek(+goalData.weekNum||1, goalData.phase||'base')) }
    }
    setEditGoal(false); setScreen('app')
  }

  // ── Save Week (manual + auto) ─────────────────────────────────────────────
  const doSave = useCallback(async (w, wid, uid) => {
    if (!wid || !uid) return
    setSaving(true)
    try {
      await supabase.from('weeks')
        .update({ phase: w.phase, target_volume: w.targetVolume, notes: w.notes })
        .eq('id', wid)
      for (const s of w.sessions) {
        const sessionData = {
          week_id: wid, user_id: uid,
          day_name: s.day, day_index: s.dayIndex ?? DAYS.indexOf(s.day),
          plan: s.plan || '', session_type: s.type || 'rest',
          done: s.done || false, distance: +s.distance || 0,
          duration: +s.duration || 0, pace: s.pace || '',
          hr: +s.hr || null, rpe: +s.rpe || 0,
          feel: s.feel || '', notes: s.notes || ''
        }
        // ตรวจสอบก่อนว่ามี Session อยู่แล้วไหม
        const { data: existing } = await supabase.from('sessions')
          .select('id').eq('week_id', wid).eq('day_name', s.day).maybeSingle()
        if (existing) {
          await supabase.from('sessions').update(sessionData).eq('id', existing.id)
        } else {
          await supabase.from('sessions').insert(sessionData)
        }
      }
      setSaveMsg('บันทึกแล้ว ✓')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (e) { console.error(e); setSaveMsg('บันทึกไม่สำเร็จ') }
    setSaving(false)
  }, [])

  const updateWeek = useCallback((w) => {
    setWeek(w)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      doSave(w, weekId, user?.id)
    }, 1500)
  }, [weekId, user, doSave])

  const manualSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    doSave(week, weekId, user?.id)
  }

  // ── Save Zones ────────────────────────────────────────────────────────────
  const saveZones = async (zData) => {
    const { data } = await supabase.from('zones')
      .insert({ user_id: user.id, ...zData }).select().single()
    setZones(data)
  }

  // ── Archive & Next ────────────────────────────────────────────────────────
  const archiveAndNext = async (nextWeek) => {
    if (!weekId || !user?.id) return
    await doSave(week, weekId, user.id)
    await supabase.from('weeks').update({ archived_at: new Date().toISOString() }).eq('id', weekId)
    const nw = nextWeek || emptyWeek((week.weekNum || 1) + 1, week.phase)
    const { data } = await supabase.from('weeks')
      .insert({ user_id: user.id, week_num: nw.weekNum, phase: nw.phase, target_volume: nw.targetVolume, notes: '' })
      .select().single()
    if (!data) return
    if (nw.sessions?.some(s => s.plan)) {
      for (const s of nw.sessions) await supabase.from('sessions').insert({
        week_id: data.id, user_id: user.id, day_name: s.day,
        day_index: DAYS.indexOf(s.day), plan: s.plan || '', session_type: s.type || 'rest', done: false
      })
    }
    setWeekId(data.id); setWeek(nw)
    setHistory(h => [...h, { ...week, archivedAt: new Date().toISOString() }])
    setAiResult(null); setValResult(null); setTab('plan')
  }

  // ── Plan Validator ────────────────────────────────────────────────────────
  const validatePlan = async () => {
    setValLoad(true); setValResult(null)
    try {
      const sys = `คุณคือโค้ชมาราธอน Elite ตรวจโปรแกรมการซ้อมว่าถูกหลักการ 80/20, Progressive Overload, Stress-Recovery, Phase Specificity ไหม ตอบ JSON เท่านั้น ห้ามมี markdown`
      const planText = week.sessions.map((d, i) => `${DAY_SHORT[i]}: ${d.plan || 'พัก'}`).join('\n')
      const hardDays = week.sessions.filter(d => ['interval','tempo','fastlek','longrun'].includes(d.type)).length
      const hasLR = week.sessions.some(d => d.type === 'longrun' && d.plan)
      const usr = `Phase:${week.phase} W${week.weekNum} เป้า:${week.targetVolume}km Pace:${profile?.target_pace||'5:30'}
โปรแกรม:\n${planText}
Hard sessions:${hardDays} Long run:${hasLR?'มี':'ไม่มี'}

ตอบ JSON (ห้ามมี markdown ห้ามมีข้อความนอก JSON):
{"verdict":"ผ่าน","score":85,"summary":"สรุป","checks":[{"rule":"80/20 Rule","pass":true,"comment":"ok"},{"rule":"วันหนักไม่ติดกัน","pass":true,"comment":"ok"},{"rule":"Long Run","pass":true,"comment":"ok"},{"rule":"Phase Specificity","pass":true,"comment":"ok"},{"rule":"Volume","pass":true,"comment":"ok"}],"warnings":[],"suggestions":["แนะนำ"]}`
      const raw = await callClaude(sys, usr)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      setValResult(JSON.parse(cleaned))
    } catch (e) { setValResult({ error: 'ตรวจไม่สำเร็จ: ' + e.message }) }
    setValLoad(false)
  }

  // ── AI Analysis ───────────────────────────────────────────────────────────
  const runAI = async () => {
    setAiLoad(true); setAiResult(null)
    try {
      const sys = `คุณคือโค้ชมาราธอน Elite ใช้หลักการ Maffetone, Daniels, Seiler 80/20, Norwegian Method ตอบภาษาไทย กระชับ ตอบ JSON เท่านั้น ห้ามมี markdown`
      const planText = week.sessions.map(d => `${d.day}: ${d.plan || (d.type === 'rest' ? 'พัก' : 'ไม่ได้วาง')}`).join('\n')
      const actText  = week.sessions.map(d => `${d.day}: ${d.done ? `✓ ${d.distance}km HR:${d.hr} RPE:${d.rpe} "${d.feel}"` : d.type === 'rest' ? 'พัก' : 'ไม่ได้ทำ'}`).join('\n')
      const prevText = history.slice(-3).map(w2 => `W${w2.weekNum}[${w2.phase}]:vol=${totalVol(w2).toFixed(1)}km RPE=${avgRPE(w2)} LR=${lrKm(w2)}km`).join('\n')
      const zoneInfo = zones ? `Zone:Easy${zones.fatmax_slow}-${zones.lt1_fast}|LT2${zones.lt2_slow}-${zones.lt2_fast}|MP${zones.marathon_pace}` : '(ยังไม่ได้ทำ Speed Test)'
      const usr = `Pace:${profile?.target_pace||'5:30'} Phase:${week.phase} W${week.weekNum} วันแข่ง:${profile?.race_date||'ไม่ได้ตั้ง'}\n${zoneInfo}\nแผน:\n${planText}\nจริง:\n${actText}\nVol:${totalVol(week).toFixed(1)}/${week.targetVolume}km RPE:${avgRPE(week)} LR:${lrKm(week)}km\nNote:${week.notes||'-'}\nประวัติ:\n${prevText||'ยังไม่มี'}\n\nตอบ JSON:{"assessment":"...","signals":["s1","s2"],"decision":"เพิ่ม|คงที่|ถอย|DownWeek","reason":"...","nextPhase":"base","nextVolume":42,"coachTip":"...","nextPlan":[{"day":"จันทร์","plan":"พัก"},{"day":"อังคาร","plan":"Easy 60 นาที + Stride ×4"},{"day":"พุธ","plan":"พัก"},{"day":"พฤหัส","plan":"Fastlek 1/1 ×18"},{"day":"ศุกร์","plan":"Long run 18 km Easy"},{"day":"เสาร์","plan":"Easy 50 นาที"},{"day":"อาทิตย์","plan":"พัก"}]}`
      const raw = await callClaude(sys, usr)
      setAiResult(JSON.parse(raw.replace(/```json|```/g, '').trim()))
    } catch (e) { setAiResult({ error: 'วิเคราะห์ไม่สำเร็จ: ' + e.message }) }
    setAiLoad(false)
  }

  const applyAIPlan = () => {
    if (!aiResult?.nextPlan) return
    const nw = {
      ...emptyWeek((week.weekNum || 1) + 1, aiResult.nextPhase || week.phase),
      targetVolume: aiResult.nextVolume || week.targetVolume,
      sessions: DAYS.map((dayName, i) => {
        const ai = aiResult.nextPlan.find(x => x.day === dayName)
        const p = ai?.plan || ''
        return { ...emptyDay(dayName, i), plan: p, type: guessType(p) }
      })
    }
    archiveAndNext(nw)
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  if (screen === 'loading') return <Loader />
  if (screen === 'login')   return <LoginScreen onLogin={loginWithGoogle} />
  if (screen === 'goal' || editGoal) return <GoalScreen profile={profile} user={user} onSave={saveGoal} isEdit={editGoal} onCancel={() => setEditGoal(false)} />

  const daysLeft = profile?.race_date ? Math.max(0, Math.ceil((new Date(profile.race_date) - new Date()) / (1000 * 60 * 60 * 24))) : null
  const volGuide = getVolumeGuide(week.phase, week.weekNum, history.length ? totalVol(history[history.length-1]) : 0)

  const screens = {
    plan:    <PlanScreen    week={week} onUpdate={updateWeek} valResult={valResult} valLoad={valLoad} onValidate={validatePlan} saving={saving} saveMsg={saveMsg} onManualSave={manualSave} volGuide={volGuide} />,
    log:     <LogScreen     week={week} onUpdate={updateWeek} activeDay={activeDay} setActiveDay={setActiveDay} saving={saving} saveMsg={saveMsg} onManualSave={manualSave} />,
    summary: <SummaryScreen week={week} profile={profile} aiResult={aiResult} aiLoad={aiLoad} onAnalyze={runAI} onApply={applyAIPlan} onArchive={() => archiveAndNext()} onGoLog={() => setTab('log')} />,
    volume:  <VolumeScreen  profile={profile} zones={zones} prevVol={history.length ? totalVol(history[history.length-1]) : 0} phase={week.phase} />,
    zone:    <ZoneScreen    userId={user?.id} zones={zones} onSave={saveZones} />,
    history: <HistoryScreen history={history} />,
  }

  return (
    <div style={{ background:'#0a0f1a', minHeight:'100vh', color:'#ffffff', fontFamily:"'Courier New',monospace", paddingBottom:80 }}>
      {/* Header */}
      <div style={{ background:'#0d1117', borderBottom:'1px solid #1f2937', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {user?.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} style={{ width:28, height:28, borderRadius:'50%' }} />}
          <div style={{ fontSize:13, fontWeight:'bold', color:'#22c55e', letterSpacing:2 }}>🏃 MARATHON COACH</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {daysLeft !== null && <div style={{ fontSize:11, color:'#f59e0b' }}>⏱ {daysLeft} วัน</div>}
          <button onClick={() => setEditGoal(true)} style={{ background:'none', border:'1px solid #374151', color:'#9ca3af', borderRadius:8, padding:'4px 10px', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>⚙️ Goal</button>
          <button onClick={logout} style={{ background:'none', border:'none', color:'#4b5563', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>ออก</button>
        </div>
      </div>

      {/* Goal Bar */}
      <div style={{ background:'#111827', borderBottom:'1px solid #1f2937', padding:'8px 16px', display:'flex', gap:20, overflowX:'auto' }}>
        {[
          { l:'Pace เป้า', v: profile?.target_pace || '-', c:'#22c55e' },
          { l:'Phase',     v: phaseObj(week.phase).label,   c: phaseObj(week.phase).color },
          { l:'สัปดาห์',   v: `W${week.weekNum}`,           c:'#3b82f6' },
          { l:'วันแข่ง',   v: profile?.race_date ? new Date(profile.race_date).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'}) : 'ยังไม่ตั้ง', c:'#f59e0b' },
        ].map(s => (
          <div key={s.l} style={{ flexShrink:0, textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#6b7280', letterSpacing:1 }}>{s.l}</div>
            <div style={{ fontSize:17, fontWeight:'bold', color:s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {screens[tab] || screens.plan}
      <BottomNav tab={tab} setTab={setTab} done={doneSess(week)} hasZone={!!zones} saving={saving} />
    </div>
  )
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#0a0f1a,#0f1f10)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ fontSize:56, marginBottom:8 }}>🏃</div>
      <div style={{ fontSize:28, fontWeight:'bold', color:'#22c55e', letterSpacing:3, marginBottom:4 }}>MARATHON COACH</div>
      <div style={{ color:'#6b7280', marginBottom:12, fontSize:13, textAlign:'center' }}>Self-Coached Marathon Platform</div>
      <div style={{ color:'#4b5563', marginBottom:40, fontSize:12, textAlign:'center' }}>วางแผน · บันทึก · วิเคราะห์ด้วย AI</div>
      <button onClick={onLogin} style={{ display:'flex', alignItems:'center', gap:12, background:'#fff', color:'#1f2937', border:'none', borderRadius:12, padding:'14px 28px', cursor:'pointer', fontWeight:'bold', fontSize:15, fontFamily:'inherit' }}>
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Login ด้วย Google
      </button>
    </div>
  )
}

// ── GOAL SCREEN ───────────────────────────────────────────────────────────────
function GoalScreen({ profile, user, onSave, isEdit, onCancel }) {
  const [f, setF] = useState({
    targetPace: profile?.target_pace || '5:30',
    raceDate:   profile?.race_date   || '',
    phase:      profile?.phase       || 'base',
    maxLongRun: profile?.max_long_run|| 15,
    weekNum:    profile?.week_num    || 1,
  })
  const s = (k, v) => setF(x => ({ ...x, [k]: v }))
  const ph = phaseObj(f.phase)
  const daysLeft = f.raceDate ? Math.max(0, Math.ceil((new Date(f.raceDate) - new Date()) / (1000*60*60*24))) : null

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#0a0f1a,#0f1f10)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ fontSize:36, marginBottom:8 }}>{isEdit ? '⚙️' : '🎯'}</div>
      <div style={{ fontSize:22, fontWeight:'bold', color:'#22c55e', letterSpacing:2, marginBottom:4 }}>{isEdit ? 'แก้ไข Goal' : 'ตั้ง Goal มาราธอน'}</div>
      {user && <div style={{ color:'#6b7280', marginBottom:24, fontSize:12 }}>สวัสดี {user.user_metadata?.full_name || user.email}</div>}
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:16, padding:28, width:'100%', maxWidth:420 }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ color:'#9ca3af', fontSize:12, marginBottom:6 }}>🎯 Target Pace มาราธอน (min:sec/km)</div>
          <input value={f.targetPace} onChange={e => s('targetPace', e.target.value)} placeholder="5:30" style={IC} />
          <div style={{ fontSize:11, color:'#4b5563', marginTop:4 }}>พิมพ์เป็น mm:ss เช่น 5:30</div>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ color:'#9ca3af', fontSize:12, marginBottom:6 }}>📅 วันแข่ง</div>
          <input type="date" value={f.raceDate} onChange={e => s('raceDate', e.target.value)} style={IC} />
          {daysLeft !== null && <div style={{ fontSize:11, color:'#f59e0b', marginTop:4 }}>เหลืออีก {daysLeft} วัน</div>}
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ color:'#9ca3af', fontSize:12, marginBottom:8 }}>📍 Phase ปัจจุบัน</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            {PHASES.map(p => (
              <button key={p.id} onClick={() => s('phase', p.id)} style={{ padding:'10px 8px', borderRadius:8, border:`2px solid ${f.phase===p.id?p.color:'#374151'}`, background:f.phase===p.id?p.bg:'transparent', color:f.phase===p.id?p.color:'#6b7280', cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:'bold', textAlign:'left' }}>
                <div>{p.label}</div><div style={{ fontSize:10, fontWeight:'normal', marginTop:2 }}>{p.weeks} สัปดาห์</div>
              </button>
            ))}
          </div>
          <div style={{ background:ph.bg, borderRadius:8, padding:'8px 12px', fontSize:12, color:ph.color }}>{ph.desc}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
          <div><div style={{ color:'#9ca3af', fontSize:12, marginBottom:6 }}>📏 Long Run สูงสุด (km)</div><input type="number" value={f.maxLongRun} onChange={e => s('maxLongRun', e.target.value)} style={IC} /></div>
          <div><div style={{ color:'#9ca3af', fontSize:12, marginBottom:6 }}>📆 สัปดาห์ที่</div><input type="number" value={f.weekNum} onChange={e => s('weekNum', e.target.value)} style={IC} /></div>
        </div>
        <button onClick={() => onSave(f)} style={{ ...BTN('#22c55e'), width:'100%', padding:14, fontSize:15, marginBottom: isEdit ? 10 : 0 }}>
          {isEdit ? 'บันทึก Goal ใหม่ →' : 'เริ่มต้น →'}
        </button>
        {isEdit && <button onClick={onCancel} style={{ ...BTN('#1f2937', '#9ca3af'), width:'100%', fontSize:13 }}>ยกเลิก</button>}
      </div>
    </div>
  )
}

// ── PLAN SCREEN ───────────────────────────────────────────────────────────────
function PlanScreen({ week, onUpdate, valResult, valLoad, onValidate, saving, saveMsg, onManualSave, volGuide }) {
  const ph = phaseObj(week.phase)
  const vc = { 'ผ่าน':'#22c55e', 'ปรับเล็กน้อย':'#f59e0b', 'ต้องแก้':'#ef4444' }
  const sc = s => s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'

  const updDay = (i, plan) => {
    const sessions = week.sessions.map((d, idx) => idx === i ? { ...d, plan, type: guessType(plan) } : d)
    onUpdate({ ...week, sessions })
  }

  // Guard Rail — ตรวจ Hard Session ติดกัน
  const hardWarnings = week.sessions.map((d, i) => {
    if (i === 0) return null
    const prevHard = ['interval','tempo','fastlek','longrun'].includes(week.sessions[i-1].type)
    const currHard = ['interval','tempo','fastlek','longrun'].includes(d.type)
    if (prevHard && currHard) return `⚠️ ${week.sessions[i-1].day} + ${d.day} หนักติดกัน ควรมี Easy คั่น`
    return null
  }).filter(Boolean)

  return (
    <div style={{ padding:'16px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:13, color:'#9ca3af', letterSpacing:2 }}>วางแผนสัปดาห์ที่</div>
          <div style={{ fontSize:48, fontWeight:'bold', color:'#ffffff', lineHeight:1 }}>{week.weekNum}</div>
        </div>
        <PhasePicker phase={week.phase} onChange={p => onUpdate({ ...week, phase: p })} />
      </div>

      {/* Phase + Volume */}
      <div style={{ background:ph.bg, border:`1px solid ${ph.color}30`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:10, color:ph.color, letterSpacing:1 }}>{ph.label}</div>
          <div style={{ fontSize:12, color:'#9ca3af' }}>{ph.desc}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, color:'#6b7280' }}>เป้า</span>
          <input value={week.targetVolume} onChange={e => onUpdate({ ...week, targetVolume: e.target.value })} type="number" style={{ ...IC, width:50, textAlign:'center', padding:'4px 6px', fontSize:14, fontWeight:'bold', color:'#3b82f6' }} />
          <span style={{ fontSize:11, color:'#6b7280' }}>km</span>
        </div>
      </div>

      {/* Volume Guide */}
      <div style={{ background:'#0d1520', border:'1px solid #1e3a5f', borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
        <div style={{ fontSize:11, color:'#93c5fd', fontWeight:'bold', marginBottom:6 }}>
          {volGuide.isDownWeek ? '📉 Down Week — ลด Volume 30-40%' : `💡 แนะนำสัปดาห์นี้ (${ph.label})`}
        </div>
        <div style={{ display:'flex', gap:12, marginBottom:6 }}>
          <span style={{ fontSize:12, color:'#f9fafb' }}>Volume: <strong style={{ color:'#3b82f6' }}>{volGuide.suggested} km</strong></span>
          <span style={{ fontSize:12, color:'#4b5563' }}>({volGuide.min}-{volGuide.max} km)</span>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {ph.sessions.map((s, i) => (
            <span key={i} style={{ fontSize:10, background:'#1e3a5f', color:'#93c5fd', borderRadius:4, padding:'2px 6px' }}>{s}</span>
          ))}
        </div>
      </div>

      {/* Guard Rail Warnings */}
      {hardWarnings.length > 0 && (
        <div style={{ background:'#1c0a0a', border:'1px solid #7f1d1d', borderRadius:8, padding:'8px 12px', marginBottom:12 }}>
          {hardWarnings.map((w, i) => <div key={i} style={{ fontSize:12, color:'#fca5a5' }}>{w}</div>)}
        </div>
      )}

      {/* Tip */}
      <div style={{ background:'#0d1520', border:'1px solid #1e3a5f', borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#93c5fd' }}>
        💡 <span style={{ color:'#60a5fa' }}>Easy 60 + Stride 100×3</span> · <span style={{ color:'#f87171' }}>400×12 rest1min</span> · <span style={{ color:'#34d399' }}>Long run 18km</span>
      </div>

      {/* Day Plans */}
      {week.sessions.map((d, i) => {
        const so = sessObj(d.type)
        const hasPlan = d.plan && d.plan.trim() && d.plan !== '-'
        const vday = valResult?.dayFeedback?.[i]
        return (
          <div key={i} style={{ background:'#111827', border:`1px solid ${hasPlan ? so.color+'50' : '#1f2937'}`, borderRadius:12, marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px' }}>
              <div style={{ width:34, textAlign:'center', flexShrink:0 }}>
                <div style={{ fontSize:11, color:'#9ca3af' }}>{DAY_SHORT[i]}</div>
                <div style={{ fontSize:22, lineHeight:1.4 }}>{so.icon}</div>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, color:so.color, fontWeight:'bold', marginBottom:3 }}>{d.day}</div>
                <input value={d.plan} onChange={e => updDay(i, e.target.value)} placeholder="พัก / Easy 60 min / 400×12 rest1min ..." style={{ ...IC, padding:'10px 12px', fontSize:15, border:'none', background:'#1a2030' }} />
              </div>
              {d.done && <div style={{ fontSize:14 }}>✅</div>}
            </div>
            {vday && !vday.ok && vday.comment && <div style={{ padding:'4px 14px 8px 60px', fontSize:11, color:'#fbbf24' }}>⚠️ {vday.comment}</div>}
          </div>
        )
      })}

      {/* Save Button */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:4, marginBottom:10 }}>
        <button onClick={onManualSave} disabled={saving} style={{ ...BTN(saving ? '#374151' : '#3b82f6', '#fff') }}>
          {saving ? '⏳ กำลังบันทึก...' : saveMsg || '💾 บันทึกแผน'}
        </button>
        <button onClick={onValidate} disabled={valLoad} style={{ ...BTN(valLoad ? '#1f2937' : '#7c3aed', '#fff') }}>
          {valLoad ? '⏳ กำลังตรวจ...' : '🔍 ตรวจโปรแกรม'}
        </button>
      </div>

      {/* Validator Result */}
      {valResult && !valResult.error && (
        <div style={{ background:'#0d1117', border:`1px solid ${(vc[valResult.verdict]||'#374151')+'50'}`, borderRadius:14, padding:16, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:11, color:'#6b7280', letterSpacing:2 }}>PLAN VALIDATOR</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:22, fontWeight:'bold', color:sc(valResult.score||0) }}>{valResult.score}</div>
              <div style={{ background:(vc[valResult.verdict]||'#374151')+'25', color:vc[valResult.verdict]||'#9ca3af', padding:'3px 10px', borderRadius:99, fontSize:12, fontWeight:'bold' }}>{valResult.verdict}</div>
            </div>
          </div>
          <div style={{ fontSize:13, color:'#d1d5db', marginBottom:10, lineHeight:1.6 }}>{valResult.summary}</div>
          {valResult.checks?.map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:5, fontSize:12 }}>
              <span style={{ color:c.pass?'#22c55e':'#ef4444', flexShrink:0 }}>{c.pass?'✓':'✗'}</span>
              <div><span style={{ color:c.pass?'#9ca3af':'#fca5a5', fontWeight:'bold' }}>{c.rule}</span>{c.comment&&<span style={{ color:'#6b7280' }}> — {c.comment}</span>}</div>
            </div>
          ))}
          {valResult.suggestions?.length > 0 && (
            <div style={{ background:'#0f1a30', borderRadius:8, padding:10, marginTop:8 }}>
              {valResult.suggestions.map((s, i) => <div key={i} style={{ fontSize:12, color:'#93c5fd', marginBottom:3 }}>→ {s}</div>)}
            </div>
          )}
        </div>
      )}
      {valResult?.error && <div style={{ background:'#1c0a0a', border:'1px solid #7f1d1d', borderRadius:10, padding:12, color:'#fca5a5', fontSize:12, marginBottom:10 }}>{valResult.error}</div>}
    </div>
  )
}

// ── LOG SCREEN ────────────────────────────────────────────────────────────────
function LogScreen({ week, onUpdate, activeDay, setActiveDay, saving, saveMsg, onManualSave }) {
  const updAct = (di, field, val) => {
    const sessions = week.sessions.map((d, i) => i === di ? { ...d, [field]: val } : d)
    onUpdate({ ...week, sessions })
  }
  const vol = totalVol(week), pct = Math.min(100, (vol / (week.targetVolume||1)) * 100)

  return (
    <div style={{ padding:'16px 16px' }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:18, fontWeight:'bold', color:'#f9fafb' }}>บันทึกผลการซ้อม</div>
        <div style={{ fontSize:12, color:'#6b7280' }}>W{week.weekNum} — {doneSess(week)}/{planSess(week)} session</div>
      </div>

      {/* Volume Bar */}
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
          <span style={{ color:'#9ca3af' }}>Volume สะสม</span>
          <span style={{ color:pct>=100?'#22c55e':'#3b82f6', fontWeight:'bold', fontSize:16 }}>{vol.toFixed(1)} / {week.targetVolume} km ({pct.toFixed(0)}%)</span>
        </div>
        <div style={{ background:'#1f2937', borderRadius:99, height:10 }}>
          <div style={{ width:`${pct}%`, background:pct>=100?'#22c55e':'#3b82f6', borderRadius:99, height:10, transition:'width 0.4s' }} />
        </div>
        <div style={{ display:'flex', gap:5, marginTop:10, justifyContent:'center' }}>
          {week.sessions.map((d, i) => {
            const so = sessObj(d.type)
            return (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <div style={{ width:28, height:28, borderRadius:6, background:d.done?so.color+'30':'#1f2937', border:`1px solid ${d.done?so.color:'#374151'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, cursor:'pointer' }} onClick={() => setActiveDay(activeDay===i?null:i)}>
                  {d.done ? so.icon : d.type==='rest' ? '💤' : '○'}
                </div>
                <div style={{ fontSize:8, color:'#4b5563' }}>{DAY_SHORT[i]}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day Cards */}
      {week.sessions.map((d, i) => {
        const so = sessObj(d.type), open = activeDay === i, hasPlan = d.plan && d.plan.trim() && d.plan !== '-'
        return (
          <div key={i} style={{ background:'#111827', border:`1px solid ${d.done?so.color+'60':'#1f2937'}`, borderRadius:12, marginBottom:8, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', cursor:'pointer' }} onClick={() => setActiveDay(open?null:i)}>
              <input type="checkbox" checked={d.done} onChange={e => { e.stopPropagation(); updAct(i,'done',e.target.checked) }} style={{ width:18, height:18, accentColor:so.color, cursor:'pointer', flexShrink:0 }} onClick={e => e.stopPropagation()} />
              <div style={{ width:30, textAlign:'center', flexShrink:0 }}><div style={{ fontSize:8, color:'#6b7280' }}>{DAY_SHORT[i]}</div><div style={{ fontSize:16 }}>{so.icon}</div></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:17, fontWeight:'bold', color:d.done?so.color:'#d1d5db' }}>{d.day}</div>
                {hasPlan && <div style={{ fontSize:11, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:1 }}>📋 {d.plan}</div>}
                {d.done && <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{[d.distance&&`${d.distance}km`, d.pace&&`${d.pace}/km`, d.hr&&`HR${d.hr}`, d.rpe>0&&`RPE${d.rpe}`].filter(Boolean).join(' · ')}</div>}
              </div>
              <span style={{ color:'#4b5563', fontSize:11, flexShrink:0 }}>{open?'▲':'▼'}</span>
            </div>
            {open && (
              <div style={{ padding:'0 14px 16px', borderTop:'1px solid #1f2937' }}>
                {/* Session Type */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:5, margin:'10px 0 12px' }}>
                  {SESSION_TYPES.map(st => (
                    <button key={st.id} onClick={() => updAct(i,'type',st.id)} style={{ padding:'4px 8px', border:`1px solid ${d.type===st.id?st.color:'#374151'}`, background:d.type===st.id?st.color+'20':'transparent', color:d.type===st.id?st.color:'#6b7280', borderRadius:99, cursor:'pointer', fontSize:10, fontFamily:'inherit' }}>
                      {st.icon} {st.label}
                    </button>
                  ))}
                </div>
                {hasPlan && <div style={{ background:'#0d1520', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#93c5fd' }}><span style={{ color:'#4b5563' }}>แผน: </span>{d.plan}</div>}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  {[{label:'ระยะทาง (km)',key:'distance',type:'number',ph:'0.0',step:'0.1'},{label:'เวลา (นาที)',key:'duration',type:'number',ph:'60'},{label:'Pace (min:sec/km)',key:'pace',type:'text',ph:'5:30'},{label:'HR เฉลี่ย (bpm)',key:'hr',type:'number',ph:'140'}].map(({label,key,type,ph,step}) => (
                    <div key={key}><div style={{ fontSize:10, color:'#6b7280', marginBottom:4 }}>{label}</div><input type={type} value={d[key]||''} step={step} onChange={e => updAct(i,key,e.target.value)} placeholder={ph} style={{ ...IC, padding:'8px 10px' }} /></div>
                  ))}
                </div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6b7280', marginBottom:6 }}><span>RPE (ความหนัก)</span><span style={{ color:['#22c55e','#22c55e','#22c55e','#84cc16','#84cc16','#f59e0b','#f59e0b','#f97316','#ef4444','#ef4444','#dc2626'][d.rpe||0], fontWeight:'bold', fontSize:16 }}>{d.rpe||0}/10</span></div>
                  <input type="range" min="0" max="10" value={d.rpe||0} onChange={e => updAct(i,'rpe',+e.target.value)} style={{ width:'100%', accentColor:so.color }} />
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#4b5563' }}><span>สบาย</span><span>ปานกลาง</span><span>หนักมาก</span></div>
                </div>
                <div style={{ marginBottom:10 }}><div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>ความรู้สึก</div><input value={d.feel||''} onChange={e => updAct(i,'feel',e.target.value)} style={{ ...IC, padding:'8px 10px' }} placeholder="ขา HR ฟอร์ม ความเหนื่อย..." /></div>
                <div><div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>รายละเอียดเพิ่มเติม</div><textarea value={d.notes||''} onChange={e => updAct(i,'notes',e.target.value)} style={{ ...IC, height:60, resize:'none', fontSize:12 }} placeholder="Split time, รอบที่ทำได้, สภาพอากาศ..." /></div>
              </div>
            )}
          </div>
        )
      })}

      {/* Notes + Save */}
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:12, padding:14, marginTop:4, marginBottom:12 }}>
        <div style={{ fontSize:11, color:'#6b7280', marginBottom:6 }}>📝 NOTE สัปดาห์นี้</div>
        <textarea value={week.notes} onChange={e => onUpdate({ ...week, notes:e.target.value })} placeholder="ชีวิต นอน งาน ครอบครัว ความรู้สึกโดยรวม..." style={{ ...IC, height:70, resize:'none', fontSize:13 }} />
      </div>
      <button onClick={onManualSave} disabled={saving} style={{ ...BTN(saving?'#374151':'#22c55e', saving?'#9ca3af':'#000'), width:'100%' }}>
        {saving ? '⏳ กำลังบันทึก...' : saveMsg || '💾 บันทึกผลการซ้อม'}
      </button>
    </div>
  )
}

// ── SUMMARY SCREEN ────────────────────────────────────────────────────────────
function SummaryScreen({ week, profile, aiResult, aiLoad, onAnalyze, onApply, onArchive, onGoLog }) {
  const ph = phaseObj(week.phase), vol = totalVol(week), pct = Math.min(100, (vol/(week.targetVolume||1))*100)
  const DC = { 'เพิ่ม':'#22c55e', 'คงที่':'#3b82f6', 'ถอย':'#f59e0b', 'DownWeek':'#a78bfa' }
  return (
    <div style={{ padding:'16px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div><div style={{ fontSize:11, color:'#6b7280', letterSpacing:2 }}>สรุปสัปดาห์ที่</div><div style={{ fontSize:36, fontWeight:'bold', color:'#f9fafb' }}>{week.weekNum}</div></div>
        <div style={{ background:ph.bg, color:ph.color, border:`1px solid ${ph.color}40`, borderRadius:6, padding:'4px 12px', fontSize:11, fontWeight:'bold', letterSpacing:2 }}>{ph.label}</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
        {[{l:'Volume',v:`${vol.toFixed(1)}`,u:'km',c:'#3b82f6'},{l:'Sessions',v:`${doneSess(week)}`,u:`/${planSess(week)}`,c:'#22c55e'},{l:'RPE',v:avgRPE(week),u:'/10',c:'#f59e0b'},{l:'เป้า',v:`${pct.toFixed(0)}`,u:'%',c:pct>=100?'#22c55e':'#6b7280'}].map(s => (
          <div key={s.l} style={{ background:'#0d1117', border:'1px solid #1f2937', borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#9ca3af' }}>{s.l}</div>
            <div style={{ fontSize:24, fontWeight:'bold', color:s.c, lineHeight:1.2 }}>{s.v}<span style={{ fontSize:10, color:'#6b7280' }}>{s.u}</span></div>
          </div>
        ))}
      </div>
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:12, padding:14, marginBottom:14 }}>
        <div style={{ fontSize:11, color:'#6b7280', letterSpacing:2, marginBottom:10 }}>PLAN vs ACTUAL</div>
        {week.sessions.map((d, i) => {
          const so = sessObj(d.type), hasPlan = d.plan&&d.plan.trim()&&d.plan!=='-'
          if (!hasPlan && !d.done) return null
          return (
            <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid #1f2937' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}><span>{so.icon}</span><span style={{ fontSize:13, fontWeight:'bold', color:so.color }}>{d.day}</span></div>
              {hasPlan && <div style={{ fontSize:11, color:'#374151', paddingLeft:22, marginBottom:2 }}>📋 {d.plan}</div>}
              {d.done ? <div style={{ paddingLeft:22 }}>
                <div style={{ fontSize:11, color:'#86efac' }}>✓ {[d.distance&&`${d.distance}km`, d.pace&&`Pace ${d.pace}`, d.hr&&`HR ${d.hr}`, d.rpe>0&&`RPE ${d.rpe}`].filter(Boolean).join(' · ')}</div>
                {d.feel && <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>💬 "{d.feel}"</div>}
              </div> : hasPlan&&d.type!=='rest' ? <div style={{ fontSize:11, color:'#7f1d1d', paddingLeft:22 }}>✗ ไม่ได้ทำ</div> : null}
            </div>
          )
        })}
        {week.notes && <div style={{ fontSize:12, color:'#9ca3af', fontStyle:'italic' }}>📝 "{week.notes}"</div>}
      </div>
      {!aiResult && <button onClick={onAnalyze} disabled={aiLoad} style={{ ...BTN(aiLoad?'#374151':'#22c55e', aiLoad?'#9ca3af':'#000'), width:'100%', marginBottom:10 }}>{aiLoad?'⏳ AI กำลังวิเคราะห์...':'🤖 ให้ AI วิเคราะห์ + ออกโปรแกรมสัปดาห์หน้า'}</button>}
      {aiResult && !aiResult.error && (
        <div style={{ background:'#0d1117', border:`1px solid ${(DC[aiResult.decision]||'#374151')+'50'}`, borderRadius:14, padding:16, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:11, color:'#6b7280', letterSpacing:2 }}>AI COACH</div>
            <div style={{ background:(DC[aiResult.decision]||'#374151')+'25', color:DC[aiResult.decision]||'#9ca3af', padding:'3px 12px', borderRadius:99, fontSize:12, fontWeight:'bold' }}>{aiResult.decision}</div>
          </div>
          <div style={{ fontSize:13, color:'#d1d5db', marginBottom:10, lineHeight:1.65 }}>{aiResult.assessment}</div>
          {aiResult.signals?.map((s,i) => <div key={i} style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>• {s}</div>)}
          <div style={{ fontSize:12, color:'#9ca3af', margin:'8px 0', fontStyle:'italic' }}>{aiResult.reason}</div>
          {aiResult.nextPlan && <div style={{ background:'#111827', borderRadius:10, padding:12, marginTop:10 }}>
            <div style={{ fontSize:11, color:'#6b7280', marginBottom:8 }}>โปรแกรมสัปดาห์หน้า — Vol {aiResult.nextVolume} km</div>
            {aiResult.nextPlan.map((s,i) => <div key={i} style={{ display:'flex', gap:8, marginBottom:5, fontSize:12 }}><span style={{ color:'#4b5563', width:42, flexShrink:0 }}>{s.day.slice(0,3)}</span><span style={{ flexShrink:0 }}>{sessObj(guessType(s.plan)).icon}</span><span style={{ color:'#d1d5db' }}>{s.plan}</span></div>)}
          </div>}
          {aiResult.coachTip && <div style={{ background:'#0f2015', border:'1px solid #22c55e20', borderRadius:8, padding:10, fontSize:12, color:'#86efac', marginTop:10 }}>💡 {aiResult.coachTip}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
            <button onClick={onApply} style={BTN('#22c55e')}>✅ ใช้โปรแกรม AI</button>
            <button onClick={onAnalyze} style={BTN('#1f2937','#9ca3af')}>🔄 วิเคราะห์ใหม่</button>
          </div>
        </div>
      )}
      {aiResult?.error && <div style={{ background:'#1c0a0a', border:'1px solid #7f1d1d', borderRadius:10, padding:12, color:'#fca5a5', fontSize:12, marginBottom:10 }}>{aiResult.error}</div>}
      <button onClick={onGoLog} style={{ ...BTN('#1f2937','#9ca3af'), width:'100%', marginBottom:8 }}>✏️ กลับไปแก้ไขข้อมูล</button>
      <button onClick={onArchive} style={{ ...BTN('#111827','#6b7280'), width:'100%', fontSize:12 }}>เก็บสัปดาห์นี้และเริ่มสัปดาห์ใหม่</button>
    </div>
  )
}

// ── VOLUME SCREEN ─────────────────────────────────────────────────────────────
function VolumeScreen({ profile, zones, prevVol, phase }) {
  const [target,   setTarget]   = useState(40)
  const [longRun,  setLongRun]  = useState(18)
  const [sessions, setSessions] = useState([])
  const [result,   setResult]   = useState(null)
  const ph = phaseObj(phase)
  const LR_GUIDE = { base:[['W1-4','14-18'],['W5-8','18-22']], build:[['W1-4','22-26'],['W5-8','26-28']], peak:[['W1-4','28-32'],['W5-8','30-35']], taper:[['W1-2','16-20']] }
  const SC = { easy:'#22c55e', fastlek:'#f59e0b', interval:'#ef4444', tempo:'#f97316', stride:'#a78bfa' }

  const addSession = type => {
    const def = {
      easy:     { type:'easy',     minutes:60, pace:'6:30' },
      fastlek:  { type:'fastlek',  ratio:'1:1', rounds:18, fastPace:zones?.lt2_slow||'5:10', slowPace:zones?.moderate_slow||'6:20' },
      interval: { type:'interval', dist:1000, sets:8 },
      tempo:    { type:'tempo',    km:10 },
      stride:   { type:'stride',   reps:4 },
    }
    setSessions(s => [...s, { id:Date.now(), ...def[type] }]); setResult(null)
  }

  const calculate = () => {
    const items = []; let qualityKm = 0
    sessions.forEach(s => {
      let km = 0, label = ''
      if (s.type==='easy') { km=(+s.minutes/60)*(60/paceToDecimal(s.pace||'6:30')); label=`Easy ${s.minutes}นาที` }
      else if (s.type==='fastlek') { const fp=paceToDecimal(s.fastPace||'5:10'),sp=paceToDecimal(s.slowPace||'6:20'),r=s.ratio==='1:1'?[1,1]:[2,1]; km=((r[0]*+s.rounds/60)*(60/fp))+((r[1]*+s.rounds/60)*(60/sp)); label=`Fastlek ${s.ratio}×${s.rounds}`; qualityKm+=km }
      else if (s.type==='interval') { km=((+s.dist*+s.sets)/1000)+2; label=`Interval ${s.dist}m×${s.sets}`; qualityKm+=km }
      else if (s.type==='tempo') { km=+s.km+2; label=`Tempo ${s.km}km`; qualityKm+=km }
      else if (s.type==='stride') { km=(+s.reps*100/1000)+0.5; label=`Stride ×${s.reps}` }
      items.push({ label, km:+km.toFixed(1), type:s.type })
    })
    const total = +longRun + items.reduce((a,x)=>a+x.km,0)
    setResult({ items, total, rem:+target-total, qualityKm, target:+target, lrKm:+longRun })
  }

  const pct = (v,t) => Math.min(100, Math.round((v/t)*100))

  return (
    <div style={{ padding:'16px 16px' }}>
      <div style={{ fontSize:11, color:'#6b7280', letterSpacing:2, marginBottom:4 }}>PLANNING TOOL</div>
      <div style={{ fontSize:22, fontWeight:'bold', color:'#f9fafb', marginBottom:14 }}>🧮 Volume Calculator</div>
      {zones && <div style={{ background:'#0d1520', border:'1px solid #1e3a5f', borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:11, color:'#93c5fd' }}>✓ ใช้ Zone จาก Speed Test: Fast {zones.lt2_slow} / Slow {zones.moderate_slow}</div>}
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:12, padding:14, marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div><div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>🎯 Target Volume (km)</div><input type="number" value={target} onChange={e=>{setTarget(e.target.value);setResult(null)}} style={{ ...IC, fontSize:18, fontWeight:'bold', color:'#3b82f6', textAlign:'center' }}/></div>
          <div><div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>⭐ Long Run (km)</div><input type="number" value={longRun} onChange={e=>{setLongRun(e.target.value);setResult(null)}} style={{ ...IC, fontSize:18, fontWeight:'bold', color:'#f59e0b', textAlign:'center' }}/></div>
        </div>
        <div style={{ background:'#0d1520', borderRadius:8, padding:'6px 10px', display:'flex', gap:10, flexWrap:'wrap' }}>
          {(LR_GUIDE[phase]||[]).map(([w,r]) => <span key={w} style={{ fontSize:11, color:ph.color }}>{w}: <b>{r} km</b></span>)}
        </div>
      </div>
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:12, padding:14, marginBottom:14 }}>
        <div style={{ fontSize:11, color:'#6b7280', marginBottom:10 }}>เพิ่ม SESSION</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
          {[{t:'easy',l:'🟢 Easy'},{t:'fastlek',l:'🟡 Fastlek'},{t:'interval',l:'🔴 Interval'},{t:'tempo',l:'🟠 Tempo'},{t:'stride',l:'⚡ Stride'}].map(b => (
            <button key={b.t} onClick={() => addSession(b.t)} style={{ padding:'7px 12px', border:`1px solid ${SC[b.t]||'#374151'}50`, background:(SC[b.t]||'#374151')+'15', color:SC[b.t]||'#9ca3af', borderRadius:8, cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:'bold' }}>+ {b.l}</button>
          ))}
        </div>
        {sessions.length===0 && <div style={{ textAlign:'center', color:'#374151', fontSize:13, padding:'16px 0' }}>กด + เพื่อเพิ่ม Session</div>}
        {sessions.map(s => (
          <div key={s.id} style={{ background:'#0d1117', border:`1px solid ${SC[s.type]||'#374151'}40`, borderRadius:10, padding:12, marginBottom:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:'bold', color:SC[s.type]||'#9ca3af' }}>{{easy:'🟢 Easy',fastlek:'🟡 Fastlek',interval:'🔴 Interval',tempo:'🟠 Tempo',stride:'⚡ Stride'}[s.type]}</span>
              <button onClick={() => { setSessions(ss=>ss.filter(x=>x.id!==s.id)); setResult(null) }} style={{ background:'none', border:'none', color:'#4b5563', cursor:'pointer', fontSize:18 }}>×</button>
            </div>
            {s.type==='easy' && <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}><VField l="เวลา (นาที)" v={s.minutes} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,minutes:v}:x))} t="number"/><VField l="Pace (min:sec)" v={s.pace} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,pace:v}:x))} ph="6:30"/></div>}
            {s.type==='fastlek' && <div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}><div><div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>อัตราส่วน</div><select value={s.ratio} onChange={e=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,ratio:e.target.value}:x))} style={{ ...IC, fontSize:13 }}><option value="1:1">1:1 (BASE)</option><option value="2:1">2:1 (BUILD)</option></select></div><VField l="รอบ" v={s.rounds} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,rounds:v}:x))} t="number"/></div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}><VField l="⚡ Fast Pace" v={s.fastPace} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,fastPace:v}:x))} ph="5:10"/><VField l="🐢 Slow Pace" v={s.slowPace} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,slowPace:v}:x))} ph="6:20"/></div></div>}
            {s.type==='interval' && <div><div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>{[200,400,600,800,1000,1200,1600,2000].map(d => <button key={d} onClick={()=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,dist:d}:x))} style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${s.dist===d?'#ef4444':'#374151'}`, background:s.dist===d?'#ef444420':'transparent', color:s.dist===d?'#ef4444':'#6b7280', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>{d}m</button>)}</div><VField l="จำนวน Set" v={s.sets} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,sets:v}:x))} t="number"/></div>}
            {s.type==='tempo' && <VField l="ระยะ Tempo (km)" v={s.km} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,km:v}:x))} t="number"/>}
            {s.type==='stride' && <VField l="จำนวนรอบ (100m/รอบ)" v={s.reps} onChange={v=>setSessions(ss=>ss.map(x=>x.id===s.id?{...x,reps:v}:x))} t="number"/>}
          </div>
        ))}
      </div>
      <button onClick={calculate} style={{ ...BTN('#22c55e'), width:'100%', marginBottom:14, fontSize:15 }}>คำนวณ Volume →</button>
      {result && (
        <div style={{ background:'#0d1117', border:`1px solid ${Math.abs(result.rem)<=2?'#22c55e':'#f59e0b'}40`, borderRadius:14, padding:16 }}>
          <div style={{ textAlign:'center', marginBottom:14 }}>
            <div style={{ fontSize:48, fontWeight:'bold', color:Math.abs(result.rem)<=2?'#22c55e':'#f59e0b' }}>{result.total.toFixed(1)}</div>
            <div style={{ fontSize:14, color:'#6b7280' }}>/ {result.target} km</div>
            <div style={{ fontSize:13, marginTop:4, color:Math.abs(result.rem)<=2?'#22c55e':'#f59e0b', fontWeight:'bold' }}>{Math.abs(result.rem)<=2?'✅ ได้ตามเป้า':result.rem>0?`ขาดอีก ${result.rem.toFixed(1)} km`:`เกิน ${Math.abs(result.rem).toFixed(1)} km`}</div>
          </div>
          {[{label:'⭐ Long Run',km:result.lrKm,color:'#3b82f6'},...result.items].map((item,i) => (
            <div key={i} style={{ marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}><span style={{ color:item.color||SC[item.type]||'#9ca3af' }}>{item.label}</span><span style={{ fontWeight:'bold', color:item.color||SC[item.type]||'#9ca3af' }}>{item.km} km ({pct(item.km,result.target)}%)</span></div>
              <div style={{ background:'#1f2937', borderRadius:99, height:6 }}><div style={{ width:`${pct(item.km,result.target)}%`, background:item.color||SC[item.type]||'#6b7280', borderRadius:99, height:6 }}/></div>
            </div>
          ))}
          {result.rem > 0 && <div style={{ background:'#0d1520', border:'1px dashed #1e3a5f', borderRadius:8, padding:'10px 12px', marginTop:6 }}><div style={{ fontSize:12, color:'#93c5fd', marginBottom:2 }}>💡 ควรเพิ่ม Easy Run อีก</div><div style={{ fontSize:20, fontWeight:'bold', color:'#3b82f6' }}>{result.rem.toFixed(1)} km</div></div>}
        </div>
      )}
    </div>
  )
}

// ── ZONE SCREEN ───────────────────────────────────────────────────────────────
function ZoneScreen({ userId, zones, onSave }) {
  const [form, setForm] = useState({ dist12:'', dist3:'', dist20:'', weight:'', height:'', bodyFat:'' })
  const [result, setResult] = useState(null)
  const [saved, setSaved]   = useState(false)
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const dp = dec => { if(!dec||isNaN(dec)) return '--:--'; const m=Math.floor(dec),sec=Math.round((dec-m)*60); return `${m}:${String(sec).padStart(2,'0')}` }

  const calculate = () => {
    const d12=parseFloat(form.dist12),d3=parseFloat(form.dist3),d20=parseFloat(form.dist20)
    const weight=parseFloat(form.weight),height=parseFloat(form.height),bf=parseFloat(form.bodyFat)
    if(!d12||!d3||!d20||!weight||!height||!bf) return
    const p12=(12*60)/(d12/1000),p3=(3*60)/(d3/1000),p20=20/(d20/1000)
    const vo2=Math.max((d12-504.9)/44.73,20),lt2=p3*1.08,lt1=lt2*1.28
    const bff=1+(bf-15)*0.008,fm=lt1*1.12*bff,mp=lt2+38
    setResult({ vo2,p12,p3,p20,lt2,lt1,fm,mp,d12,d3,d20,weight,height,bf })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!result) return
    await onSave({
      dist_12min:result.d12, dist_3min:result.d3, dist_20sec:result.d20,
      weight_kg:result.weight, height_cm:result.height, body_fat_pct:result.bf, vo2max:result.vo2,
      fatmax_slow:dp(result.fm*1.05), fatmax_fast:dp(result.fm*0.95),
      lt1_slow:dp(result.lt1*1.05), lt1_fast:dp(result.lt1*0.94),
      moderate_slow:dp(result.lt2*1.15), moderate_fast:dp(result.lt2*1.02),
      lt2_slow:dp(result.lt2*1.04), lt2_fast:dp(result.lt2*0.95),
      vo2max_slow:dp(result.p20*1.15), vo2max_fast:dp(result.p20),
      marathon_pace:dp(result.mp)
    })
    setSaved(true)
  }

  const zb = (label, slow, fast, color) => (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
        <span style={{ fontSize:12, color, fontWeight:'bold' }}>{label}</span>
        <span style={{ fontSize:14, fontFamily:'monospace', fontWeight:'bold', color }}>{slow} – {fast}</span>
      </div>
      <div style={{ background:'#1f2937', borderRadius:99, height:7 }}><div style={{ width:'100%', background:color, borderRadius:99, height:7 }}/></div>
    </div>
  )

  return (
    <div style={{ padding:'16px 16px' }}>
      <div style={{ fontSize:22, fontWeight:'bold', color:'#f9fafb', marginBottom:14 }}>🎯 Zone Calculator</div>
      {zones && (
        <div style={{ background:'#111827', border:'1px solid #22c55e30', borderRadius:12, padding:14, marginBottom:14 }}>
          <div style={{ fontSize:11, color:'#22c55e', letterSpacing:2, marginBottom:10 }}>ZONE ปัจจุบัน</div>
          {zb('Easy / LT1', zones.fatmax_slow, zones.lt1_fast, '#22c55e')}
          {zb('Moderate', zones.moderate_slow, zones.moderate_fast, '#f59e0b')}
          {zb('LT2 Threshold', zones.lt2_slow, zones.lt2_fast, '#ef4444')}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:12 }}>
            <span style={{ color:'#6b7280' }}>Marathon Pace</span>
            <span style={{ color:'#3b82f6', fontWeight:'bold', fontSize:16, fontFamily:'monospace' }}>{zones.marathon_pace}</span>
          </div>
          <div style={{ fontSize:11, color:'#4b5563', marginTop:6 }}>VO2max: {zones.vo2max?.toFixed(1)} | ทดสอบ: {zones.tested_at?new Date(zones.tested_at).toLocaleDateString('th-TH'):'-'}</div>
        </div>
      )}
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:12, padding:14, marginBottom:14 }}>
        <div style={{ fontSize:11, color:'#6b7280', marginBottom:10 }}>กรอกผล Speed Test</div>
        {[{l:'ระยะ 12 นาที (เมตร)',k:'dist12',ph:'2580'},{l:'ระยะ 3 นาที (เมตร)',k:'dist3',ph:'674'},{l:'ระยะ 20 วินาที All out (เมตร)',k:'dist20',ph:'117'},{l:'น้ำหนัก (กก.)',k:'weight',ph:'70'},{l:'ส่วนสูง (ซม.)',k:'height',ph:'175'},{l:'% Body Fat',k:'bodyFat',ph:'20'}].map(({l,k,ph}) => (
          <div key={k} style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>{l}</div>
            <input type="number" value={form[k]} onChange={e=>sf(k,e.target.value)} placeholder={ph} style={{ ...IC, padding:'8px 10px' }}/>
          </div>
        ))}
        <button onClick={calculate} style={{ ...BTN('#3b82f6','#fff'), width:'100%', marginTop:4 }}>คำนวณ Zone →</button>
      </div>
      {result && (
        <div style={{ background:'#0d1117', border:'1px solid #374151', borderRadius:14, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
            <div style={{ background:'#111827', borderRadius:10, padding:'10px 12px', textAlign:'center' }}><div style={{ fontSize:10, color:'#6b7280' }}>VO2max</div><div style={{ fontSize:24, fontWeight:'bold', color:'#3b82f6' }}>{result.vo2.toFixed(1)}</div></div>
            <div style={{ background:'#111827', borderRadius:10, padding:'10px 12px', textAlign:'center' }}><div style={{ fontSize:10, color:'#6b7280' }}>Marathon Pace</div><div style={{ fontSize:22, fontWeight:'bold', color:'#a78bfa', fontFamily:'monospace' }}>{dp(result.mp)}</div></div>
          </div>
          {zb('Easy / LT1', dp(result.fm*1.05), dp(result.lt1*0.94), '#22c55e')}
          {zb('Moderate', dp(result.lt2*1.15), dp(result.lt2*1.02), '#f59e0b')}
          {zb('LT2 Threshold', dp(result.lt2*1.04), dp(result.lt2*0.95), '#ef4444')}
          {saved ? <div style={{ background:'#0f2015', border:'1px solid #22c55e30', borderRadius:8, padding:10, fontSize:12, color:'#86efac', marginTop:10, textAlign:'center' }}>✅ บันทึก Zone แล้ว AI จะใช้ค่านี้</div> : <button onClick={handleSave} style={{ ...BTN('#22c55e'), width:'100%', marginTop:12 }}>💾 บันทึก Zone ลง Supabase</button>}
        </div>
      )}
    </div>
  )
}

// ── HISTORY SCREEN ────────────────────────────────────────────────────────────
function HistoryScreen({ history }) {
  const [idx, setIdx] = useState(0)
  if (!history.length) return <div style={{ padding:'16px', textAlign:'center', color:'#6b7280', marginTop:80 }}>ยังไม่มีประวัติการซ้อม</div>
  const w = history[history.length-1-idx], ph = phaseObj(w.phase), vol = totalVol(w)
  return (
    <div style={{ padding:'16px 16px' }}>
      <div style={{ fontSize:18, fontWeight:'bold', color:'#f9fafb', marginBottom:14 }}>📊 ประวัติการซ้อม <span style={{ fontSize:13, color:'#6b7280' }}>{history.length} สัปดาห์</span></div>
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:6, marginBottom:14 }}>
        {history.slice().reverse().map((w2,i) => { const c=phaseObj(w2.phase).color; return <button key={i} onClick={()=>setIdx(i)} style={{ flexShrink:0, padding:'5px 12px', borderRadius:99, border:`1px solid ${i===idx?c:'#374151'}`, background:i===idx?c+'20':'transparent', color:i===idx?c:'#6b7280', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>W{w2.weekNum}</button> })}
      </div>
      <div style={{ background:'#111827', border:`1px solid ${ph.color}30`, borderRadius:14, padding:16, marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
          <div><div style={{ fontSize:24, fontWeight:'bold', color:'#f9fafb' }}>สัปดาห์ที่ {w.weekNum}</div><div style={{ fontSize:11, color:'#6b7280' }}>{w.archivedAt?new Date(w.archivedAt).toLocaleDateString('th-TH'):''}</div></div>
          <div style={{ background:ph.bg, color:ph.color, border:`1px solid ${ph.color}40`, borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:'bold' }}>{ph.label}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
          {[{l:'Volume',v:`${vol.toFixed(1)}km`,c:'#3b82f6'},{l:'Sessions',v:`${doneSess(w)}/${planSess(w)}`,c:'#22c55e'},{l:'Avg RPE',v:`${avgRPE(w)}/10`,c:'#f59e0b'},{l:'Long Run',v:`${lrKm(w)}km`,c:'#a78bfa'}].map(s => <div key={s.l} style={{ background:'#0d1117', borderRadius:8, padding:'8px 6px', textAlign:'center' }}><div style={{ fontSize:9, color:'#6b7280' }}>{s.l}</div><div style={{ fontSize:14, fontWeight:'bold', color:s.c, marginTop:2 }}>{s.v}</div></div>)}
        </div>
        {w.sessions?.filter(d=>d.plan||d.done).map((d,i) => {
          const so = sessObj(d.type||d.session_type||'rest')
          return <div key={i} style={{ borderBottom:'1px solid #1f2937', padding:'5px 0' }}>
            <div style={{ fontSize:12, color:so.color }}>{so.icon} {d.day}{d.plan&&<span style={{ color:'#374151' }}> — {d.plan}</span>}</div>
            {d.done&&<div style={{ fontSize:11, color:'#86efac', paddingLeft:20 }}>✓ {[d.distance&&`${d.distance}km`,d.pace&&`Pace ${d.pace}`,d.hr&&`HR ${d.hr}`,d.rpe>0&&`RPE ${d.rpe}`].filter(Boolean).join(' · ')}</div>}
          </div>
        })}
        {w.notes&&<div style={{ marginTop:8, fontSize:12, color:'#9ca3af', fontStyle:'italic' }}>📝 "{w.notes}"</div>}
      </div>
      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:12, padding:14 }}>
        <div style={{ fontSize:11, color:'#6b7280', letterSpacing:2, marginBottom:12 }}>VOLUME TREND</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:80 }}>
          {history.slice(-12).map((w2,i) => {
            const v=totalVol(w2),max=Math.max(...history.slice(-12).map(x=>totalVol(x)),1),h=Math.max(4,(v/max)*72),isSel=history.length-1-idx===i
            return <div key={i} onClick={()=>setIdx(history.length-1-i)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', cursor:'pointer' }}>
              <div style={{ fontSize:9, color:isSel?'#f9fafb':'#4b5563', marginBottom:2 }}>{v.toFixed(0)}</div>
              <div style={{ width:'100%', height:h, background:phaseObj(w2.phase).color, borderRadius:'3px 3px 0 0', opacity:isSel?1:0.4 }}/>
              <div style={{ fontSize:8, color:'#4b5563', marginTop:2 }}>W{w2.weekNum}</div>
            </div>
          })}
        </div>
      </div>
    </div>
  )
}

// ── SHARED ────────────────────────────────────────────────────────────────────
function PhasePicker({ phase, onChange }) {
  const ph = phaseObj(phase), [open, setOpen] = useState(false)
  return <div style={{ position:'relative' }}>
    <div onClick={() => setOpen(!open)} style={{ background:ph.bg, color:ph.color, border:`1px solid ${ph.color}40`, borderRadius:6, padding:'4px 12px', fontSize:11, fontWeight:'bold', letterSpacing:2, cursor:'pointer' }}>{ph.label} ▾</div>
    {open && <div style={{ position:'absolute', right:0, top:32, background:'#111827', border:'1px solid #374151', borderRadius:8, zIndex:50, overflow:'hidden', minWidth:100 }}>
      {PHASES.map(p => <div key={p.id} onClick={() => { onChange(p.id); setOpen(false) }} style={{ padding:'8px 16px', color:p.color, fontSize:12, cursor:'pointer', fontWeight:'bold', background:phase===p.id?p.bg:'transparent' }}>{p.label}</div>)}
    </div>}
  </div>
}

function BottomNav({ tab, setTab, done, hasZone, saving }) {
  const items = [{id:'plan',icon:'📋',label:'วางแผน'},{id:'log',icon:'✏️',label:'บันทึก'},{id:'summary',icon:'🤖',label:'AI'},{id:'volume',icon:'🧮',label:'Volume'},{id:'zone',icon:'🎯',label:'Zone'},{id:'history',icon:'📊',label:'ประวัติ'}]
  return <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#0d1117', borderTop:'1px solid #1f2937', display:'flex', justifyContent:'space-around', padding:'8px 0 14px', zIndex:100 }}>
    {items.map(item => (
      <button key={item.id} onClick={() => setTab(item.id)} style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, color:tab===item.id?'#22c55e':'#4b5563', fontFamily:'inherit', position:'relative' }}>
        <span style={{ fontSize:22 }}>{item.icon}</span>
        <span style={{ fontSize:10, letterSpacing:0.5 }}>{item.label}</span>
        {item.id==='log'&&done>0&&<span style={{ position:'absolute', top:-2, right:-4, background:'#22c55e', color:'#000', borderRadius:99, fontSize:8, padding:'0 4px', fontWeight:'bold' }}>{done}</span>}
        {item.id==='zone'&&!hasZone&&<span style={{ position:'absolute', top:-2, right:-4, background:'#f59e0b', color:'#000', borderRadius:99, fontSize:8, padding:'0 4px', fontWeight:'bold' }}>!</span>}
        {item.id==='plan'&&saving&&<span style={{ position:'absolute', top:-2, right:-4, background:'#3b82f6', color:'#fff', borderRadius:99, fontSize:7, padding:'0 3px' }}>...</span>}
      </button>
    ))}
  </div>
}

function VField({ l, v, onChange, t='text', ph }) {
  return <div><div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>{l}</div><input type={t} value={v||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={{ ...IC, padding:'7px 10px', fontSize:13 }}/></div>
}

function Loader() {
  return <div style={{ background:'#0a0f1a', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#22c55e', fontFamily:'monospace', flexDirection:'column', gap:12 }}>
    <div style={{ fontSize:32 }}>🏃</div><div>กำลังโหลด...</div>
  </div>
}
