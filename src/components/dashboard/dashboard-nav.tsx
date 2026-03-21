"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";

export function DashboardNav() {
  const router = useRouter();

  async function handleLogout() {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        toast.error("Logout failed. Try again.");
        return;
      }
      router.push("/login");
    } catch {
      toast.error("Logout failed. Check your connection.");
    }
  }

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="text-lg font-bold tracking-tight">
            GarminMD
          </a>
          <nav className="flex items-center gap-1">
            <a
              href="/dashboard"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Dashboard
            </a>
            <a
              href="/dashboard/settings"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Settings
            </a>
          </nav>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
