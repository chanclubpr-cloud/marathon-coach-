# Coaching Playbook (ร่าง v0.1)

> ถอดจากประวัติการโค้ชจริงผ่าน LINE ก.ค. 2567 – มิ.ย. 2569 (ประมาณ 2 ปี, 1 training cycle ฮาล์ฟ + 1 cycle มาราธอน)
> จุดประสงค์: ใช้เป็น "ความรู้หลัก" ใส่ใน system prompt ของ AI Coach และเป็นเกณฑ์ให้ Rule engine ในแอป
> สถานะ: **ร่าง — รอเจ้าของแนวทางยืนยัน** (ข้อที่ระบุ ❓ คือสิ่งที่ยังไม่ชัดจากแชต)

---

## 1. ปรัชญาหลัก (Core beliefs)

1. **Aerobic ก่อน Speed** — "อย่าเพิ่งเร่ง สร้างระบบ aerobic ให้ดีก่อน", "Easy ให้ Easy ดีที่สุด"
2. **LT1 คือ King ของ adaptation, HR คือ King ของ control, LT2 คือ King ของ performance**
3. **Interval มีไว้สอนร่างกายเฉพาะอย่าง ไม่ใช่ทำให้เหนื่อย** — "ถ้า threshold ทำให้ต้องพักหลายวัน แปลว่ามันไม่ใช่ threshold"
4. **มาราธอน: Key session คือ Long run (25 km++)** และ "ระยะสะสมสำคัญมาก"; ทำระยะให้ "ง่าย" ก่อน แล้วความเร็วจะตามมา
5. **Specific pace** — เมื่อฐานพร้อม ให้ซ้อมรอบ ๆ pace เป้าหมายบ่อย ๆ หลายรูปแบบ (เร็วกว่า/ช้ากว่าเล็กน้อย) เพื่อสร้าง Running Economy ที่ pace นั้น
6. **Steady state คือหัวใจวันแข่ง** — "ออกตัวช้า ใจเย็น อย่าเร่ง มาราธอนเริ่มที่ กม. 35"
7. **ตารางต้อง flexible** — ปรับรายสัปดาห์ตามชีวิตจริง, การนอน, ความเครียด, การ adaptation
8. **Mindset > Ego** — วันดี/วันแย่เป็นแค่บทเรียน; ทำไม่ได้ให้ "เข้าใจร่างกายปัจจุบัน ปรับเป้าให้จริง" ไม่ใช่ฝืน

### หลักการฝึก 5 ข้อ (ที่โค้ชสอนตรง)
Consistency · Recovery · Reversibility · Progression & Overload · Specificity → ผลคือ Supercompensation

---

## 2. Zone และการกำหนดความหนัก

### 2.1 Speed Test
วิ่ง 12 นาที / 3 นาที / 20 วินาที (all-out) + น้ำหนัก ส่วนสูง %ไขมัน → หา FatMax, LT1, LT2, MLSS, VO2max

**ผลจริงจากโค้ช** (12 นาที 2,580 m · 3 นาที 674 m · 20 วิ 117 m · 82 kg · 178 cm · 21.3%)

| Zone | Pace (min/km) | ÷ pace 3 นาที (4:27) |
|---|---|---|
| FatMax → LT1 (Easy) | 7:40 – 6:40 | 1.72 – 1.50 |
| Moderate | 6:30 – 5:20 | 1.46 – 1.20 |
| LT2 (Threshold) | 5:10 – 4:52 | 1.16 – 1.09 |

> ⚠️ แอปปัจจุบันคำนวณจากข้อมูลชุดเดียวกันได้ Easy 7:32–5:47, Moderate 5:32–4:54, LT2 5:00–4:34 → **เร็วกว่าของโค้ช 10–50 วินาที/กม.** ต้องปรับสูตร
> ❓ ตัวคูณข้างบนมาจากข้อมูล 1 คน ยังไม่รู้ว่าโค้ชใช้ %ไขมัน / metabolic type ปรับหรือไม่ — ควรขอสูตรจริง หรือเก็บผลทดสอบเพิ่มอีกหลายคนเพื่อปรับเทียบ

