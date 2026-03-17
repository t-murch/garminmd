"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";

interface GarminSettingsFormProps {
  connected: boolean;
}

export function GarminSettingsForm({ connected }: GarminSettingsFormProps) {
  const [showForm, setShowForm] = useState(!connected);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/garmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to connect");
      }
      setSuccess(true);
      setPassword("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }

  if (!showForm) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {success
            ? "Credentials updated successfully."
            : "Your Garmin credentials are stored securely."}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
        >
          Update Credentials
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-garmin-email">Garmin Email</Label>
        <Input
          id="settings-garmin-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-garmin-password">Password</Label>
        <Input
          id="settings-garmin-password"
          type="password"
          placeholder="Your Garmin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading || !email || !password}>
          {loading ? "Connecting..." : "Save"}
        </Button>
        {connected && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowForm(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
