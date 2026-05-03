"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  display_name: string;
  role: "owner" | "member";
};

type Approval = {
  group_id: string;
  membership_id: string;
};

export function DeleteGroupSection({
  groupId,
  groupName,
  isOwner,
  myMembershipId,
  members,
  allRoundsCompleted,
  deletionRequestedAt,
  approvals,
}: {
  groupId: string;
  groupName: string;
  isOwner: boolean;
  myMembershipId: string | null;
  members: Member[];
  allRoundsCompleted: boolean;
  deletionRequestedAt: string | null;
  approvals: Approval[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const nonOwnerMembers = members.filter((m) => m.role === "member");
  const approvedIds = new Set(approvals.map((a) => a.membership_id));
  const approvedCount = nonOwnerMembers.filter((m) =>
    approvedIds.has(m.id),
  ).length;
  const totalNeeded = nonOwnerMembers.length;
  const allApproved = totalNeeded === 0 || approvedCount >= totalNeeded;
  const myApproval = myMembershipId ? approvedIds.has(myMembershipId) : false;
  const isMember = !isOwner && !!myMembershipId;

  async function actuallyDelete() {
    setError(null);
    const { error } = await supabase
      .from("share_groups")
      .delete()
      .eq("id", groupId);
    if (error) return setError(error.message);
    router.push("/groups");
    startTransition(() => router.refresh());
  }

  async function requestDeletion() {
    setError(null);
    const { error } = await supabase
      .from("share_groups")
      .update({ deletion_requested_at: new Date().toISOString() })
      .eq("id", groupId);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function cancelDeletionRequest() {
    setError(null);
    const { error: e1 } = await supabase
      .from("deletion_approvals")
      .delete()
      .eq("group_id", groupId);
    if (e1) return setError(e1.message);
    const { error: e2 } = await supabase
      .from("share_groups")
      .update({ deletion_requested_at: null })
      .eq("id", groupId);
    if (e2) return setError(e2.message);
    startTransition(() => router.refresh());
  }

  async function memberApprove() {
    setError(null);
    if (!myMembershipId) return;
    const { error } = await supabase.from("deletion_approvals").insert({
      group_id: groupId,
      membership_id: myMembershipId,
    });
    if (error && !/duplicate/i.test(error.message))
      return setError(error.message);
    startTransition(() => router.refresh());
  }

  async function memberWithdraw() {
    setError(null);
    if (!myMembershipId) return;
    const { error } = await supabase
      .from("deletion_approvals")
      .delete()
      .eq("group_id", groupId)
      .eq("membership_id", myMembershipId);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  // ===== สมาชิก: เห็น banner ขออนุมัติ =====
  if (isMember && deletionRequestedAt) {
    return (
      <section className="rounded-lg border border-orange-300 bg-orange-50 p-4 space-y-2">
        <div className="text-sm font-semibold text-orange-800">
          ⚠ ท้าวขออนุมัติลบวงนี้
        </div>
        <p className="text-xs text-orange-700">
          วงยังไม่จบทุกงวด — ต้องได้รับอนุมัติจากสมาชิกทุกคนก่อนลบ (
          {approvedCount}/{totalNeeded} อนุมัติแล้ว)
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {myApproval ? (
          <button
            onClick={memberWithdraw}
            disabled={pending}
            className="rounded-md border border-orange-400 bg-white px-3 py-1.5 text-xs text-orange-800 disabled:opacity-50"
          >
            ✓ คุณอนุมัติแล้ว — กดเพื่อถอน
          </button>
        ) : (
          <button
            onClick={memberApprove}
            disabled={pending}
            className="rounded-md bg-orange-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            อนุมัติให้ลบวง
          </button>
        )}
      </section>
    );
  }

  // ===== ท้าวเท่านั้น (ส่วน Danger zone) =====
  if (!isOwner) return null;

  return (
    <>
      <section className="rounded-lg border border-red-300 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-red-700">⚠ Danger zone</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            ลบวงและข้อมูลทั้งหมดถาวร — ไม่สามารถกู้คืนได้
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {allRoundsCompleted ? (
          <div className="space-y-2">
            <p className="text-xs text-emerald-700">
              ✓ วงนี้จบทุกงวดแล้ว — ท้าวลบได้ทันที
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
              className="rounded-md bg-red-600 text-white px-3 py-1.5 text-xs font-medium"
            >
              ลบวงนี้
            </button>
          </div>
        ) : !deletionRequestedAt ? (
          <div className="space-y-2">
            <p className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1.5 border border-orange-200">
              ⚠ วงยังไม่จบทุกงวด — ต้องขออนุมัติจากสมาชิกทุกคน ({totalNeeded} คน)
              ก่อนจึงจะลบได้
            </p>
            <button
              onClick={requestDeletion}
              disabled={pending || totalNeeded === 0}
              className="rounded-md border border-red-400 bg-white px-3 py-1.5 text-xs text-red-700 font-medium disabled:opacity-50"
              title={totalNeeded === 0 ? "ยังไม่มีลูกแชร์ — ลบได้ทันที" : ""}
            >
              ขออนุมัติลบจากสมาชิก
            </button>
            {totalNeeded === 0 && (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
                className="ml-2 rounded-md bg-red-600 text-white px-3 py-1.5 text-xs font-medium"
              >
                ลบวงทันที (ไม่มีลูกแชร์)
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs">
              ขออนุมัติแล้ว — <strong>{approvedCount}/{totalNeeded}</strong>{" "}
              อนุมัติ
              {allApproved && (
                <span className="text-emerald-700"> ✓ ครบแล้ว</span>
              )}
            </p>
            <ul className="space-y-1 text-xs">
              {nonOwnerMembers.map((m) => {
                const ok = approvedIds.has(m.id);
                return (
                  <li
                    key={m.id}
                    className={`flex items-center gap-2 ${
                      ok ? "" : "text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    <span>{ok ? "✅" : "⏳"}</span>
                    <span>{m.display_name}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={pending || !allApproved}
                className="rounded-md bg-red-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {allApproved
                  ? "ลบวงทันที"
                  : `รออีก ${totalNeeded - approvedCount} คน`}
              </button>
              <button
                onClick={cancelDeletionRequest}
                disabled={pending}
                className="rounded-md border px-3 py-1.5 text-xs"
              >
                ยกเลิกคำขอ
              </button>
            </div>
          </div>
        )}
      </section>

      {confirmOpen && (
        <ConfirmDeleteModal
          groupName={groupName}
          pending={pending}
          onConfirm={async () => {
            setConfirmOpen(false);
            await actuallyDelete();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

function ConfirmDeleteModal({
  groupName,
  pending,
  onConfirm,
  onCancel,
}: {
  groupName: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === groupName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-lg bg-background border max-w-md w-full p-5 space-y-4 shadow-xl">
        <div>
          <h3 className="text-lg font-semibold text-red-700">
            ยืนยันการลบวง
          </h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            จะลบวง <strong>"{groupName}"</strong> และข้อมูลทั้งหมด
            (สมาชิก, รอบประมูล, การจ่ายเงิน) <strong>ถาวร</strong>
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">
            พิมพ์ชื่อวง <code className="text-red-700">{groupName}</code>{" "}
            เพื่อยืนยัน
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            autoFocus
            placeholder={groupName}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border px-4 py-2 text-sm"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || pending}
            className="rounded-md bg-red-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "กำลังลบ..." : "ลบวงถาวร"}
          </button>
        </div>
      </div>
    </div>
  );
}