### 2.2 Heart Rate
- Easy/LT1: เริ่มจาก "easy HR ของเรา" แล้วกดลง; แนวทาง **180 − อายุ − 5** "ยิ่งต่ำยิ่งดี"
- ช่วงแรกของการฝึก: HR 135 = low aerobic (ฝึกใช้ไขมัน), HR 145–150 = aerobic สูง (ใช้คาร์บ)
- เกินเป้าได้เล็กน้อย; **เกิน +10 bpm ให้ผ่อน/เดิน** — "ไม่สนเพซ ไม่สนเวลา สนเวลาเท้าแตะพื้นจนครบ"
- Easy ทั่วไป: ใช้ feeling ได้ แต่ HR ไม่ควรเกิน ~150

### 2.3 Effort / RPE
- อากาศร้อน เนิน ความล้า → **"Use feeling, no need to fix pace"**, "feel over data"
- Marathon pace session ทำไม่ได้ → ลดไปที่ **Marathon effort** ไม่ใช่ฝืนเป็น 10K race effort
- VO2max ~ "วิ่งเร็วสุดที่ทำได้ในช่วงนั้น" / 80–90% effort, เร็วกว่า LT2

### 2.4 Lactate model (แนว Norwegian)
| ระดับ | ใช้กับ | Pace logic |
|---|---|---|
| ~2.0–2.5 mmol | Long interval ≥ 4 นาที (clearance) | ช้ากว่า 10K pace 5–15 วิ/กม. |
| ~3.0–3.5 mmol | Short interval เช่น 400 m (upper threshold) | ≈ 10K pace ถึงเร็วกว่า 0–5 วิ/กม. |
| > 4 mmol | VO2max / race simulation | ใช้น้อย เป็นเครื่องมือเสริม |

**สัญญาณว่าหนักเกินจุดประสงค์ (drift):** HR drift > ~5% ช่วงท้าย, หายใจยากขึ้นใน set หลัง, pace แกว่ง/set หลังพัง

---

## 3. คลังประเภท Session (Session library)

| ประเภท | ตัวอย่างที่โค้ชเขียน | วัตถุประสงค์ | วิธีวิ่ง |
|---|---|---|---|
| Easy (+Stride) | `Easy 60 min +100*5`, `easy 12km +80*10` | Lipid system, mitochondria | LT1/HR ต่ำ; stride = ออกตัวเบา เร่งถึง ~pace 4, ไม่ใช่สปรินต์สุด |
| Easy fasted | — | ฝึกดึงไขมัน | ท้องว่าง/พลังงานน้อย **เฉพาะเมื่อ easy จริง** |
| Recovery run / jog | `recovery run 30 min`, `jog 15 min` | ฟื้นตัว | ช้ามาก |
| Moderate run | `Moderate 60min+60*5` | ระหว่าง LT1–LT2 | progressive ภายใน moderate |
| Easy → Moderate | `22 km easy to moderate` | Long run aerobic + เรียนรู้ขึ้นความเร็ว | เริ่ม easy ค่อยไต่ |
| Fastlek / Alternate run | `fast1 slow1 x21`, `2min fast 1min moderate x15`, `slow 4min fast 8min flow no push x4` | Lactate clearance ขณะยังวิ่ง | "เน้นจบ ใจเย็น อย่าเร่งตั้งแต่แรก"; slow ต้องยังวิ่ง |
| Clearance interval | `400x15-25 rest 45-70s`, `1000x7-12 rest 1-2 min` | หลักของช่วง prepared | **jog recovery**, pace นิ่ง จบแล้วยังไม่ล้า |
| Threshold | `Threshold LT2 4km*3`, `12km comfortable hard` | ขยับเพดาน LT2 | ล้าแบบควบคุมได้, ภูมิใจที่ "pace คง" ไม่ใช่ "โหด" |
| VO2max | `300*15 rest2min`, `4min x5 progressive 90-100%` | ระบบกลาง | สั้น พักยาว volume จำกัด |
| Neuromuscular | Stride, `hill sprint 100x10 rest3min`, hopping 10s/50s x5 | Running economy, ระบบประสาท | สั้นมาก จบแล้วยังสด |
| Progressive run | `60 min easy to threshold`, `m pace to HM pace` | ดึง fast-twitch แบบ aerobic | ขึ้นความเร็วช้า ๆ |
| Specific long run | `16km/12km progressive to HM + 4km HM pace` | Specific endurance + ฝึกเติมพลังงาน | easy progressive → steady ที่ pace เป้า |
| Race pace | `10 km M pace`, `4000-3000-2000 @M pace easy 500m` | Specific pace | เข้าใจ M effort |
| Double day | `am 25km long run / pm easy 10km` | เพิ่ม volume ช่วงใกล้มาราธอน | |
| Test | `30 min CV test start 90% progressive`, Speed Test | ประเมินความฟิต | |
| Strength | Body weight, IAP/Core, glute/hamstring, BOSU 1on/1off x15-20 | ความแข็งแรงพอเพียง | ทุก ~48 ชม. "แข็งแรงพอดีก็พอ" |

