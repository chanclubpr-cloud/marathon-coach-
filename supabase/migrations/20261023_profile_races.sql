-- เก็บรายการ Race B และชื่อ Race A ในโปรไฟล์ (ไม่แตะข้อมูลเดิม รันซ้ำได้)
alter table profiles add column if not exists races     jsonb default '[]'::jsonb;
alter table profiles add column if not exists race_name text  default '';
