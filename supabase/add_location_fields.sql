-- ============================================================
-- เพิ่มฟิลด์ Google Places ให้ rounds (additive — ไม่ลบข้อมูลเก่า)
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ============================================================

alter table public.rounds
  add column if not exists location_place_id text,
  add column if not exists location_address text,
  add column if not exists location_lat numeric(10,7),
  add column if not exists location_lng numeric(10,7),
  add column if not exists location_url text;
