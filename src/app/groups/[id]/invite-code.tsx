"use client";

import { useEffect, useState } from "react";

export function InviteCode({
  code,
  memberCount,
  expected,
}: {
  code: string;
  memberCount: number;
  expected: number;
}) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = `${origin}/join/${code}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  }

  return (
    <div className="rounded-lg border p-4 bg-[hsl(var(--primary)/0.05)] border-[hsl(var(--primary)/0.3)]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="text-sm font-medium">เชิญลูกแชร์เข้าร่วม</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            ต้องการลูกแชร์ {expected} คน · เข้าร่วมแล้ว {memberCount}/{expected}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="font-mono text-base px-3 py-1.5 rounded bg-background border tracking-wider">
            {code}
          </code>
          <button
            onClick={copyLink}
            className="text-xs rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-3 py-1.5 font-medium"
          >
            {copied ? "✓ คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </button>
        </div>
      </div>
      <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))] break-all">
        {link}
      </div>
    </div>
  );
}
