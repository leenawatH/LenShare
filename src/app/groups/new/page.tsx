"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Frequency = "daily" | "weekly" | "monthly";
type BidType = "none" | "deduct" | "follow";

const FREQ_DAYS: Record<Frequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const BID_TYPE_INFO: Record<BidType, { title: string; desc: string }> = {
  none: {
    title: "ไม่มีดอก",
    desc: "ทุกคนจ่ายเท่าๆ กัน ไม่มีการประมูลดอก",
  },
  deduct: {
    title: "ดอกหัก",
    desc: "หักดอกออกจากเงินที่ลูกแชร์จ่าย ผู้ชนะรับน้อยลง",
  },
  follow: {
    title: "ดอกตาม",
    desc: "ผู้ชนะรับเต็ม แล้วทยอยจ่ายดอกในงวดถัดๆ ไป",
  },
};

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bidType, setBidType] = useState<BidType>("deduct");
  const [memberAmount, setMemberAmount] = useState("1000");
  const [dealerAmount, setDealerAmount] = useState("1000");
  const [dealerCommission, setDealerCommission] = useState("0");
  const [dealerCanBid, setDealerCanBid] = useState(false);
  const [bidStep, setBidStep] = useState("10");
  const [bidWindowHours, setBidWindowHours] = useState("24");
  const [totalRounds, setTotalRounds] = useState("12");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [bidOpenTime, setBidOpenTime] = useState("09:00");
  const [ownerName, setOwnerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const totalRoundsNum = parseInt(totalRounds, 10);
    if (!Number.isFinite(totalRoundsNum) || totalRoundsNum < 2) {
      setError("จำนวนงวดต้องอย่างน้อย 2");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบใหม่");
      setLoading(false);
      return;
    }

    const { data: group, error: groupErr } = await supabase
      .from("share_groups")
      .insert({
        name: name.trim(),
        owner_id: user.id,
        bid_type: bidType,
        member_amount: parseFloat(memberAmount),
        dealer_amount: parseFloat(dealerAmount) || 0,
        dealer_commission: parseFloat(dealerCommission) || 0,
        dealer_can_bid: dealerCanBid,
        bid_step: parseFloat(bidStep) || 10,
        bid_window_hours: parseInt(bidWindowHours, 10) || 24,
        total_rounds: totalRoundsNum,
        frequency,
        start_date: startDate,
      })
      .select("id, invite_code")
      .single();

    if (groupErr || !group) {
      setError(groupErr?.message ?? "สร้างวงไม่สำเร็จ");
      setLoading(false);
      return;
    }

    const ownerDisplay =
      ownerName.trim() || user.email?.split("@")[0] || "ท้าวแชร์";

    const { error: memErr } = await supabase.from("memberships").insert({
      group_id: group.id,
      user_id: user.id,
      display_name: ownerDisplay,
      role: "owner",
    });
    if (memErr) {
      setError(memErr.message);
      setLoading(false);
      return;
    }

    const [hh, mm] = bidOpenTime.split(":").map((n) => parseInt(n, 10));
    const start = new Date(startDate);
    start.setHours(hh || 9, mm || 0, 0, 0);
    const days = FREQ_DAYS[frequency];
    const rounds = Array.from({ length: totalRoundsNum }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i * days);
      return {
        group_id: group.id,
        round_number: i + 1,
        due_date: d.toISOString().slice(0, 10),
        scheduled_open_at: d.toISOString(),
        status: "pending" as const,
      };
    });
    const { error: roundErr } = await supabase.from("rounds").insert(rounds);
    if (roundErr) {
      setError(roundErr.message);
      setLoading(false);
      return;
    }

    router.push(`/groups/${group.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">สร้างวงแชร์ใหม่</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          ตั้งค่าวง สมาชิกจะสมัครและเข้าร่วมผ่าน invite code หลังสร้างเสร็จ
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="ชื่อวง">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น แชร์เพื่อนสนิท"
            className="input"
          />
        </Field>

        <Field label="ชื่อท้าวแชร์ (ตัวคุณ)">
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="ปล่อยว่างจะใช้ชื่อจากอีเมล"
            className="input"
          />
        </Field>

        <Field label="ประเภทวง">
          <div className="grid grid-cols-3 gap-2">
            {(["none", "deduct", "follow"] as BidType[]).map((t) => (
              <ModeCard
                key={t}
                active={bidType === t}
                onClick={() => setBidType(t)}
                title={BID_TYPE_INFO[t].title}
                desc={BID_TYPE_INFO[t].desc}
              />
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="เงินสมาชิก/งวด (บาท)">
            <input
              type="number"
              required
              min="1"
              value={memberAmount}
              onChange={(e) => setMemberAmount(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="เงินท้าว/งวด (บาท)">
            <input
              type="number"
              min="0"
              value={dealerAmount}
              onChange={(e) => setDealerAmount(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="rounded-md border p-4 space-y-3 bg-[hsl(var(--muted)/0.3)]">
          <div className="text-sm font-medium">ตั้งค่าท้าวแชร์</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dealerCanBid}
              onChange={(e) => setDealerCanBid(e.target.checked)}
              className="h-4 w-4"
            />
            ท้าวประมูลร่วมกับลูกแชร์ได้
          </label>
          <Field label="ค่าท้าวพิเศษ/งวด (commission ที่หักจากผู้ชนะ)">
            <input
              type="number"
              min="0"
              value={dealerCommission}
              onChange={(e) => setDealerCommission(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        {bidType !== "none" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="step การประมูล (บาท)">
              <input
                type="number"
                required
                min="1"
                value={bidStep}
                onChange={(e) => setBidStep(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="ระยะเวลาประมูล (ชั่วโมง)">
              <input
                type="number"
                required
                min="1"
                value={bidWindowHours}
                onChange={(e) => setBidWindowHours(e.target.value)}
                className="input"
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="จำนวนงวด">
            <input
              type="number"
              required
              min="2"
              value={totalRounds}
              onChange={(e) => setTotalRounds(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="ความถี่">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="input"
            >
              <option value="daily">รายวัน</option>
              <option value="weekly">รายสัปดาห์</option>
              <option value="monthly">รายเดือน</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="วันเริ่มงวดแรก">
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="เวลาเปิดประมูลแต่ละรอบ">
            <input
              type="time"
              required
              value={bidOpenTime}
              onChange={(e) => setBidOpenTime(e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] -mt-3">
          แต่ละรอบจะถูกเปิดประมูลอัตโนมัติเมื่อถึงวัน-เวลาที่ตั้งไว้
          (เริ่มงวดแรก = วันเริ่ม, รอบถัดไปเลื่อนตามความถี่)
        </p>

        {error && (
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "กำลังสร้าง..." : "สร้างวงแชร์"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border px-4 py-2 text-sm"
          >
            ยกเลิก
          </button>
        </div>
      </form>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(var(--border));
          background: transparent;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        :global(.input:focus) {
          box-shadow: 0 0 0 2px hsl(var(--primary) / 0.4);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border p-3 transition-colors ${
        active
          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]"
          : "hover:bg-[hsl(var(--muted))]"
      }`}
    >
      <div className="font-medium text-sm">{title}</div>
      <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
        {desc}
      </div>
    </button>
  );
}
