-- ============================================================
-- ตั้งวันเวลาเปิดประมูล + RPC เปิดอัตโนมัติเมื่อถึงเวลา
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ============================================================

alter table public.rounds
  add column if not exists scheduled_open_at timestamptz;

-- RPC: เปิดทุกรอบที่ถึงเวลาแล้วในวงนี้ (callable โดยสมาชิกในวง)
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

  select bid_window_hours into win_hours
  from public.share_groups
  where id = gid;
  if win_hours is null then return 0; end if;

  with updated as (
    update public.rounds
    set status = 'open_bidding',
        bid_opens_at = now(),
        bid_closes_at = now() + (win_hours * interval '1 hour')
    where group_id = gid
      and status = 'pending'
      and round_number > 1                -- งวด 1 = ท้าวรับ ไม่ประมูล
      and scheduled_open_at is not null
      and scheduled_open_at <= now()
    returning 1
  )
  select count(*)::int into affected from updated;
  return affected;
end;
$$;

grant execute on function public.open_due_rounds(uuid) to authenticated;