> **ไวยากรณ์ของโค้ช** (ต้องสอน parser/AI): `100*5` หรือ `60*5` ต่อท้าย easy = **stride** ไม่ใช่ interval · `x21` หลัง fast/slow = **จำนวนรอบ fastlek** · `rest2min` = พักระหว่าง rep · `jog` = พักแบบวิ่งเบา

---

## 4. Periodization ที่ใช้จริง

| ช่วง | ลักษณะ |
|---|---|
| **Base building** | Easy + stride, fastlek 1:1, long run easy เพิ่มช้า ๆ, ฝึก HR ต่ำ |
| **Prepared phase** | Clearance interval เป็นหลัก ("แบบ 1 บ่อยกว่าแบบ 2"), moderate run, long run easy → moderate ยาวขึ้น |
| **Specific phase** | Race pace / M pace / HM pace, alternation ใกล้ pace เป้า, specific long run, ฝึกเติมพลังงานเต็มที่, double day |
| **Taper (สัปดาห์สุดท้าย)** | Easy สั้น + 1 session race pace สั้น (เช่น 3000x2 หรือ 1000x5) แล้วพัก 1–2 วันก่อนแข่ง |
| **Post-race** | มาราธอน: พัก ~4 วัน แล้ว jog 15–20 นาที; ฮาล์ฟ: jog 10 นาทีเย็นวันแข่ง |

Long run มาราธอน (ที่ใช้จริง): 15 → 18 → 21 → 25 → 27 → 30 km, ทำซ้ำ 25 และ 27 km อย่างละ 2 ครั้ง

---

## 5. กฎการออกตารางรายสัปดาห์

1. **ถามวันที่ซ้อมได้ทุกสัปดาห์ก่อน** แล้วจัด session ลงวันนั้น (เช้า/เย็น)
2. **วันหนักห้ามติดกัน** — "ไล่ลงมาตามตารางได้เลย อย่าเอาวันหนักมาติดกัน"
3. ได้น้อยกว่าที่วางไว้ → **ตัด Easy ที่สั้นที่สุดก่อน**; long run ห้ามตัดง่าย ๆ
4. มาราธอนต้อง **≥ 4 วัน/สัปดาห์** ("มาราธอน 3 วันไม่ได้นะครับ")
5. พลาด session → ส่วนใหญ่ "ข้าม" ไม่ชดเชยซ้อน; long run ย้ายวันได้; ก่อน long run ให้ทำ session หนักแบบเบา "เก็บร่างไว้"
6. 2 สัปดาห์ก่อนแข่งรอง/ระหว่าง cycle: ใช้การแข่งเป็น test ("ทดสอบ M pace")
7. 1 session = 1 เป้าหมาย; มี warm-up (jog + drill + stride) และ cool-down + ยืดทุกครั้ง

---

## 6. กฎการปรับตามสภาพร่างกาย (Decision rules)

