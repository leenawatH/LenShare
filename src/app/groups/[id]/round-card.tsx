"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatTHB, formatDate } from "@/lib/utils";
import { resolveBidding, type RoundComputation, type Mode } from "@/lib/share-math";
import {
  RestaurantPicker,
  EMPTY_PLACE,
  type PickedPlace,
} from "./restaurant-picker";

type RoundStatus =
  | "pending"
  | "open_bidding"
  | "tiebreak"
  | "closed"
  | "completed";

type Round = {
  id: string;
  round_number: number;
  due_date: string;
  scheduled_open_at: string | null;
  bid_opens_at: string | null;
  bid_closes_at: string | null;
  tiebreak_iteration: number;
  winner_membership_id: string | null;
  winning_bid: number;
  location: string | null;
  location_place_id: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_url: string | null;
  meal_payment_mode: "dealer" | "split" | "none" | null;
  status: RoundStatus;
  notes: string | null;
};

type Member = {
  id: string;
  user_id: string | null;
  display_name: string;
  role: "owner" | "member";
};

type Bid = {
  id: string;
  round_id: string;
  membership_id: string;
  amount: number;
  tiebreak_iteration: number;
};

type Payment = {
  id: string;
  round_id: string;
  membership_id: string;
  paid: boolean;
};

const STATUS_LABEL: Record<RoundStatus, { text: string; cls: string }> = {
  pending: { text: "ยังไม่เริ่ม", cls: "bg-[hsl(var(--muted))]" },
  open_bidding: { text: "กำลังประมูล", cls: "bg-amber-100 text-amber-800" },
  tiebreak: { text: "ประมูลแก้เสมอ", cls: "bg-orange-100 text-orange-800" },
  closed: { text: "ปิดประมูลแล้ว", cls: "bg-blue-100 text-blue-800" },
  completed: { text: "เสร็จสิ้น", cls: "bg-emerald-100 text-emerald-700" },
};

