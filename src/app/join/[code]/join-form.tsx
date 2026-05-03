"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function JoinForm({
  groupId,
  userId,
}: {
  groupId: string;
  userId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("memberships").insert({
      group_id: groupId,
      user_id: userId,
      display_name: name.trim(),
      role: "member",
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(`/groups/${groupId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1.5">
          ชื่อที่จะแสดงในวง
        </label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ตูน"
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
        />
      </div>
      {error && (
        <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="w-full rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "กำลังเข้าร่วม..." : "เข้าร่วมวง"}
      </button>
    </form>
  );
}
