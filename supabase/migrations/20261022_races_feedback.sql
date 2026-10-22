-- ══════════════════════════════════════════════════════════════════════════════
-- เพิ่มข้อมูล Race B รายวัน + feedback รายวันจากโค้ช (ไม่ลบ/ไม่แก้ข้อมูลเดิม)
-- รันใน Supabase → SQL Editor ครั้งเดียว (รันซ้ำได้ ไม่เป็นไร)
-- ══════════════════════════════════════════════════════════════════════════════
alter table sessions add column if not exists is_race        boolean default false;
alter table sessions add column if not exists race_name      text    default '';
alter table sessions add column if not exists race_km        numeric;
alter table sessions add column if not exists race_priority  text    default 'B';
alter table sessions add column if not exists coach_feedback text    default '';
