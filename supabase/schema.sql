-- ============================================================
-- LenShare schema v2 — DROP + RECREATE (สำหรับช่วง dev เท่านั้น)
-- รันใน Supabase SQL Editor ทั้งไฟล์
-- ============================================================

-- Drop existing (dev only — ลบข้อมูลเก่าทั้งหมด)
drop table if exists public.bids cascade;
drop table if exists public.payment_status cascade;
drop table if exists public.rounds cascade;
drop table if exists public.memberships cascade;
drop table if exists public.share_groups cascade;
drop table if exists public.profiles cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_group_member(uuid) cascade;
drop function if exists public.is_group_owner(uuid) cascade;
drop function if exists public.gen_invite_code() cascade;

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- helpers
-- ============================================================
create function public.gen_invite_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  -- 8 chars, A-Z 0-9 ไม่มี O,I,0,1 (อ่านง่าย)
  code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  code := translate(code, 'OI01', 'XYZW');
  return code;
end;
$$;

-- ============================================================
-- share_groups (วงแชร์)
-- ============================================================
create table public.share_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- ประเภทวง
  bid_type text not null check (bid_type in ('none','deduct','follow')),

  -- เงิน
  member_amount numeric(12,2) not null check (member_amount > 0),
  dealer_amount numeric(12,2) not null default 0 check (dealer_amount >= 0),
  dealer_commission numeric(12,2) not null default 0 check (dealer_commission >= 0),
  dealer_can_bid boolean not null default false,

  -- การประมูล
  bid_step numeric(12,2) not null default 10 check (bid_step > 0),
  bid_window_hours int not null default 24 check (bid_window_hours > 0),

  -- รอบ
  total_rounds int not null check (total_rounds > 1),
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  start_date date not null,

  -- เชิญ
  invite_code text unique not null default public.gen_invite_code(),

  -- ขอลบวง (null = ยังไม่ขอ)
  deletion_requested_at timestamptz,

  created_at timestamptz not null default now()
);

-- ============================================================
-- memberships (สมาชิกในวง)
-- ============================================================
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.share_groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index idx_memberships_group on public.memberships(group_id);
create index idx_memberships_user on public.memberships(user_id);

-- ============================================================
-- rounds (งวด)
-- ============================================================
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.share_groups(id) on delete cascade,
  round_number int not null check (round_number > 0),
  due_date date not null,

  -- ประมูล
  scheduled_open_at timestamptz,
  bid_opens_at timestamptz,
  bid_closes_at timestamptz,
  tiebreak_iteration int not null default 0,
  winner_membership_id uuid references public.memberships(id) on delete set null,
  winning_bid numeric(12,2) not null default 0 check (winning_bid >= 0),

  -- นัดกินข้าว (location + Google Places)
  location text,
  location_place_id text,
  location_address text,
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  location_url text,
  meal_payment_mode text check (meal_payment_mode in ('dealer','split','none')),

  -- สถานะ
  status text not null default 'pending' check (
    status in ('pending','open_bidding','tiebreak','closed','completed')
  ),
  notes text,
  created_at timestamptz not null default now(),
  unique (group_id, round_number)
);
create index idx_rounds_group on public.rounds(group_id);

-- ============================================================
-- bids (การประมูลของสมาชิกแต่ละคน)
-- ============================================================
create table public.bids (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  tiebreak_iteration int not null default 0,
  created_at timestamptz not null default now(),
  unique (round_id, membership_id, tiebreak_iteration)
);
create index idx_bids_round on public.bids(round_id);

-- ============================================================
-- deletion_approvals (อนุมัติลบวงโดยสมาชิก)
-- ============================================================
create table public.deletion_approvals (
  group_id uuid not null references public.share_groups(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (group_id, membership_id)
);

-- ============================================================
-- payment_status (สถานะการจ่าย/รับเงินต่อ member ต่อรอบ)
-- ============================================================
create table public.payment_status (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  paid boolean not null default false,
  paid_at timestamptz,
  notes text,
  unique (round_id, membership_id)
);
create index idx_payment_status_round on public.payment_status(round_id);

-- ============================================================
-- Trigger: profile auto-create
-- ============================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- helpers (security definer เพื่อหลบ recursion ใน RLS)
-- ============================================================
create function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where group_id = gid and user_id = auth.uid()
  );
$$;

create function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.share_groups
    where id = gid and owner_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.share_groups enable row level security;
alter table public.memberships enable row level security;
alter table public.rounds enable row level security;
alter table public.bids enable row level security;
alter table public.payment_status enable row level security;
alter table public.deletion_approvals enable row level security;

-- profiles
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid());

-- share_groups
create policy "groups_select_member" on public.share_groups
  for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));
