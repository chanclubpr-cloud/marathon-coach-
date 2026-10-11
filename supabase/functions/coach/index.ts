// Supabase Edge Function: coach
// เรียก Claude ฝั่ง server — API key ไม่อยู่ในเบราว์เซอร์อีกต่อไป
// Deploy:  supabase functions deploy coach
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (COACH_MODEL ตั้งได้ถ้าต้องการเปลี่ยนรุ่น)
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SYSTEM, SCHEMAS } from "./prompts.ts";

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
      max_tokens: 16000,
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