| สถานการณ์ | การตัดสินใจของโค้ช |
|---|---|
| ป่วยไข้ / หวัด | พัก หรือ easy สั้น; ตัด body weight; กลับมาด้วย easy |
| **ใจหวิว / ใจสั่น / หัวใจเต้นผิดจังหวะ / มึนศีรษะขณะวิ่ง** | หยุดซ้อม, เลื่อน long run, ลดคาเฟอีน, สังเกตอาการก่อนกลับมา |
| นอนไม่พอ / เครียดงาน / เพลีย | ลดเป็น easy, "Recovery DD นอนเยอะ ๆ" |
| เจ็บ/ตึงกล้ามเนื้อ | พัก + easy jog 30–45 นาที, ยืด, roll, นวดสัปดาห์ละครั้ง, พบนักกายภาพ |
| Session พัง (ทำไม่ได้) | วิเคราะห์ "ทำไม" (recovery? effort ผิด? เป้าไม่จริง?) → ลดเป้า ไม่คิดลบ |
| ทุกโจทย์ "ง่ายผิดปกติ" | ดู recovery วันถัดไป ถ้าฟื้นดี = พัฒนาจริง |
| ออกตัวเร็ว/กระชาก | "ออกตัวช้า ๆ วิ่งนิ่ง ๆ" ตรวจจาก lap pace |
| อากาศร้อน/เนิน/ฝุ่น PM2.5 | ใช้ effort แทน pace; ฝุ่นหนักงดวิ่งนอกบ้าน; ฝนฟ้าร้องงด |
| Long run DNF ซ้ำ | สะท้อนตรง: "ถ้าชีวิตยังไม่พร้อมกับเวลาฝึก ไม่ควรแข่งระยะนี้" |

---

## 7. โภชนาการและการเติมพลังงาน

- Easy: ท้องว่าง/พลังงานน้อยได้ (ถ้า easy จริง)
- Long run / specific: ฝึกเติมคาร์บมากขึ้นเรื่อย ๆ (นักวิ่ง pro 80–90 g/ชม.) เพื่อฝึกลำไส้
- **เกลือแร่: เกลือเม็ดทุก 45–60 นาที** (ขาดเกลือแร่ → ตะคริว/ตึงขาหลัง กม. 16+)
- หาอัตราการเสียเหงื่อ: ชั่งน้ำหนักก่อน–หลัง long run + น้ำที่ดื่ม
- หลังซ้อม: เติมสารอาหารพอเพียง + นอน
- ก่อนแข่ง: 3 วันแรกของสัปดาห์สุดท้าย ลดแป้ง เน้นโปรตีน+ผัก → 3 วันก่อนแข่ง ลดเนื้อสัตว์ เน้นแป้งดี
- ลดเบียร์ ลดคาเฟอีน

---

## 8. Running form, Strength, Recovery

- **Pose Method**: Pose (ขาเป็นเลข 4) → Fall (ถ่ายน้ำหนัก ball of foot → นิ้วเท้า) → Pull (กดนิ้วเท้า ส้นยกเอง); ลงเท้าใต้ตัว ไม่ overstride ไม่แทงเข่า
- **IAP / Core**: หายใจเข้าท้องและหลังป่อง อกไม่ขยาย หลังไม่แอ่น ไหล่คอผ่อน; ไม่เกร็งท้องแข็ง
- Cadence ~180, หายใจทางจมูกเป็นตัวชี้วัด easy
- Recovery: flow stretching (dynamic) / static ถ้าตัวตึง, roll ขูด fascia, บอลใต้ฝ่าเท้า, posture ขณะนั่งนาน
- Strength: body weight 1–2 set 10–18 ครั้ง, IAP challenge, hopping 7 สัปดาห์ (RE ↑ 3–4%), BOSU

---

## 9. จิตวิทยาการแข่งและการซ้อม

- Ego vs Mindset: "ถ้าเพิ่มอีก 10 set ยังคุมคุณภาพได้ไหม?"
- Zoom in (ฟอร์ม ลมหายใจ) / Zoom out (สิ่งรอบตัว), Visualization, ฝึกยิ้ม, Flow state
- Think fast / think slow — สร้างนิสัยใหม่ด้วยการเข้าใจเป้าหมายใหญ่
- วันแข่ง: วางแผน pace ตามเส้นทาง (เนิน), ควบคุมใจช่วงต้น

---

## 10. สำนัก/แหล่งความรู้ที่สะท้อนในแนวทางนี้

