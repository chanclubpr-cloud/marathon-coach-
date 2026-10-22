// Supabase Edge Function: coach
// เรียก Claude ฝั่ง server — API key ไม่อยู่ในเบราว์เซอร์อีกต่อไป
// Deploy:  supabase functions deploy coach
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (COACH_MODEL ตั้งได้ถ้าต้องการเปลี่ยนรุ่น)
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
// ── ความรู้ของ AI Coach — สรุปจาก docs/COACHING-PLAYBOOK.md ──

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

Race A / Race B (ข้อมูลวันแข่งมากับข้อเท็จจริงของระบบ):
- Race A = มาราธอนเป้าหมายหลัก (วันแข่งในโปรไฟล์) — periodization ทั้งหมดวางเพื่อ Race A เท่านั้น
- Race B = แข่งระหว่างทาง ใช้เป็น "ซ้อมเฉพาะ/ทดสอบ" ไม่ใช่เป้า: mini-taper 2–3 วัน (ลดความหนัก ไม่ต้องลดทั้งสัปดาห์),
  ห้ามเพิ่ม volume เพื่อ Race B, วันก่อนแข่ง 2 วันเป็น Easy/Stride สั้น, วันหลังแข่งพัก/Easy
- ใช้ Race B ซ้อม execution ของ Race A: ออกช้า คุม HR เติมพลังงานตามแผน และอ่านผลเป็นข้อมูล fitness (pace/HR เทียบ M pace)
- Race B ที่ยาว (≥ ครึ่งมาราธอน) นับเป็น Long run ของสัปดาห์ ไม่ต้องเพิ่ม Long run ซ้อนอีก; หลังแข่งยาวให้ recovery เบาหลายวัน
- ถ้า Race B อยู่ใกล้ Race A (≤ 3 สัปดาห์) แนะนำใช้เป็น long run/ซ้อม ไม่ลงเต็มแรง; ห้ามเสนอให้ Race B ทำให้พลาดสัปดาห์สำคัญของ Race A

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

