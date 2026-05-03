-- ============================================================
-- เปลี่ยน frequency: ลบ biweekly เพิ่ม daily
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ============================================================

-- แปลงข้อมูลเก่าก่อน (biweekly → weekly เพื่อให้ผ่าน constraint ใหม่)
update public.share_groups set frequency = 'weekly' where frequency = 'biweekly';

-- เปลี่ยน check constraint
alter table public.share_groups drop constraint if exists share_groups_frequency_check;
alter table public.share_groups
  add constraint share_groups_frequency_check
  check (frequency in ('daily','weekly','monthly'));