| แหล่ง | สิ่งที่นำมาใช้ |
|---|---|
| Coach Denis (โค้ชของ Nut — อ้างในแชต) | ตารางหลัก, บทความ interval แบบ elite |
| Kenyan / Italian school (แนว Renato Canova) | Fastlek สลับเร็ว-ช้า, Alternate run, Specific pace, progressive, "marathon เริ่มที่ กม. 35" |
| Norwegian method / Seiler | Threshold ด้วย lactate 2.5/3.5 mmol, short interval พักสั้น, 80/20 |
| Metabolic / San Millán (Zone 2, FatMax, mitochondria) | Speed test → FatMax/LT1, easy fasted, metabolic type |
| Maffetone | HR easy = 180 − อายุ (−5) |
| Jack Daniels | อ้างอิง threshold pace |
| Pose Method (Romanov) | Running form |
| DNS / IAP | Core stability และการหายใจ |
| Supercompensation / Principles of training | Load–recovery–adaptation |

## 11. ช่องว่างที่เติมด้วยหลักฐานทั่วไป (แทนการถามโค้ช)

| ประเด็น | กฎที่ใช้ในแอป | ที่มา |
|---|---|---|
| เพิ่ม Volume | ≤ ~10%/สัปดาห์; > 30% = เตือนแรง | Nielsen et al. 2014 (เพิ่ม > 30% เสี่ยงบาดเจ็บสูงขึ้น) |
| Down week | ทุก 3–4 สัปดาห์ ลด 20–30% | หลัก Supercompensation / periodization |
| Long run | เพิ่ม ≤ 3 km จาก long run ยาวสุดใน 4 สัปดาห์, ไม่เกินเพดานที่ตั้ง | ฉันทามติการโค้ช + แนวที่โค้ชใช้จริง (เพิ่มทีละ 2–3 km) |
| Taper | ~2 สัปดาห์ ลด volume 40–60% คงความหนัก/ความถี่ | Bosquet et al. 2007 (meta-analysis) |
| Session หนัก | ≤ 3 วัน/สัปดาห์ รวม long run | Seiler 80/20 |
| สูตร Zone | ตัวคูณจาก pace 3 นาที ปรับเทียบกับผลโค้ช; ไม่ใช้ %ไขมัน (ยังไม่มีหลักฐานรองรับ) | ปรับเทียบเอง — ยืนยันด้วย HR |
| Marathon pace | ประมาณ pace 3 นาที × 1.25 | ค่าเริ่มต้น — ควรแทนด้วยผล long run/การแข่งจริง |
| อาการหัวใจ/ป่วย | หยุดซ้อมหนัก พบแพทย์; ไข้ = พัก | ACSM pre-participation guidance |

## การจัดการ Phase ให้ตรง Race A (ระบบ ต.ค. 2569)
หลัก: **ปฏิทินกำหนด Phase, ความพร้อมกำหนดปริมาณ** — Race A ขยับไม่ได้ ซ้อมน้อยให้ลดปริมาณ ไม่ใช่ยืด Phase
- slack = สัปดาห์ที่เหลือหลังสัปดาห์นี้ − ขั้นต่ำของ Phase ถัดไป (Build 4 / Peak 4 / Taper 2 — ค่าตั้งต้นของระบบ ไม่ใช่ตัวเลขยืนยันจากโค้ช)
- ปฏิทินให้ขึ้น Phase แต่สัปดาห์ล่าสุดทำได้ <70% ของ volume หรือ <60% ของ session (และไม่มีสัญญาณป่วย) → **ถามผู้ใช้ก่อน**: (1) ขึ้น Phase แบบย่อส่วน (volume เริ่มจากที่ทำได้จริง เพิ่ม ≤10%, เก็บ Long run + งานหลักไว้, ไม่ชดเชย) หรือ (2) อยู่ Phase เดิมอีก 1 สัปดาห์ (ระบบบอกว่า slack พอหรือเสี่ยง)
- ถ้ามีอาการ/ป่วย → ไม่ถามเรื่อง Phase ให้ยึดความปลอดภัยและพักฟื้นก่อน
