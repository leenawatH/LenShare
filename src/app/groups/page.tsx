import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatTHB, formatDate } from "@/lib/utils";

const FREQ_LABEL: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
};

const TYPE_LABEL: Record<string, string> = {
  none: "ไม่มีดอก",
  deduct: "ดอกหัก",
  follow: "ดอกตาม",
};

export default async function GroupsListPage() {
  const supabase = await createClient();
  const { data: groups, error } = await supabase
    .from("share_groups")
    .select(
      "id, name, member_amount, dealer_amount, frequency, total_rounds, start_date, bid_type, owner_id",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">วงแชร์ของฉัน</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            วงทั้งหมดที่คุณเป็นท้าวหรือเป็นลูกแชร์
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/join"
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            เข้าร่วมวง
          </Link>
          <Link
            href="/groups/new"
            className="rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-4 py-2 text-sm font-medium"
          >
            + สร้างวงใหม่
          </Link>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[hsl(var(--destructive))]">
          เกิดข้อผิดพลาด: {error.message}
        </p>
      )}

      {(!groups || groups.length === 0) && !error && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
          ยังไม่มีวงแชร์ — กด "สร้างวงใหม่" หรือ "เข้าร่วมวง"
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {groups?.map((g) => (
          <Link
            key={g.id}
            href={`/groups/${g.id}`}
            className="rounded-lg border p-4 hover:bg-[hsl(var(--muted))] transition-colors"
          >
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{g.name}</h3>
              <span className="text-xs rounded-full bg-[hsl(var(--muted))] px-2 py-0.5">
                {TYPE_LABEL[g.bid_type] ?? g.bid_type}
              </span>
            </div>
            <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))] space-y-0.5">
              <div>เงินสมาชิก/งวด: {formatTHB(Number(g.member_amount))}</div>
              <div>
                {FREQ_LABEL[g.frequency]} · {g.total_rounds} งวด
              </div>
              <div>เริ่ม {formatDate(g.start_date)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
