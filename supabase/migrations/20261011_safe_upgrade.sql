-- ══════════════════════════════════════════════════════════════════════════════
-- Marathon Coach — Safe upgrade (ไม่ลบ ไม่แก้ข้อมูลเดิม)
-- รันใน Supabase → SQL Editor ทีละขั้น ตามลำดับ (อ่าน docs/UPGRADE-GUIDE.md ก่อน)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ขั้น 0: ตรวจข้อมูลก่อน (อ่านอย่างเดียว ไม่เปลี่ยนอะไร) ────────────────────
-- 0.1 แถวที่ user_id ไม่ตรงกับบัญชี login ใด (ต้องได้ 0 ทุกตาราง ก่อนเปิด RLS ขั้น 2)
select 'profiles' t, count(*) from profiles where user_id not in (select id::text from auth.users)
union all select 'weeks',    count(*) from weeks    where user_id not in (select id::text from auth.users)
union all select 'sessions', count(*) from sessions where user_id not in (select id::text from auth.users);

-- 0.2 จำนวนข้อมูลทั้งหมด (จดตัวเลขไว้เทียบหลังอัปเกรด)
select (select count(*) from profiles) profiles, (select count(*) from weeks) weeks,
       (select count(*) from sessions) sessions;

-- 0.3 ชนิดคอลัมน์ user_id (ต้องเป็น text ทุกตาราง — ถ้าตาราง zones เป็น uuid ให้แจ้งก่อนรันขั้น 2)
select table_name, data_type from information_schema.columns
where table_schema = 'public' and column_name = 'user_id';

-- ── ขั้น 1: เพิ่มสิ่งที่โค้ดใช้แต่ไฟล์ schema เดิมไม่มี (มีอยู่แล้วจะข้ามเอง) ───
alter table profiles add column if not exists display_name text default '';
alter table profiles add column if not exists avatar_url   text default '';

create table if not exists zones (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  dist_12min numeric, dist_3min numeric, dist_20sec numeric,
  weight_kg  numeric, height_cm numeric, body_fat_pct numeric, vo2max numeric,
  fatmax_slow text, fatmax_fast text, lt1_slow text, lt1_fast text,
  moderate_slow text, moderate_fast text, lt2_slow text, lt2_fast text,
  vo2max_slow text, vo2max_fast text, marathon_pace text,
  tested_at  timestamptz default now()
);
create index if not exists idx_zones_user on zones(user_id);
alter table zones enable row level security;

-- ── ขั้น 2: ปิดช่องโหว่ — ให้แต่ละคนเห็น/แก้ได้เฉพาะข้อมูลของตัวเอง ──────────
-- รันเฉพาะเมื่อขั้น 0.1 ได้ 0 ทุกแถว (ไม่งั้นข้อมูลแถวนั้นจะ "มองไม่เห็น" — ไม่หาย แต่แอปจะไม่แสดง)
drop policy if exists "profiles_all" on profiles;
drop policy if exists "weeks_all"    on weeks;
drop policy if exists "sessions_all" on sessions;
drop policy if exists "zones_all"    on zones;
drop policy if exists "own_profiles" on profiles;
drop policy if exists "own_weeks"    on weeks;
drop policy if exists "own_sessions" on sessions;
drop policy if exists "own_zones"    on zones;

create policy "own_profiles" on profiles for all to authenticated
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "own_weeks" on weeks for all to authenticated
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "own_sessions" on sessions for all to authenticated
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "own_zones" on zones for all to authenticated
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

-- ── ขั้น 3: ตรวจหลังอัปเกรด (login ในแอปแล้วดูว่าประวัติครบเท่าตัวเลขขั้น 0.2) ─

-- ── ย้อนกลับ (ถ้าจำเป็นจริงๆ) — กลับไปเป็นแบบเดิม (เปิดกว้าง) ─────────────────
-- drop policy "own_profiles" on profiles; create policy "profiles_all" on profiles for all using (true) with check (true);
-- drop policy "own_weeks"    on weeks;    create policy "weeks_all"    on weeks    for all using (true) with check (true);
-- drop policy "own_sessions" on sessions; create policy "sessions_all" on sessions for all using (true) with check (true);
