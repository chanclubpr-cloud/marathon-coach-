// ══════════════════════════════════════════════════════════════════════════════
// Coach Rules — กฎที่ "คำนวณได้" ตาม docs/COACHING-PLAYBOOK.md
// หลัก: Rule-based ทำสิ่งที่วัดได้ / AI ทำสิ่งที่ต้องตีความ
// ไฟล์นี้ไม่มี React ไม่มี Supabase จึงทดสอบแยกได้
// ══════════════════════════════════════════════════════════════════════════════

export const DAYS = ['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์']
export const HARD_TYPES = ['interval','tempo','fastlek','longrun']

// ── Pace helpers (หน่วยภายใน = วินาที/กม.) ──────────────────────────────────
export const paceToSec = str => {
  if (str === null || str === undefined || str === '') return null
  const s = String(str).trim().replace('.', ':')
  if (s.includes(':')) {
    const [m, sec] = s.split(':').map(Number)
    if (isNaN(m)) return null
    return m * 60 + (isNaN(sec) ? 0 : sec)
  }
  const n = parseFloat(s)
  return isNaN(n) ? null : n * 60
}

export const secToPace = sec => {
  if (!sec || isNaN(sec)) return '--:--'
  const total = Math.round(sec)            // ปัดที่วินาทีรวม → ไม่เกิด "4:60"
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// ── Session type จากข้อความแผน (รองรับภาษาที่โค้ชเขียนจริง) ─────────────────
// ตัวอย่าง: "Easy 60 min +100*5" = easy + stride, "fast1 slow1 x21" = fastlek,
//          "1000*7 pace 5.10 rest2min" = interval, "Sun 21km easy" = long run
const STRIDE_SUFFIX = /(\+|stride|สตรายด์)\s*(stride\s*)?(?:[5-9]\d|1\d\d|200)\s*m?\s*[x×*]\s*\d+/g
const HAS_STRIDE = /(\+|stride|สตรายด์)\s*(stride\s*)?(?:[5-9]\d|1\d\d|200)\s*m?\s*[x×*]\s*\d+/
const REPS = /\b\d{3,4}\s*m?\s*[x×*]\s*\d+/

export const guessType = text => {
  const raw = (text || '').trim()
  const s = raw.toLowerCase()
  // "พัก" เป็นวันพักเฉพาะเมื่อเป็นคำแรก — ไม่ใช่ "พัก 2 นาที" ที่แทรกอยู่ในโจทย์ interval
  if (!raw || s === '-' || /^(พัก|rest\b|off\b)/.test(s)) return 'rest'
  if (/body\s*weight|weight|core|bosu|โยคะ|yoga|เวท/.test(s) && !/\d+\s*(km|กม|min|นาที)/.test(s)) return 'other'

  const hasStride = HAS_STRIDE.test(s) || /stride|สตรายด์/.test(s)
  const main = s.replace(STRIDE_SUFFIX, ' ')
  const km = parseFloat((main.match(/(\d+(?:\.\d+)?)\s*(km|k\b|กม)/) || [])[1])

  if (/long\s*run|longrun|ลองรัน/.test(main)) return 'longrun'
  const paceWords = ['fast', 'slow', 'moderate'].filter(w => main.includes(w)).length
  if (/fastlek|fartlek|สลับ|alternate/.test(main) ||
      (paceWords >= 2 && /fast|slow/.test(main)) ||
      /\d\s*[:/]\s*\d\s*[x×*]\s*\d+/.test(main)) return 'fastlek'
  if (/hill\s*sprint|sprint/.test(main)) return 'stride'
  if (REPS.test(main) || /interval|vo2/.test(main)) return 'interval'
  const isEasy = /ea+s*y|esay|อีซี่|ง่าย|jog|recovery/.test(main)
  if (/tempo|threshold|lt2|progressive|marathon|\bm\s*pace|\bhm\b|half\s*ma|race\s*pace|cv\s*test/.test(main) ||
      (/\bpace\b/.test(main) && !isEasy)) return 'tempo'
  if (!isNaN(km) && km >= 16) return 'longrun'
  if (/moderate|\bmod\b/.test(main) && !isEasy) return 'moderate'
  if (isEasy || /moderate/.test(main)) return 'easy'
  if (hasStride) return 'stride'
  if (!isNaN(km)) return 'easy'
  return 'other'
}

// ซ่อมประเภทที่เคยถูกเดาผิดเป็น rest ทั้งที่มีโจทย์ซ้อม (ไม่แก้ข้อมูลในฐาน — คำนวณตอนอ่าน)
export const fixType = d => (d?.plan && d.type === 'rest' ? guessType(d.plan) : d?.type)

// ── Zone จาก Speed Test ──────────────────────────────────────────────────────
// ตัวคูณเทียบจาก "pace ของการวิ่ง 3 นาที" ปรับเทียบกับผลที่โค้ชคำนวณให้จริง
// (3 นาที 674 m → Easy 7:40–6:40, Moderate 6:30–5:20, LT2 5:10–4:52)
// หมายเหตุ: ปรับเทียบจากข้อมูล 1 คน ควรยืนยันด้วย HR และความรู้สึกเสมอ
export const ZONE_FACTORS = {
  fatmax_slow: 1.722, fatmax_fast: 1.61,
  lt1_slow: 1.61,     lt1_fast: 1.498,
  moderate_slow: 1.460, moderate_fast: 1.198,
  lt2_slow: 1.161,    lt2_fast: 1.093,
  vo2max_slow: 1.05,  vo2max_fast: 1.0,
  marathon_pace: 1.25, // ประมาณการเริ่มต้น — ยืนยันด้วย long run / การแข่ง
}

export const cooperVO2 = d12 => Math.max((d12 - 504.9) / 44.73, 20)

export const calcZones = ({ dist12, dist3 }) => {
  const d3 = +dist3, d12 = +dist12
  if (!d3) return null
  const p3 = 180 / (d3 / 1000)
  const z = {}
  for (const [k, f] of Object.entries(ZONE_FACTORS)) z[k] = secToPace(p3 * f)
  z.vo2max = d12 ? cooperVO2(d12) : null
  return z
}

// อ่าน zone จากแถวในฐานข้อมูล: ถ้ามีผลทดสอบดิบ → คำนวณใหม่ (ซ่อมค่าเก่าที่ผิดหน่วยให้อัตโนมัติ)
export const deriveZones = row => {
  if (!row) return null
  const fresh = calcZones({ dist12: row.dist_12min, dist3: row.dist_3min })
  return fresh ? { ...row, ...fresh, vo2max: fresh.vo2max ?? row.vo2max } : row
}

// ── Phase จากวันแข่ง (หลักฐาน: taper 2 สัปดาห์, Bosquet 2007) ─────────────────
export const weeksToRace = raceDate => {
  if (!raceDate) return null
  const d = (new Date(raceDate) - new Date()) / 86400000
  return Math.ceil(d / 7)
}

export const suggestPhase = weeksLeft => {
  if (weeksLeft === null || weeksLeft === undefined) return null
  if (weeksLeft <= 0) return 'taper'
  if (weeksLeft <= 2) return 'taper'
  if (weeksLeft <= 8) return 'peak'   // specific phase
  if (weeksLeft <= 16) return 'build' // prepared phase
  return 'base'
}

// ── ตรวจโปรแกรมแบบกฎ (deterministic) ────────────────────────────────────────
// คืนค่า [{rule, pass, level:'error'|'warn'|'info', comment}]
export const ruleChecks = ({ sessions: rawSessions, targetVolume, prevVolume, prevLongRun, maxLongRun, phase, weekNum, raceDate }) => {
  const out = []
  const sessions = rawSessions.map(d => ({ ...d, type: fixType(d) }))
  const planned = sessions.filter(d => d.plan && d.type !== 'rest')
  const runDays = planned.length

  // 1) วันหนักติดกัน
  const clashes = []
  sessions.forEach((d, i) => {
    if (i && HARD_TYPES.includes(d.type) && HARD_TYPES.includes(sessions[i - 1].type))
      clashes.push(`${sessions[i - 1].day}+${d.day}`)
  })
  out.push({ rule: 'วันหนักไม่ติดกัน', pass: !clashes.length, level: 'warn',
    comment: clashes.length ? `หนักติดกัน: ${clashes.join(', ')} — ควรมี Easy คั่น` : 'ok' })

  // 2) จำนวนวันหนัก (รวม long run) ไม่เกิน 3
  const hard = planned.filter(d => HARD_TYPES.includes(d.type)).length
  out.push({ rule: 'จำนวน Session หนัก', pass: hard <= 3, level: 'warn',
    comment: `${hard} วัน${hard > 3 ? ' — มากเกินไปสำหรับ 80/20 (แนะนำ ≤ 3 รวม Long run)' : ''}` })

  // 3) Volume เพิ่มไม่เกิน ~10% (และไม่เกิน 30% เด็ดขาด — Nielsen 2014)
  if (prevVolume > 0 && +targetVolume > 0) {
    const inc = (+targetVolume - prevVolume) / prevVolume
    out.push({ rule: 'Volume เพิ่มอย่างค่อยเป็นค่อยไป', pass: inc <= 0.10, level: inc > 0.30 ? 'error' : 'warn',
      comment: `${inc >= 0 ? '+' : ''}${Math.round(inc * 100)}% จากสัปดาห์ก่อน (${prevVolume.toFixed(0)} km)` })
  }

  // 4) Long run
  const lr = sessions.find(d => d.type === 'longrun' && d.plan)
  const lrKm = lr ? parseFloat((lr.plan.match(/(\d+(?:\.\d+)?)\s*(km|k\b|กม)/i) || [])[1]) : NaN
  if (phase !== 'taper') out.push({ rule: 'มี Long Run', pass: !!lr, level: 'warn', comment: lr ? lr.plan : 'ยังไม่มี Long run — Key session ของมาราธอน' })
  if (!isNaN(lrKm)) {
    const capByPrev = prevLongRun > 0 ? prevLongRun + 3 : null
    const over = (maxLongRun && lrKm > +maxLongRun) || (capByPrev && lrKm > capByPrev)
    out.push({ rule: 'Long Run เพิ่มทีละน้อย', pass: !over, level: 'warn',
      comment: `${lrKm} km${capByPrev ? ` (ครั้งก่อน ${prevLongRun} km แนะนำ ≤ ${capByPrev})` : ''}${maxLongRun ? ` · เพดาน ${maxLongRun} km` : ''}` })
  }

  // 5) ความถี่สำหรับมาราธอน
  out.push({ rule: 'จำนวนวันวิ่ง', pass: runDays >= 4 || phase === 'taper', level: 'info',
    comment: `${runDays} วัน${runDays < 4 ? ' — มาราธอนควร ≥ 4 วัน/สัปดาห์' : ''}` })

  // 6) Down week / Phase ตามวันแข่ง
  if (weekNum && weekNum % 4 === 0 && prevVolume > 0 && +targetVolume >= prevVolume)
    out.push({ rule: 'Down Week', pass: false, level: 'info', comment: `W${weekNum} ควรลด Volume ~20–30% เพื่อ Supercompensation` })
  const sp = suggestPhase(weeksToRace(raceDate))
  if (sp && sp !== phase)
    out.push({ rule: 'Phase ตามวันแข่ง', pass: false, level: 'info', comment: `เหลือ ${weeksToRace(raceDate)} สัปดาห์ — ปกติควรอยู่ช่วง ${sp.toUpperCase()}` })

  return out
}

// ── สัญญาณอันตรายจากบันทึก (Safety layer) ────────────────────────────────────
const RED = /เจ็บหน้าอก|แน่นหน้าอก|เจ็บอก|ใจสั่น|ใจหวิว|หัวใจเต้นผิดจังหวะ|เต้นผิดจังหวะ|หน้ามืด|เป็นลม|วูบ|หมดสติ|หายใจไม่ออก|chest\s*pain|palpitat|syncope|faint|arrhythm|\bpac\b|\bpvc\b/i
const AMBER = /ไข้|ป่วย|หวัด|ติดเชื้อ|เจ็บแปล๊บ|ปวดมาก|บวม|กระดูก|ตะคริว|มึนหัว|ปวดหัว|เวียนหัว|นอนไม่หลับ|fever|injur|sick/i

export const safetyFlags = (sessions = [], weekNotes = '') => {
  const flags = []
  sessions.forEach(d => {
    const text = `${d.feel || ''} ${d.notes || ''}`
    if (RED.test(text)) flags.push({ level: 'red', day: d.day, text: text.trim() })
    else if (AMBER.test(text)) flags.push({ level: 'amber', day: d.day, text: text.trim() })
    if (d.done && ['easy','moderate','stride'].includes(d.type) && +d.rpe >= 8)
      flags.push({ level: 'amber', day: d.day, text: `Easy แต่ RPE ${d.rpe}/10 — อาจล้าสะสม/ป่วย` })
  })
  if (RED.test(weekNotes)) flags.push({ level: 'red', day: 'โน้ตสัปดาห์', text: weekNotes })
  else if (AMBER.test(weekNotes)) flags.push({ level: 'amber', day: 'โน้ตสัปดาห์', text: weekNotes })
  return flags
}

// ── ตรวจโปรแกรมที่ AI เสนอ ก่อนให้กด "ใช้" ──────────────────────────────────
export const checkAIPlan = (ai, ctx) => {
  if (!ai?.nextPlan) return []
  const sessions = DAYS.map(day => {
    const p = ai.nextPlan.find(x => x.day === day)?.plan || ''
    return { day, plan: p, type: guessType(p) }
  })
  return ruleChecks({ ...ctx, sessions, targetVolume: ai.nextVolume, phase: ai.nextPhase || ctx.phase, weekNum: (ctx.weekNum || 0) + 1 })
    .filter(c => !c.pass && c.level !== 'info')
}
