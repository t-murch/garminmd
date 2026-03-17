"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorBanner } from "@/components/ui/error-banner";

interface GarminConnectFormProps {
  connected: boolean;
  onConnected: () => void;
}

export function GarminConnectForm({
  connected,
  onConnected,
}: GarminConnectFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/garmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to connect to Garmin");
      }

      setConnectedEmail(email);
      setPassword("");
      onConnected();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect to Garmin",
      );
    } finally {
      setLoading(false);
    }
  }

  if (connected && connectedEmail) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          Connected as <span className="font-medium text-foreground">{connectedEmail}</span>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        GarminMD uses the same authentication method as the Garmin Connect mobile
        app. Your credentials are encrypted and stored securely.
      </p>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="garmin-email">Garmin Email</Label>
        <Input
          id="garmin-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="garmin-password">Password</Label>
        <Input
          id="garmin-password"
          type="password"
          placeholder="Your Garmin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <Button type="submit" disabled={loading || !email || !password}>
        {loading ? (
          <>
            <LoadingSpinner className="mr-2" />
            Connecting...
          </>
        ) : (
          "Connect to Garmin"
        )}
      </Button>
    </form>
  );
}
