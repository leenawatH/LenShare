import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatTHB, formatDate } from "@/lib/utils";
import {
  computeAllRounds,
  summarize,
  type MemberInput,
  type RoundInput,
  type Mode,
} from "@/lib/share-math";
import { InviteCode } from "./invite-code";
import { RoundCard } from "./round-card";
import { DeleteGroupSection } from "./delete-group-section";

const FREQ_LABEL: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
};

const TYPE_LABEL: Record<Mode, string> = {
  none: "ไม่มีดอก",
  deduct: "ดอกหัก",
  follow: "ดอกตาม",
};

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // เปิดประมูลรอบที่ถึงเวลาแล้วอัตโนมัติ (best-effort, ละเลย error)
  await supabase.rpc("open_due_rounds", { gid: id });

  const [{ data: group }, { data: members }, { data: rounds }] =
    await Promise.all([
      supabase.from("share_groups").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("memberships")
        .select("*")
        .eq("group_id", id)
        .order("role", { ascending: true })
        .order("joined_at", { ascending: true }),
      supabase
        .from("rounds")
        .select("*")
        .eq("group_id", id)
        .order("round_number", { ascending: true }),
    ]);

  if (!group) notFound();

  const isOwner = user?.id === group.owner_id;
  const myMembership = members?.find((m) => m.user_id === user?.id);

  // โหลด bids และ payment_status ทั้งหมดของวง
  const roundIds = (rounds ?? []).map((r) => r.id);
  const [{ data: bids }, { data: paymentStatuses }] =
    roundIds.length > 0
      ? await Promise.all([
          supabase.from("bids").select("*").in("round_id", roundIds),
          supabase
            .from("payment_status")
            .select("*")
            .in("round_id", roundIds),
        ])
      : [{ data: [] }, { data: [] }];

  // โหลด deletion approvals
  const { data: approvals } = await supabase
    .from("deletion_approvals")
    .select("group_id, membership_id")
    .eq("group_id", id);

  const allRoundsCompleted =
    (rounds?.length ?? 0) > 0 &&
    (rounds ?? []).every((r) => r.status === "completed");

  const memberInputs: MemberInput[] = (members ?? []).map((m) => ({
    membershipId: m.id,
    displayName: m.display_name,
    isOwner: m.role === "owner",
  }));
  const roundInputs: RoundInput[] = (rounds ?? []).map((r) => ({
    roundNumber: r.round_number,
    winnerMembershipId: r.winner_membership_id,
    winningBid: Number(r.winning_bid ?? 0),
    status: r.status,
  }));

  const computeOpts = {
    members: memberInputs,
    rounds: roundInputs,
    memberAmount: Number(group.member_amount),
    dealerAmount: Number(group.dealer_amount ?? 0),
    dealerCommission: Number(group.dealer_commission ?? 0),
    dealerCanBid: !!group.dealer_can_bid,
    mode: group.bid_type as Mode,
  };

  const computations = computeAllRounds(computeOpts);
  const summary = summarize(computeOpts);

  const lukshareCount = memberInputs.filter((m) => !m.isOwner).length;
  const expectedMembers = group.total_rounds; // ปกติเท่ากับจำนวนงวด

  return (
    <div className="space-y-8">
      <div>
        <Link href="/groups" className="text-sm text-[hsl(var(--muted-foreground))] hover:underline">
          ← กลับไปรายการวง
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1 space-y-0.5">
              <div>
                {TYPE_LABEL[group.bid_type as Mode]} · {FREQ_LABEL[group.frequency]} · {group.total_rounds} งวด
              </div>
              <div>
                เงินสมาชิก/งวด {formatTHB(Number(group.member_amount))}
                {Number(group.dealer_amount) > 0 &&
                  ` · เงินท้าว/งวด ${formatTHB(Number(group.dealer_amount))}`}
                {Number(group.dealer_commission) > 0 &&
                  ` · ค่าท้าว ${formatTHB(Number(group.dealer_commission))}`}
              </div>
              {group.bid_type !== "none" && (
                <div>
                  step ละ {formatTHB(Number(group.bid_step))} · ประมูล{" "}
                  {group.bid_window_hours} ชม./รอบ
                  {group.dealer_can_bid && " · ท้าวเปียได้"}
                </div>
              )}
            </div>
          </div>
          {isOwner && (
            <span className="text-xs rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] px-2 py-0.5">
              คุณคือท้าวแชร์
            </span>
          )}
        </div>
      </div>

      {isOwner && (
        <InviteCode
          code={group.invite_code}
          memberCount={lukshareCount}
          expected={expectedMembers}
        />
      )}

      {/* Banner ขออนุมัติลบ (เห็นเฉพาะสมาชิก) */}
      {!isOwner && (
        <DeleteGroupSection
          groupId={group.id}
          groupName={group.name}
          isOwner={isOwner}
          myMembershipId={myMembership?.id ?? null}
          members={members ?? []}
          allRoundsCompleted={allRoundsCompleted}
          deletionRequestedAt={group.deletion_requested_at ?? null}
          approvals={approvals ?? []}
        />
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">
          สมาชิก ({lukshareCount} ลูกแชร์)
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(members ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.display_name}</span>
                {m.role === "owner" && (
                  <span className="text-xs rounded bg-[hsl(var(--muted))] px-1.5 py-0.5">
                    ท้าว
                  </span>
                )}
                {m.user_id === user?.id && (
                  <span className="text-xs rounded bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] px-1.5 py-0.5">
                    คุณ
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">รอบประมูล</h2>
        <div className="space-y-3">
          {(rounds ?? []).map((r) => {
            const comp = computations.find(
              (c) => c.roundNumber === r.round_number,
            );
            const winner = members?.find(
              (m) => m.id === r.winner_membership_id,
            );
            const roundBids = (bids ?? []).filter((b) => b.round_id === r.id);
            const roundPayments = (paymentStatuses ?? []).filter(
              (p) => p.round_id === r.id,
            );
            return (
              <RoundCard
                key={r.id}
                round={r}
                winnerName={winner?.display_name ?? null}
                members={members ?? []}
                myMembershipId={myMembership?.id ?? null}
                bidType={group.bid_type as Mode}
                bidStep={Number(group.bid_step)}
                bidWindowHours={Number(group.bid_window_hours ?? 24)}
                memberAmount={Number(group.member_amount)}
                dealerAmount={Number(group.dealer_amount ?? 0)}
                dealerCanBid={!!group.dealer_can_bid}
                isOwner={isOwner}
                computation={comp}
                bids={roundBids}
                payments={roundPayments}
                pastWinnerIds={
                  new Set(
                    (rounds ?? [])
                      .filter(
                        (rr) =>
                          rr.status === "completed" &&
                          rr.winner_membership_id &&
                          rr.round_number < r.round_number,
                      )
                      .map((rr) => rr.winner_membership_id as string),
                  )
                }
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">สรุปยอดต่อคน</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--muted))] text-left">
              <tr>
                <th className="px-3 py-2">ชื่อ</th>
                <th className="px-3 py-2 text-right">จ่ายไป</th>
                <th className="px-3 py-2 text-right">ได้รับ</th>
                <th className="px-3 py-2 text-right">สุทธิ</th>
                <th className="px-3 py-2 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.membershipId} className="border-t">
                  <td className="px-3 py-2">
                    {s.displayName}
                    {s.isOwner && (
                      <span className="ml-2 text-xs rounded bg-[hsl(var(--muted))] px-1.5 py-0.5">
                        ท้าว
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatTHB(s.totalPaid)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatTHB(s.totalReceived)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      s.net > 0
                        ? "text-emerald-600"
                        : s.net < 0
                          ? "text-[hsl(var(--destructive))]"
                          : ""
                    }`}
                  >
                    {s.net >= 0 ? "+" : ""}
                    {formatTHB(s.net)}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-[hsl(var(--muted-foreground))]">
                    {s.isOwner
                      ? "—"
                      : s.hasWon
                        ? `เปียงวด ${s.wonRound} (${formatTHB(s.wonBid)})`
                        : "ยังไม่เปีย"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
          * คำนวณจากเฉพาะงวดที่ปิดสมบูรณ์แล้ว (สถานะ "เสร็จสิ้น")
        </p>
      </section>

      {/* Danger zone (เห็นเฉพาะท้าว) */}
      {isOwner && (
        <DeleteGroupSection
          groupId={group.id}
          groupName={group.name}
          isOwner={isOwner}
          myMembershipId={myMembership?.id ?? null}
          members={members ?? []}
          allRoundsCompleted={allRoundsCompleted}
          deletionRequestedAt={group.deletion_requested_at ?? null}
          approvals={approvals ?? []}
        />
      )}
    </div>
  );
}
