/**
 * คำนวณวงแชร์ — รองรับ 3 โหมด
 *  - "none"   : ไม่มีดอก
 *  - "deduct" : ดอกหัก    → ผู้ชนะรับ = (member - bid) × N + dealer_amount − dealer_commission
 *                            ที่ N = ลูกแชร์ที่ "ไม่ใช่ผู้ชนะ"
 *  - "follow" : ดอกตาม    → ผู้ชนะงวดนี้รับเต็ม (ไม่หักดอก)
 *                            งวดต่อๆ ไป ผู้ชนะจ่าย (member + ดอกที่ตัวเองเปีย) ทุกงวดที่เหลือ
 *                            ดอกถูกเพิ่มเข้า pot ของรอบนั้นๆ (ผู้ชนะรอบใหม่ได้รับเพิ่ม)
 *
 * สมมติฐาน:
 *  - ผู้ชนะ "ไม่จ่าย" งวดที่ตัวเองเปียได้
 *  - ลูกแชร์ที่ "เคยเปียแล้ว" จ่ายตามโหมด: deduct → ไม่มี carry; follow → carry ดอกตัวเอง
 *  - ท้าวจ่าย dealer_amount ทุกงวด (ไม่เกี่ยวว่าตัวเองเปียได้หรือไม่ใช่ ยกเว้นกรณีท้าวเปียได้และเป็นผู้ชนะงวดนั้น → ไม่จ่าย)
 *  - dealer_commission หักจากผู้ชนะ → เป็นรายรับของท้าว (ทุกงวด)
 */

export type Mode = "none" | "deduct" | "follow";

export interface MemberInput {
  membershipId: string;
  displayName: string;
  isOwner: boolean;
}

export interface RoundInput {
  roundNumber: number;
  winnerMembershipId: string | null;
  winningBid: number;
  status: "pending" | "open_bidding" | "tiebreak" | "closed" | "completed";
}

export interface RoundComputation {
  roundNumber: number;
  winnerMembershipId: string | null;
  winningBid: number;
  // จำนวนเงินที่แต่ละบทบาท "จ่าย" ในงวดนี้
  payByUnwon: number;       // ลูกแชร์ที่ยังไม่เปีย (ไม่ใช่ผู้ชนะงวดนี้)
  payByPastWinner: Record<string, number>; // ลูกแชร์ที่เคยเปีย → membershipId → จำนวน
  payByDealer: number;      // ท้าวจ่ายในงวดนี้
  // เงินที่ผู้ชนะงวดนี้รับสุทธิ (หลังหัก dealer_commission)
  winnerReceives: number;
  potGross: number;         // pot ก่อนหัก commission
}

export interface MemberSummary {
  membershipId: string;
  displayName: string;
  isOwner: boolean;
  totalPaid: number;
  totalReceived: number;
  net: number;
  hasWon: boolean;
  wonRound: number | null;
  wonBid: number;
}

interface ComputeOptions {
  members: MemberInput[];
  rounds: RoundInput[];
  memberAmount: number;
  dealerAmount: number;
  dealerCommission: number;
  dealerCanBid: boolean;
  mode: Mode;
}

/**
 * คำนวณ "งวดเดียว" จาก state ของลูกแชร์ที่เคยเปียไปแล้ว (พร้อมดอกของตัวเอง)
 */
export function computeRound(
  members: MemberInput[],
  round: RoundInput,
  pastWinners: Map<string, number>, // membershipId → bid ที่ตัวเองเคยเปีย
  memberAmount: number,
  dealerAmount: number,
  dealerCommission: number,
  dealerCanBid: boolean,
  mode: Mode,
): RoundComputation {
  const lukshare = members.filter((m) => !m.isOwner);
  const owner = members.find((m) => m.isOwner);
  const winnerId = round.winnerMembershipId;
  const winnerIsOwner = !!winnerId && owner?.membershipId === winnerId;
  const bid = Math.max(0, round.winningBid || 0);

  // ผู้จ่ายงวดนี้ = ทุกคน ยกเว้นผู้ชนะ
  const nonWinnerLukshare = lukshare.filter(
    (m) => m.membershipId !== winnerId,
  );

  const payByPastWinner: Record<string, number> = {};
  let potGross = 0;
  let payByUnwon = memberAmount;
  let payByDealer = dealerAmount;

  // ดอกหัก: ลูกแชร์ที่ไม่ใช่ผู้ชนะ จ่าย (member − bid). ท้าวจ่าย dealer_amount ตรงๆ
  if (mode === "deduct") {
    payByUnwon = Math.max(0, memberAmount - bid);
    for (const m of nonWinnerLukshare) {
      potGross += payByUnwon; // ทุกคนที่ไม่ใช่ผู้ชนะ จ่าย (member − bid) เท่ากันหมด
      // หมายเหตุ: deduct mode ไม่มี past-winner carry — ทุกคนจ่ายเท่ากันตาม (member - bid)
      if (pastWinners.has(m.membershipId)) {
        payByPastWinner[m.membershipId] = payByUnwon;
      }
    }
    if (!winnerIsOwner) {
      potGross += dealerAmount;
    } else {
      payByDealer = 0; // ท้าวเป็นผู้ชนะ → ไม่จ่าย
    }
  } else if (mode === "follow") {
    // ลูกแชร์ที่ยังไม่เปีย → จ่าย member_amount เต็ม
    // ลูกแชร์ที่เคยเปียแล้ว → จ่าย member_amount + bid_ของตัวเอง
    payByUnwon = memberAmount;
    for (const m of nonWinnerLukshare) {
      const ownBid = pastWinners.get(m.membershipId);
      if (ownBid !== undefined) {
        const amt = memberAmount + ownBid;
        payByPastWinner[m.membershipId] = amt;
        potGross += amt;
      } else {
        potGross += memberAmount;
      }
    }
    if (!winnerIsOwner) {
      potGross += dealerAmount;
    } else {
      payByDealer = 0;
    }
  } else {
    // none: ทุกคน (ไม่ใช่ผู้ชนะ) จ่าย member_amount; ท้าวจ่าย dealer_amount
    payByUnwon = memberAmount;
    for (const m of nonWinnerLukshare) {
      potGross += memberAmount;
      if (pastWinners.has(m.membershipId)) {
        payByPastWinner[m.membershipId] = memberAmount;
      }
    }
    if (!winnerIsOwner) {
      potGross += dealerAmount;
    } else {
      payByDealer = 0;
    }
  }

  const winnerReceives = winnerId !== null ? potGross - dealerCommission : 0;

  return {
    roundNumber: round.roundNumber,
    winnerMembershipId: winnerId,
    winningBid: bid,
    payByUnwon,
    payByPastWinner,
    payByDealer,
    winnerReceives,
    potGross,
  };
}

