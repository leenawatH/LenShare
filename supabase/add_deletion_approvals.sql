-- ============================================================
-- ระบบอนุมัติลบวง (additive — ไม่ลบข้อมูลเก่า)
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ============================================================

-- เพิ่ม timestamp บันทึกว่าท้าวขอลบเมื่อไหร่ (null = ยังไม่ขอ)
alter table public.share_groups
  add column if not exists deletion_requested_at timestamptz;

-- ตารางบันทึก approval ของแต่ละสมาชิก
create table if not exists public.deletion_approvals (
  group_id uuid not null references public.share_groups(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (group_id, membership_id)
);

alter table public.deletion_approvals enable row level security;

-- ทุกคนในวงอ่านได้ (เพื่อ track progress)
drop policy if exists "deletion_approvals_select" on public.deletion_approvals;
create policy "deletion_approvals_select" on public.deletion_approvals
  for select to authenticated
  using (
    public.is_group_owner(group_id) or public.is_group_member(group_id)
  );

-- สมาชิก insert approval ของตัวเองได้
drop policy if exists "deletion_approvals_insert_self" on public.deletion_approvals;
create policy "deletion_approvals_insert_self" on public.deletion_approvals
  for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
    )
  );

-- ลบ approval ได้: เจ้าของ approval (ถอน) หรือท้าว (ยกเลิกคำขอลบทั้งวง)
drop policy if exists "deletion_approvals_delete_self_or_owner" on public.deletion_approvals;
create policy "deletion_approvals_delete_self_or_owner" on public.deletion_approvals
  for delete to authenticated
  using (
    public.is_group_owner(group_id)
    or exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
    )
  );
