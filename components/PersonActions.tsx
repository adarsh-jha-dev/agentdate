"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Re-renders the server page every few seconds while a person is still being processed.
export function AutoRefresh({ everyMs = 3000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}

export function RetryAnalysis({ personId }: { personId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}/reanalyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm transition hover:border-muted/40 disabled:opacity-50"
      >
        {busy ? "Agent re-reading… (1–2 min)" : "Re-run analysis"}
      </button>
      {error && <span className="text-sm text-bad">{error}</span>}
    </span>
  );
}
