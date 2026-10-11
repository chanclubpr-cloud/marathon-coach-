// ความรู้ของ AI Coach — สรุปจาก docs/COACHING-PLAYBOOK.md
// แก้แนวการโค้ชที่นี่ที่เดียว แล้ว deploy function ใหม่

const PLAYBOOK = `
แนวการโค้ช (ใช้เป็นหลักเสมอ ห้ามผสมสำนักอื่นที่ขัดกับแนวนี้):
1. Aerobic ก่อน Speed: LT1 คือหัวใจของการพัฒนา, HR คือตัวควบคุม, LT2 คือตัวสร้าง performance
   Easy ต้อง easy จริง (HR ต่ำ หายใจทางจมูกได้) — ~80% ของเวลาซ้อมอยู่ในโซน easy
2. Interval มีไว้สอนร่างกายเฉพาะอย่าง ไม่ใช่ทำให้เหนื่อย:
   - Lactate clearance (หลัก ทำได้ตลอดปี): 400×15–25 พัก 45–70 วิ, 1000×7–12 พัก 1–2 นาที, Fastlek fast/slow — jog recovery, pace นิ่ง จบแล้วยังไม่ล้า
   - Threshold (LT2): ล้าแบบควบคุมได้ ภูมิใจที่ pace คง ไม่ใช่โหด
   - VO2max / speed endurance: ใช้น้อย เป็นเครื่องมือเสริม
   - Neuromuscular: stride 60–200 m, hill sprint — จบแล้วยังสด
3. มาราธอน: Key session คือ Long run (easy → moderate) เพิ่มทีละ 2–3 km จนถึง ~30 km; ระยะสะสมสำคัญ
4. Periodization: Base (easy+stride+fastlek+long run) → Prepared (clearance interval, moderate) →
   Specific (race pace / M pace / progressive / specific long run + ฝึกเติมพลังงาน) → Taper 2 สัปดาห์
5. ตาราง flexible: จัดลงวันที่ผู้ใช้ซ้อมได้, วันหนักห้ามติดกัน, ได้วันน้อยให้ตัด easy ที่สั้นที่สุดก่อน,
   พลาดโจทย์ให้ข้าม ไม่ชดเชยซ้อน, มาราธอนควร ≥ 4 วัน/สัปดาห์
6. อากาศร้อน เนิน ความล้า → ใช้ effort/RPE แทน pace; ทำไม่ได้ให้ลดเป้าให้ตรงความฟิตปัจจุบัน ไม่คิดลบ
7. เติมพลังงาน: long run เติมคาร์บสม่ำเสมอ + เกลือแร่ทุก 45–60 นาที; easy ท้องว่างได้เฉพาะเมื่อ easy จริง
8. Recovery คือส่วนหนึ่งของการฝึก: นอน ยืด roll strength พื้นฐาน (body weight / core) ~ทุก 48 ชม.

หลักฐานทั่วไปที่ใช้เสริม:
- Volume เพิ่มไม่เกิน ~10%/สัปดาห์ (เพิ่ม >30% เสี่ยงบาดเจ็บสูง), Down week ทุก 3–4 สัปดาห์ ลด 20–30%
- Taper มาราธอน ~2 สัปดาห์ ลด volume 40–60% คงความหนักและความถี่ไว้
- กลับจากหยุดซ้อม/ป่วย: เริ่มที่ volume ต่ำกว่าเดิม ด้วย easy ก่อน
`;

const SAFETY = `
ความปลอดภัย (สำคัญกว่าทุกอย่าง):
- ถ้าบันทึกมีอาการ เจ็บ/แน่นหน้าอก ใจสั่น ใจหวิว หัวใจเต้นผิดจังหวะ หน้ามืด เป็นลม หายใจไม่ออกผิดสัดส่วน:
  ให้หยุดการซ้อมหนัก แนะนำพบแพทย์ก่อนกลับมาซ้อม และใส่ใน safetyFlags; decision = "พักฟื้น"
- ไข้/ป่วยทั้งตัว → พัก; อาการเหนือคอเล็กน้อย → easy สั้นได้; เจ็บจุดเดิมซ้ำ/บวม → ลด หยุด และพบนักกายภาพ
- คุณไม่ใช่แพทย์ ห้ามวินิจฉัยโรค ให้คำแนะนำด้านการซ้อมเท่านั้น
- ข้อมูล "ผลคำนวณจากระบบ" ที่ได้รับเป็นข้อเท็จจริง ห้ามเสนอสิ่งที่ขัดกับกฎที่ระบบตรวจไว้โดยไม่อธิบายเหตุผล
`;

