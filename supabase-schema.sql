-- ══════════════════════════════════════════════
-- Marathon Coach — Supabase Schema
-- วิธีใช้: copy ทั้งหมดนี้ไปวางใน
--   Supabase → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════

-- 1. Profile ของนักวิ่ง
create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     text unique not null,   -- simple key เช่น email หรือชื่อ
  target_pace text not null default '5:30',
  race_date   text,
  phase       text not null default 'base',
  max_long_run numeric default 15,
  week_num    int default 1,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 2. ข้อมูลแต่ละสัปดาห์
create table if not exists weeks (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references profiles(user_id) on delete cascade,
  week_num     int not null,
  phase        text not null default 'base',
  target_volume numeric default 40,
  notes        text default '',
  archived_at  timestamptz,
  created_at   timestamptz default now()
);

-- 3. Session แต่ละวันในสัปดาห์นั้น
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references weeks(id) on delete cascade,
  user_id     text not null,
  day_name    text not null,
  day_index   int not null,
  plan        text default '',
  session_type text default 'rest',
  done        boolean default false,
  distance    numeric default 0,
  duration    numeric default 0,
  pace        text default '',
  hr          numeric,
  rpe         int default 0,
  feel        text default '',
  notes       text default '',
  created_at  timestamptz default now()
);

-- Index เพื่อความเร็ว
create index if not exists idx_weeks_user    on weeks(user_id);
create index if not exists idx_sessions_week on sessions(week_id);
create index if not exists idx_sessions_user on sessions(user_id);

-- Enable Row Level Security (ปลอดภัย)
alter table profiles enable row level security;
alter table weeks    enable row level security;
alter table sessions enable row level security;

-- Policy: ใครก็อ่านเขียนได้โดยใช้ user_id ของตัวเอง
-- (สำหรับ App ที่ไม่มี Auth ใช้ user_id เป็น key แทน)
create policy "profiles_all" on profiles for all using (true) with check (true);
create policy "weeks_all"    on weeks    for all using (true) with check (true);
create policy "sessions_all" on sessions for all using (true) with check (true);