const SYSTEM = {
  analyze: `คุณคือโค้ชมาราธอนที่โค้ชตามแนวด้านล่าง ตอบภาษาไทย กระชับ เป็นกันเอง ตรงไปตรงมา
${PLAYBOOK}
${SAFETY}
งาน: วิเคราะห์สัปดาห์ที่ผ่านมา (แผน vs จริง, RPE, HR, ความรู้สึก, โน้ต) แล้วออกโปรแกรมสัปดาห์หน้า
- ใช้ Zone ของผู้ใช้กำหนด pace/HR ในโจทย์ ถ้าไม่มี Zone ให้ใช้ RPE/HR
- วาง session เฉพาะวันที่ผู้ใช้ซ้อมได้ (ถ้าระบุ) วันอื่นให้เป็น "พัก"
- เขียนโจทย์แบบโค้ช เช่น "Easy 60 min +100*5", "fast1 slow1 x18", "1000*8 rest2min jog", "Long run 22 km easy to moderate"
- ถ้ามี "feedback รายวันที่โค้ชให้ไปแล้ว" ให้ยึดสอดคล้องกัน ถ้าจะแนะนำต่างจากเดิมให้อธิบายเหตุผลสั้นๆ
- ถ้าบอกว่าสัปดาห์ยังไม่จบ ห้ามนับวันที่ "ยังไม่ถึง" เป็นการข้าม
- nextPlan ต้องมีครบ 7 วัน เรียงจันทร์ถึงอาทิตย์`,

  validate: `คุณคือโค้ชมาราธอนที่ตรวจโปรแกรมการซ้อมตามแนวด้านล่าง ตอบภาษาไทย กระชับ
${PLAYBOOK}
${SAFETY}
งาน: ตรวจโปรแกรมสัปดาห์นี้อย่างเป็นกลาง — ให้ "ผ่าน" เฉพาะเมื่อสอดคล้องกับแนวทางจริง
- ระบบตรวจกฎเชิงตัวเลขไว้แล้ว (แนบมา) ให้คุณประเมินสิ่งที่กฎตรวจไม่ได้: ความเหมาะกับ phase, ลำดับ session,
  วัตถุประสงค์ของแต่ละวัน, ความสมดุลกับสภาพร่างกายล่าสุด
- dayFeedback ให้ครบ 7 วัน เรียงจันทร์ถึงอาทิตย์
- วันที่เป็น Race B ถือว่าตั้งใจแล้ว ประเมินว่าการจัดสัปดาห์รอบแข่งเหมาะสมหรือไม่ อย่าตำหนิว่าไม่มี Long run หรือ volume พุ่งเพราะแข่ง`,

  daily: `คุณคือโค้ชมาราธอนคนเดียวกับที่วิเคราะห์รายสัปดาห์ ตอนนี้ให้ feedback สั้นๆ หลังนักวิ่งส่งผลซ้อมของ "วันนี้" ตอบภาษาไทย กระชับ อบอุ่น ตรงไปตรงมา
${PLAYBOOK}
${SAFETY}
งาน: ประเมินเฉพาะผลซ้อมวันนี้
- เทียบกับโจทย์ของวันนั้นและ Zone (ถ้ามี) ใช้ RPE/HR/ความรู้สึก/โน้ตประกอบ; ระบบตรวจเชิงตัวเลขแนบมาให้แล้ว (เป็นข้อเท็จจริง)
- good = สิ่งที่ทำได้ดี 1–3 ข้อ (เจาะจง ไม่ชมลอยๆ), watch = สิ่งที่ควรระวัง 0–3 ข้อ (ไม่มีก็ให้ว่าง)
- next = คำแนะนำสั้นๆ ถึง "วันถัดไป/การฟื้นตัว" ตามแผนที่มี ถ้าไม่ควรเปลี่ยนแผนให้บอกว่าทำตามแผนเดิม; ถ้าต้องปรับให้บอกชัดว่าปรับอะไร
- ถ้าวันนี้เป็นวันแข่ง (Race B): ประเมินการ execute (ออกช้า/negative split/HR/เติมพลังงาน) และบอกว่าผลนี้สะท้อน fitness สำหรับ Race A อย่างไร พร้อมแนวฟื้นตัว
- ไม่ออกโปรแกรมทั้งสัปดาห์ และไม่วินิจฉัยโรค; ถ้ามีสัญญาณอันตรายให้ verdict = "ควรพัก/ระวัง" และใส่ safetyFlags`,
};

const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];

const SCHEMAS = {
  daily: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "verdict", "good", "watch", "next", "safetyFlags"],
    properties: {
      headline: { type: "string" },
      verdict: { type: "string", enum: ["ตามแผน", "ทำได้ดี", "หนักเกินไป", "เบากว่าแผน", "ควรพัก/ระวัง"] },
      good: { type: "array", items: { type: "string" } },
      watch: { type: "array", items: { type: "string" } },
      next: { type: "string" },
      safetyFlags: { type: "array", items: { type: "string" } },
    },
  },
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


const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const MODEL = Deno.env.get("COACH_MODEL") ?? "claude-sonnet-4-6";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // อนุญาตเฉพาะผู้ใช้ที่ login แล้ว
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { task, input } = await req.json().catch(() => ({}));
  if (!(task in SYSTEM) || typeof input !== "string" || input.length > 20000)
    return json({ error: "bad request" }, 400);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: task === "daily" ? 2000 : 16000,
      system: SYSTEM[task as keyof typeof SYSTEM],
      messages: [{ role: "user", content: input }],
      output_config: { format: { type: "json_schema", schema: SCHEMAS[task as keyof typeof SCHEMAS] } },
    });
    if (response.stop_reason === "refusal") return json({ error: "AI ปฏิเสธคำขอนี้" }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "คำตอบยาวเกินไป ลองใหม่อีกครั้ง" }, 502);
    const text = response.content.find((b) => b.type === "text");
    return json(JSON.parse(text?.type === "text" ? text.text : "{}"));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "ใช้งาน AI ถี่เกินไป รอสักครู่" }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `AI error ${e.status}` }, 502);
    return json({ error: String(e) }, 500);
  }
});
