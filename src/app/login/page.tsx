"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/groups";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">LenShare</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">เข้าสู่ระบบ</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">อีเมล</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">รหัสผ่าน</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
          />
        </div>
        {error && (
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
      <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
        ยังไม่มีบัญชี?{" "}
        <Link
          href={`/signup${next !== "/groups" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-[hsl(var(--primary))] underline"
        >
          สมัครสมาชิก
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-sm text-[hsl(var(--muted-foreground))]">กำลังโหลด...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