create policy "groups_insert_self" on public.share_groups
  for insert to authenticated
  with check (owner_id = auth.uid());
create policy "groups_update_owner" on public.share_groups
  for update to authenticated using (owner_id = auth.uid());
create policy "groups_delete_owner" on public.share_groups
  for delete to authenticated using (owner_id = auth.uid());

-- memberships
create policy "memberships_select" on public.memberships
  for select to authenticated
  using (public.is_group_owner(group_id) or public.is_group_member(group_id));
-- owner add anyone; users can self-join (insert their own row) via invite
create policy "memberships_insert_owner" on public.memberships
  for insert to authenticated
  with check (
    public.is_group_owner(group_id)
    or (user_id = auth.uid() and role = 'member')
  );
create policy "memberships_update_owner" on public.memberships
  for update to authenticated using (public.is_group_owner(group_id));
create policy "memberships_delete_owner" on public.memberships
  for delete to authenticated using (public.is_group_owner(group_id));

-- rounds
create policy "rounds_select" on public.rounds
  for select to authenticated
  using (public.is_group_owner(group_id) or public.is_group_member(group_id));
create policy "rounds_insert_owner" on public.rounds
  for insert to authenticated
  with check (public.is_group_owner(group_id));
create policy "rounds_update_owner" on public.rounds
  for update to authenticated using (public.is_group_owner(group_id));
create policy "rounds_delete_owner" on public.rounds
  for delete to authenticated using (public.is_group_owner(group_id));

-- bids — สมาชิกใส่ bid ของตัวเองได้, อ่านได้ทุกคนในวง
create policy "bids_select" on public.bids
  for select to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and (public.is_group_owner(r.group_id) or public.is_group_member(r.group_id))
    )
  );
create policy "bids_insert_self" on public.bids
  for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
    )
  );
create policy "bids_update_self" on public.bids
  for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
    )
  );
create policy "bids_delete_owner" on public.bids
  for delete to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_group_owner(r.group_id)
    )
  );

-- payment_status — owner อ่าน/เขียนได้, member อ่านได้
create policy "payment_status_select" on public.payment_status
  for select to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and (public.is_group_owner(r.group_id) or public.is_group_member(r.group_id))
    )
  );
create policy "payment_status_insert_owner" on public.payment_status
  for insert to authenticated
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_group_owner(r.group_id)
    )
  );
create policy "payment_status_update_owner" on public.payment_status
  for update to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_group_owner(r.group_id)
    )
  );

-- deletion_approvals
create policy "deletion_approvals_select" on public.deletion_approvals
  for select to authenticated
  using (public.is_group_owner(group_id) or public.is_group_member(group_id));
create policy "deletion_approvals_insert_self" on public.deletion_approvals
  for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
    )
  );
create policy "deletion_approvals_delete_self_or_owner" on public.deletion_approvals
  for delete to authenticated
  using (
    public.is_group_owner(group_id)
    or exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
    )
  );

-- ============================================================
-- View: lookup group by invite code (รวม owner_id เพื่อกัน RLS recursion ตอน join)
-- ใช้ผ่าน RPC แทน เพื่อให้ผู้ใช้ที่ยังไม่ได้เป็นสมาชิกค้นหาวงเจอ
-- ============================================================
create or replace function public.find_group_by_invite(code text)
returns table (
  id uuid,
  name text,
  bid_type text,
  member_amount numeric,
  total_rounds int,
  start_date date,
  frequency text,
  owner_display text
)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.name, g.bid_type, g.member_amount, g.total_rounds,
         g.start_date, g.frequency,
         coalesce(p.display_name, '—') as owner_display
  from public.share_groups g
  left join public.profiles p on p.id = g.owner_id
  where g.invite_code = code
  limit 1;
$$;

grant execute on function public.find_group_by_invite(text) to authenticated;

-- ============================================================
-- RPC: open_due_rounds — เปิดประมูลรอบที่ถึงเวลาแล้ว
-- ============================================================
create or replace function public.open_due_rounds(gid uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  win_hours int;
  affected int;
begin
  if not (public.is_group_owner(gid) or public.is_group_member(gid)) then
    raise exception 'not allowed';
  end if;
  select bid_window_hours into win_hours from public.share_groups where id = gid;
  if win_hours is null then return 0; end if;

  with updated as (
    update public.rounds
    set status = 'open_bidding',
        bid_opens_at = now(),
        bid_closes_at = now() + (win_hours * interval '1 hour')
    where group_id = gid
      and status = 'pending'
      and round_number > 1
      and scheduled_open_at is not null
      and scheduled_open_at <= now()
    returning 1
  )
  select count(*)::int into affected from updated;
  return affected;
end;
$$;

grant execute on function public.open_due_rounds(uuid) to authenticated;