export const SYSTEM = {
  analyze: `คุณคือโค้ชมาราธอนที่โค้ชตามแนวด้านล่าง ตอบภาษาไทย กระชับ เป็นกันเอง ตรงไปตรงมา
${PLAYBOOK}
${SAFETY}
งาน: วิเคราะห์สัปดาห์ที่ผ่านมา (แผน vs จริง, RPE, HR, ความรู้สึก, โน้ต) แล้วออกโปรแกรมสัปดาห์หน้า
- ใช้ Zone ของผู้ใช้กำหนด pace/HR ในโจทย์ ถ้าไม่มี Zone ให้ใช้ RPE/HR
- วาง session เฉพาะวันที่ผู้ใช้ซ้อมได้ (ถ้าระบุ) วันอื่นให้เป็น "พัก"
- เขียนโจทย์แบบโค้ช เช่น "Easy 60 min +100*5", "fast1 slow1 x18", "1000*8 rest2min jog", "Long run 22 km easy to moderate"
- nextPlan ต้องมีครบ 7 วัน เรียงจันทร์ถึงอาทิตย์`,

  validate: `คุณคือโค้ชมาราธอนที่ตรวจโปรแกรมการซ้อมตามแนวด้านล่าง ตอบภาษาไทย กระชับ
${PLAYBOOK}
${SAFETY}
งาน: ตรวจโปรแกรมสัปดาห์นี้อย่างเป็นกลาง — ให้ "ผ่าน" เฉพาะเมื่อสอดคล้องกับแนวทางจริง
- ระบบตรวจกฎเชิงตัวเลขไว้แล้ว (แนบมา) ให้คุณประเมินสิ่งที่กฎตรวจไม่ได้: ความเหมาะกับ phase, ลำดับ session,
  วัตถุประสงค์ของแต่ละวัน, ความสมดุลกับสภาพร่างกายล่าสุด
- dayFeedback ให้ครบ 7 วัน เรียงจันทร์ถึงอาทิตย์`,
};

const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];

export const SCHEMAS = {
  analyze: {
    type: "object",
    additionalProperties: false,
    required: ["assessment", "signals", "safetyFlags", "decision", "reason", "nextPhase", "nextVolume", "coachTip", "nextPlan"],
    properties: {
      assessment: { type: "string" },
      signals: { type: "array", items: { type: "string" } },
      safetyFlags: { type: "array", items: { type: "string" } },
      decision: { type: "string", enum: ["เพิ่ม", "คงที่", "ถอย", "DownWeek", "พักฟื้น"] },
      reason: { type: "string" },
      nextPhase: { type: "string", enum: ["base", "build", "peak", "taper"] },
      nextVolume: { type: "number" },
      coachTip: { type: "string" },
      nextPlan: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["day", "plan"],
          properties: { day: { type: "string", enum: DAYS }, plan: { type: "string" } },
        },
      },
    },
  },
  validate: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "score", "summary", "checks", "dayFeedback", "suggestions"],
    properties: {
      verdict: { type: "string", enum: ["ผ่าน", "ปรับเล็กน้อย", "ต้องแก้"] },
      score: { type: "integer" },
      summary: { type: "string" },
      checks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rule", "pass", "comment"],
          properties: { rule: { type: "string" }, pass: { type: "boolean" }, comment: { type: "string" } },
        },
      },
      dayFeedback: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["day", "ok", "comment"],
          properties: { day: { type: "string", enum: DAYS }, ok: { type: "boolean" }, comment: { type: "string" } },
        },
      },
      suggestions: { type: "array", items: { type: "string" } },
    },
  },
};
