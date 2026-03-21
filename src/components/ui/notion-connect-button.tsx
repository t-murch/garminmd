"use client";

import { useState } from "react";
import { generateNotionAuthUrl } from "@/lib/auth/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface NotionConnectButtonProps {
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  children: React.ReactNode;
}

export function NotionConnectButton({
  variant = "default",
  size = "default",
  className,
  children,
}: NotionConnectButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const url = await generateNotionAuthUrl();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleClick}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {loading ? "Connecting..." : children}
    </button>
  );
}
