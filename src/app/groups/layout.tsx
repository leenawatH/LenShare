import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GroupsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const name = profile?.display_name ?? user.email?.split("@")[0] ?? "ผู้ใช้";

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/groups" className="text-lg font-bold">
            LenShare
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[hsl(var(--muted-foreground))]">{name}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