export function RoundCard(props: {
  round: Round;
  winnerName: string | null;
  members: Member[];
  myMembershipId: string | null;
  bidType: Mode;
  bidStep: number;
  bidWindowHours: number;
  memberAmount: number;
  dealerAmount: number;
  dealerCanBid: boolean;
  isOwner: boolean;
  computation?: RoundComputation;
  bids: Bid[];
  payments: Payment[];
  pastWinnerIds: Set<string>;
}) {
  const {
    round,
    winnerName,
    members,
    myMembershipId,
    bidType,
    bidStep,
    bidWindowHours,
    memberAmount,
    dealerCanBid,
    isOwner,
    computation,
    bids: allBids,
    payments,
    pastWinnerIds,
  } = props;

  // bids ของ iteration ปัจจุบัน
  const bids = useMemo(
    () =>
      allBids.filter((b) => b.tiebreak_iteration === round.tiebreak_iteration),
    [allBids, round.tiebreak_iteration],
  );

  // bids ของ iteration ก่อนหน้า (ใช้หา tied members สำหรับ tiebreak)
  const prevBids = useMemo(
    () =>
      round.tiebreak_iteration > 0
        ? allBids.filter(
            (b) => b.tiebreak_iteration === round.tiebreak_iteration - 1,
          )
        : [],
    [allBids, round.tiebreak_iteration],
  );

  // หา tied members จาก iteration ก่อนหน้า
  const tiedFromPrev = useMemo(() => {
    if (prevBids.length === 0) return new Set<string>();
    const max = Math.max(...prevBids.map((b) => b.amount));
    return new Set(
      prevBids.filter((b) => b.amount === max).map((b) => b.membership_id),
    );
  }, [prevBids]);

  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const supabase = createClient();

  // งวดที่ 1 = ท้าวรับเงินก้อนอัตโนมัติเสมอ (ไม่ประมูล)
  const isFirstRound = round.round_number === 1;
  const ownerMember = useMemo(
    () => members.find((m) => m.role === "owner") ?? null,
    [members],
  );

  // คนที่เข้าประมูลได้รอบนี้
  const eligibleBidders = useMemo(() => {
    if (isFirstRound) {
      return ownerMember ? [ownerMember] : [];
    }
    return members.filter((m) => {
      if (pastWinnerIds.has(m.id)) return false;
      if (m.role === "owner" && !dealerCanBid) return false;
      // tiebreak: เฉพาะ tied จาก iteration ก่อนหน้า
      if (round.status === "tiebreak" && tiedFromPrev.size > 0) {
        return tiedFromPrev.has(m.id);
      }
      return true;
    });
  }, [
    isFirstRound,
    ownerMember,
    members,
    pastWinnerIds,
    dealerCanBid,
    round.status,
    tiedFromPrev,
  ]);

  const myBid = bids.find((b) => b.membership_id === myMembershipId);
  const canIBid =
    !!myMembershipId &&
    (round.status === "open_bidding" || round.status === "tiebreak") &&
    eligibleBidders.some((m) => m.id === myMembershipId);

  // ⚠ Sealed bid — ไม่คำนวณ/แสดง tied state ระหว่างเปิดประมูล
  // ความเสมอจะถูกตรวจสอบฝั่งเซิร์ฟเวอร์ตอน closeBidding และ auto-trigger tiebreak

  // ---------- actions ----------
  async function setLocationMeal(
    place: PickedPlace,
    meal: "dealer" | "split" | "none" | null,
    scheduledOpenAt: string | null,
  ) {
    setError(null);
    const { error } = await supabase
      .from("rounds")
      .update({
        location: place.name,
        location_place_id: place.placeId,
        location_address: place.address,
        location_lat: place.lat,
        location_lng: place.lng,
        location_url: place.url,
        meal_payment_mode: meal,
        scheduled_open_at: scheduledOpenAt,
      })
      .eq("id", round.id);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function openBidding() {
    setError(null);
    if (isFirstRound) {
      // งวด 1 → ท้าวรับเงินก้อนอัตโนมัติ ไม่ประมูล
      if (!ownerMember) {
        return setError("ไม่พบท้าวแชร์ในวงนี้");
      }
      const { error } = await supabase
        .from("rounds")
        .update({
          status: "closed",
          winner_membership_id: ownerMember.id,
          winning_bid: 0,
        })
        .eq("id", round.id);
      if (error) return setError(error.message);
      startTransition(() => router.refresh());
      return;
    }
    if (bidType === "none") {
      // ไม่มีดอก → ข้ามไป closed (ให้ owner เลือกผู้ชนะเอง)
      const { error } = await supabase
        .from("rounds")
        .update({ status: "closed" })
        .eq("id", round.id);
      if (error) return setError(error.message);
    } else {
      const opens = new Date();
      const closes = new Date();
      closes.setHours(closes.getHours() + bidWindowHours);
      const { error } = await supabase
        .from("rounds")
        .update({
          status: "open_bidding",
          bid_opens_at: opens.toISOString(),
          bid_closes_at: closes.toISOString(),
        })
        .eq("id", round.id);
      if (error) return setError(error.message);
    }
    startTransition(() => router.refresh());
  }

  async function closeBidding() {
    setError(null);
    if (bids.length === 0) {
      return setError("ยังไม่มีใครส่งดอกในรอบนี้");
    }
    const r = resolveBidding(
      bids.map((b) => ({ membershipId: b.membership_id, amount: b.amount })),
    );
    if (r.tied.length > 1) {
      // เสมอ → เริ่ม tie-break อัตโนมัติ 10 นาที
      const opens = new Date();
      const closes = new Date(opens.getTime() + 10 * 60 * 1000);
      const { error } = await supabase
        .from("rounds")
        .update({
          status: "tiebreak",
          tiebreak_iteration: round.tiebreak_iteration + 1,
          bid_opens_at: opens.toISOString(),
          bid_closes_at: closes.toISOString(),
        })
        .eq("id", round.id);
      if (error) return setError(error.message);
      startTransition(() => router.refresh());
      return;
    }
    // มีผู้ชนะชัดเจน
    const { error } = await supabase
      .from("rounds")
      .update({
        status: "closed",
        winner_membership_id: r.winnerId,
        winning_bid: r.topAmount,
      })
      .eq("id", round.id);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function manualSelectWinner(winnerId: string) {
    setError(null);
    const { error } = await supabase
      .from("rounds")
      .update({
        status: "closed",
        winner_membership_id: winnerId,
        winning_bid: 0,
      })
      .eq("id", round.id);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function markComplete() {
    setError(null);
    const { error } = await supabase
      .from("rounds")
      .update({ status: "completed" })
      .eq("id", round.id);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function reopenRound() {
    setError(null);
    const { error } = await supabase
      .from("rounds")
      .update({ status: "pending", winner_membership_id: null, winning_bid: 0 })
      .eq("id", round.id);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function placeBid(amount: number) {
    setError(null);
    if (!myMembershipId) return;
    if (amount <= 0 || amount % bidStep !== 0) {
      return setError(`จำนวนต้องเป็นบวก และเป็นทวีคูณของ ${bidStep}`);
    }
    if (amount >= memberAmount) {
      return setError(`ดอกต้องน้อยกว่าเงินสมาชิก (${formatTHB(memberAmount)})`);
    }
    // upsert bid (ใช้ unique constraint round_id + membership_id + tiebreak_iteration)
    const { error } = await supabase.from("bids").upsert(
      {
        round_id: round.id,
        membership_id: myMembershipId,
        amount,
        tiebreak_iteration: round.tiebreak_iteration,
      },
      { onConflict: "round_id,membership_id,tiebreak_iteration" },
    );
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function togglePayment(membershipId: string, paid: boolean) {
    setError(null);
    const existing = payments.find((p) => p.membership_id === membershipId);
    if (existing) {
      const { error } = await supabase
        .from("payment_status")
        .update({ paid, paid_at: paid ? new Date().toISOString() : null })
        .eq("id", existing.id);
      if (error) return setError(error.message);
    } else {
      const { error } = await supabase.from("payment_status").insert({
        round_id: round.id,
        membership_id: membershipId,
        paid,
        paid_at: paid ? new Date().toISOString() : null,
      });
      if (error) return setError(error.message);
    }
    startTransition(() => router.refresh());
  }

  // ---------- UI ----------
  const status = STATUS_LABEL[round.status];

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[hsl(var(--muted))]"
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-[hsl(var(--muted))] text-xs font-medium flex items-center justify-center">
            {round.round_number}
          </span>
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              งวดที่ {round.round_number}
              <span className={`text-xs rounded px-1.5 py-0.5 ${status.cls}`}>
                {status.text}
              </span>
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {formatDate(round.due_date)}
              {round.scheduled_open_at &&
                round.status === "pending" &&
                round.round_number > 1 &&
                ` · ⏰ ${new Date(round.scheduled_open_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}
              {winnerName && ` · ${winnerName} เปียได้`}
              {round.location && ` · 📍 ${round.location}`}
            </div>
          </div>
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="border-t p-4 space-y-5">
          {error && (
            <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
          )}

          {/* คำนวณเงิน */}
          {computation && round.winner_membership_id && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md bg-[hsl(var(--muted))] p-3">
              <Stat
                label="ผู้ชนะรับสุทธิ"
                value={formatTHB(computation.winnerReceives)}
                highlight
              />
              <Stat
                label="ลูกแชร์ (ยังไม่เปีย) จ่าย"
                value={formatTHB(computation.payByUnwon)}
              />
              <Stat
                label="ท้าวจ่าย"
                value={formatTHB(computation.payByDealer)}
              />
              {bidType !== "none" && (
                <Stat
                  label="ดอกที่ชนะ"
                  value={formatTHB(computation.winningBid)}
                />
              )}
            </div>
          )}

          {/* ข้อมูลรอบ — ทุกคนเห็น, owner แก้ได้ */}
          <RoundInfoSection
            round={round}
            isOwner={isOwner}
            onSet={setLocationMeal}
          />

          {/* งวด 1: note ว่าท้าวรับเงินก้อนอัตโนมัติ */}
          {isFirstRound && round.status === "pending" && (
            <div className="rounded-md border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.05)] p-3 text-sm">
              🎯 <span className="font-medium">งวดที่ 1</span> — ท้าวแชร์รับเงินก้อนอัตโนมัติ ไม่มีการประมูล
            </div>
          )}

          {/* Bidding (sealed) */}
          {!isFirstRound &&
            bidType !== "none" &&
            (round.status === "open_bidding" ||
              round.status === "tiebreak") && (
              <BiddingSection
                bids={bids}
                members={members}
                eligibleBidders={eligibleBidders}
                myMembershipId={myMembershipId}
                canIBid={canIBid}
                myBid={myBid}
                memberAmount={memberAmount}
                bidStep={bidStep}
                onPlaceBid={placeBid}
                tiebreakIteration={round.tiebreak_iteration}
                isOwner={isOwner}
                isTiebreak={round.status === "tiebreak"}
                bidClosesAt={round.bid_closes_at}
              />
            )}

          {/* Reveal section หลังปิดประมูล */}
          {!isFirstRound &&
            bidType !== "none" &&
            (round.status === "closed" || round.status === "completed") &&
            allBids.length > 0 && (
              <BidRevealSection
                allBids={allBids}
                members={members}
                winnerId={round.winner_membership_id}
                finalIteration={round.tiebreak_iteration}
              />
            )}

          {/* "ไม่มีดอก" → owner pick winner manually (ยกเว้นงวด 1) */}
          {!isFirstRound &&
            bidType === "none" &&
            round.status === "closed" &&
            !round.winner_membership_id &&
            isOwner && (
              <ManualWinnerPicker
                eligibleBidders={eligibleBidders}
                onPick={manualSelectWinner}
              />
            )}

          {/* Owner controls */}
          {isOwner && (
            <OwnerControls
              status={round.status}
              bidType={bidType}
              isFirstRound={isFirstRound}
              hasWinner={!!round.winner_membership_id}
              onOpen={openBidding}
              onClose={closeBidding}
              onComplete={markComplete}
              onReopen={reopenRound}
              pending={pending}
            />
          )}

          {/* Payment checklist หลังมีผู้ชนะ */}
          {round.winner_membership_id &&
            (round.status === "closed" || round.status === "completed") && (
              <PaymentChecklist
                round={round}
                members={members}
                payments={payments}
                isOwner={isOwner}
                onToggle={togglePayment}
              />
            )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
      <div
        className={`text-sm tabular-nums ${
          highlight ? "font-semibold text-[hsl(var(--primary))]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function RoundInfoSection({
  round,
  isOwner,
  onSet,
}: {
  round: Round;
  isOwner: boolean;
  onSet: (
    place: PickedPlace,
    meal: "dealer" | "split" | "none" | null,
    scheduledOpenAt: string | null,
  ) => void;
}) {
  const isFirstRound = round.round_number === 1;
  const [editing, setEditing] = useState(false);
  const [place, setPlace] = useState<PickedPlace>({
    name: round.location,
    placeId: round.location_place_id,
    address: round.location_address,
    lat: round.location_lat,
    lng: round.location_lng,
    url: round.location_url,
  });
  const [meal, setMeal] = useState<"dealer" | "split" | "none" | "">(
    round.meal_payment_mode ?? "",
  );
  const [scheduled, setScheduled] = useState<string>(
    isoToLocalInput(round.scheduled_open_at),
  );

  const mapHref =
    round.location_url ??
    (round.location_place_id
      ? `https://www.google.com/maps/place/?q=place_id:${round.location_place_id}`
      : round.location
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(round.location)}`
        : null);

  if (!isOwner || !editing) {
    return (
      <div className="rounded-md border p-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[hsl(var(--muted-foreground))] text-xs">
            ข้อมูลรอบ
          </span>
          {isOwner && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-[hsl(var(--primary))]"
            >
              แก้ไข
            </button>
          )}
        </div>
        <div>
          <span className="text-[hsl(var(--muted-foreground))]">สถานที่:</span>{" "}
          {round.location ? (
            <>
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[hsl(var(--primary))] hover:underline"
                >
                  📍 {round.location}
                </a>
              ) : (
                <>📍 {round.location}</>
              )}
              {round.location_address && (
                <div className="text-xs text-[hsl(var(--muted-foreground))] ml-5">
                  {round.location_address}
                </div>
              )}
            </>
          ) : (
            <span className="text-[hsl(var(--muted-foreground))]">
              — ยังไม่ระบุ —
            </span>
          )}
        </div>
        <div>
          <span className="text-[hsl(var(--muted-foreground))]">มื้อกิน:</span>{" "}
          {round.meal_payment_mode === "dealer"
            ? "ท้าวจ่าย"
            : round.meal_payment_mode === "split"
              ? "หารเท่า"
              : round.meal_payment_mode === "none"
                ? "ไม่มีมื้อ"
                : "ยังไม่ระบุ"}
        </div>
        {!isFirstRound && (
          <div>
            <span className="text-[hsl(var(--muted-foreground))]">
              เปิดประมูล:
            </span>{" "}
            {round.scheduled_open_at ? (
              <>
                {formatDate(round.scheduled_open_at)}{" "}
                {new Date(round.scheduled_open_at).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  (อัตโนมัติ)
                </span>
              </>
            ) : (
              <span className="text-[hsl(var(--muted-foreground))]">
                — ไม่ตั้งเวลา (ท้าวเปิดเอง) —
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      {!isFirstRound && (
        <div>
          <label className="block text-xs font-medium mb-1">
            วัน-เวลาเปิดประมูลอัตโนมัติ
          </label>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className="flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm"
            />
            {scheduled && (
              <button
                type="button"
                onClick={() => setScheduled("")}
                className="rounded-md border px-2 text-xs"
                title="ลบเวลาเปิดอัตโนมัติ"
              >
                ✕
              </button>
            )}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            ถ้าตั้งเวลาไว้: ระบบเปิดประมูลอัตโนมัติเมื่อมีคนเข้าหน้าวงหลังถึงเวลา
          </p>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium mb-1">สถานที่ (ร้าน)</label>
        <RestaurantPicker
          initialName={round.location ?? ""}
          onChange={setPlace}
        />
        {place.address && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            ✓ เลือกแล้ว: {place.address}
          </p>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">การจ่ายมื้อกิน</label>
        <select
          value={meal}
          onChange={(e) =>
            setMeal(e.target.value as "dealer" | "split" | "none" | "")
          }
          className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">— ยังไม่ระบุ —</option>
          <option value="dealer">ท้าวจ่าย</option>
          <option value="split">หารเท่ากัน</option>
          <option value="none">ไม่มีมื้อ</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            onSet(
              place.name?.trim() ? place : EMPTY_PLACE,
              meal === "" ? null : meal,
              localInputToIso(scheduled),
            );
            setEditing(false);
          }}
          className="rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-3 py-1.5 text-xs font-medium"
        >
          บันทึก
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function BiddingSection({
  bids,
  members,
  eligibleBidders,
  myMembershipId,
  canIBid,
  myBid,
  memberAmount,
  bidStep,
  onPlaceBid,
  tiebreakIteration,
  isOwner,
  isTiebreak,
  bidClosesAt,
}: {
  bids: Bid[];
  members: Member[];
  eligibleBidders: Member[];
  myMembershipId: string | null;
  canIBid: boolean;
  myBid: Bid | undefined;
  memberAmount: number;
  bidStep: number;
  onPlaceBid: (amount: number) => void;
  tiebreakIteration: number;
  isOwner: boolean;
  isTiebreak: boolean;
  bidClosesAt: string | null;
}) {
  const [bidValue, setBidValue] = useState<string>(
    myBid ? String(myBid.amount) : String(bidStep),
  );

  const myMember = members.find((m) => m.id === myMembershipId);
  const submittedCount = eligibleBidders.filter((m) =>
    bids.some((b) => b.membership_id === m.id),
  ).length;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium">
          🔒 การประมูล (sealed)
          {tiebreakIteration > 0 &&
            ` — แก้เสมอครั้งที่ ${tiebreakIteration}`}
        </div>
        <Countdown closesAt={bidClosesAt} />
      </div>

      <div className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.5)] rounded px-2 py-1.5">
        💡 ดอกของแต่ละคนถูกซ่อนจนกว่าท้าวจะปิดประมูล
        {isTiebreak &&
          " · เฉพาะผู้ที่เสมอเท่านั้นเปียได้ใน 10 นาทีนี้"}
      </div>

      {/* สถานะใครส่งแล้ว/ยัง — ไม่โชว์จำนวน */}
      <div className="space-y-1 text-sm">
        <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">
          สถานะ ({submittedCount}/{eligibleBidders.length} ส่งดอกแล้ว)
        </div>
        {eligibleBidders.length === 0 ? (
          <div className="text-[hsl(var(--muted-foreground))] text-xs">
            ไม่มีผู้มีสิทธิ์ประมูล
          </div>
        ) : (
          eligibleBidders.map((m) => {
            const submitted = bids.some((x) => x.membership_id === m.id);
            const mine = m.id === myMembershipId;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded px-2 py-1 bg-[hsl(var(--muted)/0.4)]"
              >
                <span className="flex items-center gap-2">
                  {m.display_name}
                  {m.role === "owner" && (
                    <span className="text-xs rounded bg-[hsl(var(--muted))] px-1.5 py-0.5">
                      ท้าว
                    </span>
                  )}
                  {mine && (
                    <span className="text-xs rounded bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] px-1.5 py-0.5">
                      คุณ
                    </span>
                  )}
                </span>
                <span className="text-xs">
                  {submitted ? (
                    <span className="text-emerald-700">
                      ✓ {mine ? `ส่งแล้ว (${formatTHB(myBid?.amount ?? 0)})` : "ส่งแล้ว"}
                    </span>
                  ) : (
                    <span className="text-[hsl(var(--muted-foreground))]">
                      ⏳ รอ
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* My bid form */}
      {canIBid && myMember && (
        <div className="rounded border-2 border-[hsl(var(--primary)/0.3)] p-3 space-y-2">
          <div className="text-sm font-medium">ใส่ดอกของคุณ (ลับ)</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const v = Math.max(bidStep, parseFloat(bidValue || "0") - bidStep);
                setBidValue(String(v));
              }}
              className="rounded border w-9 h-9 text-lg"
            >
              −
            </button>
            <input
              type="number"
              step={bidStep}
              min={bidStep}
              max={memberAmount - bidStep}
              value={bidValue}
              onChange={(e) => setBidValue(e.target.value)}
              className="flex-1 rounded-md border bg-transparent px-3 py-2 text-base font-mono text-center tabular-nums"
            />
            <button
              onClick={() => {
                const v = Math.min(
                  memberAmount - bidStep,
                  parseFloat(bidValue || "0") + bidStep,
                );
                setBidValue(String(v));
              }}
              className="rounded border w-9 h-9 text-lg"
            >
              +
            </button>
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            step ละ {formatTHB(bidStep)} · สูงสุด {formatTHB(memberAmount - bidStep)}
          </div>
          <button
            onClick={() => onPlaceBid(parseFloat(bidValue))}
            className="w-full rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-2 text-sm font-medium"
          >
            {myBid ? `อัปเดตดอก (เดิม ${formatTHB(myBid.amount)})` : "ส่งดอก"}
          </button>
        </div>
      )}

      {!canIBid && !isOwner && (
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          คุณไม่มีสิทธิ์ประมูลรอบนี้ (เคยเปียแล้ว หรือไม่ได้อยู่ในรายการ)
        </div>
      )}
    </div>
  );
}

function BidRevealSection({
  allBids,
  members,
  winnerId,
  finalIteration,
}: {
  allBids: Bid[];
  members: Member[];
  winnerId: string | null;
  finalIteration: number;
}) {
  // จัดกลุ่ม bids ตาม iteration เรียงน้อย → มาก
  const iterations = Array.from(
    new Set(allBids.map((b) => b.tiebreak_iteration)),
  ).sort((a, b) => a - b);

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="text-sm font-medium">📊 สรุปการประมูล (เปิดเผย)</div>
      {iterations.map((iter) => {
        const itBids = allBids
          .filter((b) => b.tiebreak_iteration === iter)
          .sort((a, b) => b.amount - a.amount);
        const isFinal = iter === finalIteration;
        return (
          <div key={iter} className="space-y-1">
            <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              {iter === 0 ? "รอบประมูลปกติ" : `แก้เสมอครั้งที่ ${iter}`}
              {isFinal && " (รอบสุดท้าย)"}
            </div>
            <div className="space-y-1">
              {itBids.map((b) => {
                const m = members.find((x) => x.id === b.membership_id);
                const isWinner = isFinal && b.membership_id === winnerId;
                return (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                      isWinner
                        ? "bg-emerald-50 border border-emerald-300"
                        : "bg-[hsl(var(--muted)/0.4)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isWinner && <span>🏆</span>}
                      <span className={isWinner ? "font-medium" : ""}>
                        {m?.display_name ?? "—"}
                      </span>
                      {m?.role === "owner" && (
                        <span className="text-xs rounded bg-[hsl(var(--muted))] px-1.5 py-0.5">
                          ท้าว
                        </span>
                      )}
                    </span>
                    <span
                      className={`tabular-nums ${
                        isWinner ? "font-semibold text-emerald-700" : ""
                      }`}
                    >
                      {formatTHB(b.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Countdown({ closesAt }: { closesAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!closesAt || now === null) return null;
  const remaining = Math.max(0, new Date(closesAt).getTime() - now);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const expired = remaining === 0;
  return (
    <span
      className={`text-xs tabular-nums rounded px-2 py-1 ${
        expired
          ? "bg-red-100 text-red-700"
          : remaining < 60000
            ? "bg-orange-100 text-orange-800"
            : "bg-[hsl(var(--muted))]"
      }`}
    >
      ⏱ {expired ? "หมดเวลา" : `เหลือ ${m}:${String(s).padStart(2, "0")}`}
    </span>
  );
}

function ManualWinnerPicker({
  eligibleBidders,
  onPick,
}: {
  eligibleBidders: Member[];
  onPick: (id: string) => void;
}) {
  const [picked, setPicked] = useState("");
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-sm font-medium">เลือกผู้ชนะรอบนี้</div>
      <select
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
      >
        <option value="">— เลือก —</option>
        {eligibleBidders.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>
      <button
        disabled={!picked}
        onClick={() => onPick(picked)}
        className="rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        บันทึกผู้ชนะ
      </button>
    </div>
  );
}

function OwnerControls({
  status,
  bidType,
  isFirstRound,
  hasWinner,
  onOpen,
  onClose,
  onComplete,
  onReopen,
  pending,
}: {
  status: RoundStatus;
  bidType: Mode;
  isFirstRound: boolean;
  hasWinner: boolean;
  onOpen: () => void;
  onClose: () => void;
  onComplete: () => void;
  onReopen: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t">
      {status === "pending" && (
        <button
          disabled={pending}
          onClick={onOpen}
          className="rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-3 py-1.5 text-xs font-medium"
        >
          {isFirstRound
            ? "ปิดงวด (ท้าวรับเงินก้อน)"
            : bidType === "none"
              ? "เปิดรอบ (เลือกผู้ชนะ)"
              : "เปิดประมูล"}
        </button>
      )}
      {(status === "open_bidding" || status === "tiebreak") && (
        <button
          disabled={pending}
          onClick={onClose}
          className="rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          title="ถ้าเสมอจะเข้าสู่ประมูลแก้เสมอ 10 นาทีอัตโนมัติ"
        >
          ปิดประมูล (สรุปผู้ชนะ)
        </button>
      )}
      {status === "closed" && hasWinner && (
        <>
          <button
            disabled={pending}
            onClick={onComplete}
            className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium"
          >
            ปิดงวด (เสร็จสิ้น)
          </button>
          <button
            disabled={pending}
            onClick={onReopen}
            className="rounded-md border px-3 py-1.5 text-xs"
          >
            กลับไป "ยังไม่เริ่ม"
          </button>
        </>
      )}
      {status === "completed" && (
        <button
          disabled={pending}
          onClick={onReopen}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          เปิดงวดใหม่ (แก้ไข)
        </button>
      )}
    </div>
  );
}

function PaymentChecklist({
  round,
  members,
  payments,
  isOwner,
  onToggle,
}: {
  round: Round;
  members: Member[];
  payments: Payment[];
  isOwner: boolean;
  onToggle: (membershipId: string, paid: boolean) => void;
}) {
  // ทุกคนยกเว้นผู้ชนะ ต้องจ่าย
  const payers = members.filter((m) => m.id !== round.winner_membership_id);
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-sm font-medium">สถานะการจ่ายเงิน</div>
      <div className="space-y-1.5">
        {payers.map((m) => {
          const p = payments.find((x) => x.membership_id === m.id);
          const paid = !!p?.paid;
          return (
            <label
              key={m.id}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={paid}
                disabled={!isOwner}
                onChange={(e) => onToggle(m.id, e.target.checked)}
                className="h-4 w-4"
              />
              <span className={paid ? "" : "text-[hsl(var(--muted-foreground))]"}>
                {m.display_name}
                {m.role === "owner" && " (ท้าว)"}
                {paid ? " ✓ จ่ายแล้ว" : " — ยังไม่จ่าย"}
              </span>
            </label>
          );
        })}
      </div>
      {!isOwner && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          เฉพาะท้าวอัปเดตสถานะการจ่ายได้
        </p>
      )}
    </div>
  );
}