export function computeAllRounds(opts: ComputeOptions): RoundComputation[] {
  const sorted = [...opts.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const pastWinners = new Map<string, number>();
  const result: RoundComputation[] = [];
  for (const r of sorted) {
    const comp = computeRound(
      opts.members,
      r,
      pastWinners,
      opts.memberAmount,
      opts.dealerAmount,
      opts.dealerCommission,
      opts.dealerCanBid,
      opts.mode,
    );
    result.push(comp);
    if (r.status === "completed" && r.winnerMembershipId) {
      pastWinners.set(r.winnerMembershipId, comp.winningBid);
    }
  }
  return result;
}

export function summarize(opts: ComputeOptions): MemberSummary[] {
  const sorted = [...opts.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const pastWinners = new Map<string, number>();
  const summary = new Map<string, MemberSummary>();
  for (const m of opts.members) {
    summary.set(m.membershipId, {
      membershipId: m.membershipId,
      displayName: m.displayName,
      isOwner: m.isOwner,
      totalPaid: 0,
      totalReceived: 0,
      net: 0,
      hasWon: false,
      wonRound: null,
      wonBid: 0,
    });
  }
  const owner = opts.members.find((m) => m.isOwner);

  for (const r of sorted) {
    if (r.status !== "completed") continue;
    const comp = computeRound(
      opts.members,
      r,
      pastWinners,
      opts.memberAmount,
      opts.dealerAmount,
      opts.dealerCommission,
      opts.dealerCanBid,
      opts.mode,
    );

    // ลูกแชร์จ่าย
    for (const m of opts.members) {
      if (m.isOwner) continue;
      if (m.membershipId === r.winnerMembershipId) continue;
      const s = summary.get(m.membershipId)!;
      const carryAmt = comp.payByPastWinner[m.membershipId];
      s.totalPaid += carryAmt !== undefined ? carryAmt : comp.payByUnwon;
    }

    // ท้าวจ่าย
    if (owner && r.winnerMembershipId !== owner.membershipId) {
      const s = summary.get(owner.membershipId)!;
      s.totalPaid += comp.payByDealer;
    }

    // ผู้ชนะรับ
    if (r.winnerMembershipId) {
      const ws = summary.get(r.winnerMembershipId);
      if (ws) {
        ws.totalReceived += comp.winnerReceives;
        ws.hasWon = true;
        ws.wonRound = r.roundNumber;
        ws.wonBid = comp.winningBid;
      }
      pastWinners.set(r.winnerMembershipId, comp.winningBid);
    }

    // ท้าวรับ commission
    if (owner && r.winnerMembershipId) {
      const s = summary.get(owner.membershipId)!;
      s.totalReceived += opts.dealerCommission;
    }
  }

  for (const s of summary.values()) {
    s.net = s.totalReceived - s.totalPaid;
  }
  return Array.from(summary.values());
}

/**
 * Resolve รอบประมูล — รับ bids ของรอบ/iteration นั้น คืน winner หรือรายการเสมอ
 */
export function resolveBidding(
  bids: { membershipId: string; amount: number }[],
): { winnerId: string | null; tied: string[]; topAmount: number } {
  if (bids.length === 0) return { winnerId: null, tied: [], topAmount: 0 };
  const max = Math.max(...bids.map((b) => b.amount));
  const top = bids.filter((b) => b.amount === max);
  if (top.length === 1) {
    return { winnerId: top[0].membershipId, tied: [], topAmount: max };
  }
  return {
    winnerId: null,
    tied: top.map((b) => b.membershipId),
    topAmount: max,
  };
}
