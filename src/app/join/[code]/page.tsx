import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JoinForm } from "./join-form";
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

export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/join/${code}`);
  }

  const { data, error } = await supabase.rpc("find_group_by_invite", { code });
  const group = Array.isArray(data) ? data[0] : null;
  if (error || !group) notFound();

  // เช็คว่าเป็นสมาชิกอยู่แล้วมั้ย
  const { data: existing } = await supabase
    .from("memberships")
    .select("id")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    redirect(`/groups/${group.id}`);
  }

  return (
    <div className="max-w-md mx-auto space-y-6 py-10 px-4">
      <div>
        <h1 className="text-2xl font-bold">เข้าร่วมวง</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          คุณได้รับเชิญเข้าร่วมวงแชร์
        </p>
      </div>
      <div className="rounded-lg border p-4 space-y-1.5 bg-[hsl(var(--muted)/0.3)]">
        <div className="text-lg font-semibold">{group.name}</div>
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          ท้าวแชร์: {group.owner_display}
        </div>
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          {TYPE_LABEL[group.bid_type]} · {FREQ_LABEL[group.frequency]} ·{" "}
          {group.total_rounds} งวด
        </div>
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          เงินสมาชิก/งวด {formatTHB(Number(group.member_amount))}
        </div>
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          เริ่ม {formatDate(group.start_date)}
        </div>
      </div>
      <JoinForm groupId={group.id} userId={user.id} />
    </div>
  );
}
