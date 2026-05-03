"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    router.push(`/join/${c}`);
  }

  return (
    <div className="max-w-md mx-auto space-y-6 py-10 px-4">
      <div>
        <h1 className="text-2xl font-bold">เข้าร่วมวงแชร์</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          กรอก invite code ที่ได้จากท้าวแชร์
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="เช่น A1B2C3D4"
          className="w-full rounded-md border bg-transparent px-3 py-2 text-base font-mono uppercase tracking-wider"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-2 text-sm font-medium"
        >
          ค้นหาวง
        </button>
      </form>
    </div>
  );
}
