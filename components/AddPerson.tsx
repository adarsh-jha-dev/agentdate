"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = "pending" | "scraping" | "analyzing" | "ready" | "failed";
type Progress = {
  status: Status;
  error: string | null;
  sources: { linkedin: boolean; instagram: boolean };
};
type StepState = "waiting" | "active" | "done" | "failed";

const POLL_MS = 1500;

export function AddPerson() {
  const router = useRouter();
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const startedAt = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkedinUrl, instagramUrl, ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      const data = await res.json();
      if (res.status === 400) {
        setFieldErrors(data.issues ?? {});
        return;
      }
      if (res.status === 409 && data.id) {
        if (data.status === "ready") return router.push(`/p/${data.id}`);
        return track(data.id);
      }
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      track(data.person.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function track(id: string) {
    startedAt.current = Date.now();
    setElapsed(0);
    setProgress({ status: "scraping", error: null, sources: { linkedin: false, instagram: false } });
    setPersonId(id);
  }

  useEffect(() => {
    if (!personId) return;
    let stop = false;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    const poll = async () => {
      while (!stop) {
        try {
          const res = await fetch(`/api/people/${personId}`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const next: Progress = { status: data.status, error: data.person.error, sources: data.sources };
            setProgress(next);
            if (next.status === "ready") {
              setTimeout(() => router.push(`/p/${personId}`), 700);
              return;
            }
            if (next.status === "failed") return;
          }
        } catch {
          // transient network error; keep polling
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    };
    poll();
    return () => {
      stop = true;
      clearInterval(tick);
    };
  }, [personId, router]);

  function reset() {
    setPersonId(null);
    setProgress(null);
  }

  if (progress) return <Stepper progress={progress} elapsed={elapsed} onReset={reset} />;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="LinkedIn profile"
        placeholder="https://www.linkedin.com/in/username"
        value={linkedinUrl}
        onChange={setLinkedinUrl}
        error={fieldErrors.linkedinUrl?.[0]}
        tone="li"
      />
      <Field
        label="Instagram profile"
        placeholder="https://www.instagram.com/username"
        value={instagramUrl}
        onChange={setInstagramUrl}
        error={fieldErrors.instagramUrl?.[0]}
        tone="ig"
      />
      <Field
        label="Name"
        hint="optional, taken from LinkedIn if empty"
        placeholder="Jane Doe"
        value={name}
        onChange={setName}
        error={fieldErrors.name?.[0]}
      />
      {formError && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{formError}</p>}
      <button
        type="submit"
        disabled={submitting || !linkedinUrl || !instagramUrl}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Starting…" : "Send in the agent"}
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </button>
    </form>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  tone?: "li" | "ig";
}) {
  const dot = props.tone === "li" ? "bg-li" : props.tone === "ig" ? "bg-ig" : "bg-muted";
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <span className={`size-2 rounded-full ${dot}`} />
        {props.label}
        {props.hint && <span className="font-normal text-muted">· {props.hint}</span>}
      </span>
      <input
        type={props.tone ? "url" : "text"}
        inputMode={props.tone ? "url" : "text"}
        autoComplete="off"
        spellCheck={false}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={!!props.error}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent-soft aria-[invalid=true]:border-bad"
      />
      {props.error && <span className="mt-1.5 block text-sm text-bad">{props.error}</span>}
    </label>
  );
}

function Stepper({ progress, elapsed, onReset }: { progress: Progress; elapsed: number; onReset: () => void }) {
  const { status, sources, error } = progress;
  const failed = status === "failed";
  const scrapeDone = status === "analyzing" || status === "ready";
  // Scrape errors are prefixed "linkedin: …" / "instagram: …"; analysis errors "analysis: …".
  const mentions = (key: string) => !!error?.toLowerCase().includes(`${key}:`);

  const scrapeState = (done: boolean, key: "linkedin" | "instagram"): StepState => {
    if (done || scrapeDone) return "done";
    if (!failed) return "active";
    if (error?.startsWith("analysis")) return "done";
    // Unattributed errors (e.g. missing config) fail both steps.
    return mentions(key) || (!mentions("linkedin") && !mentions("instagram")) ? "failed" : "waiting";
  };

  const steps: { label: string; detail: string; state: StepState }[] = [
    { label: "Scraping LinkedIn", detail: "Career, education, skills", state: scrapeState(sources.linkedin, "linkedin") },
    { label: "Scraping Instagram", detail: "Bio and recent posts", state: scrapeState(sources.instagram, "instagram") },
    {
      label: "Agent reading",
      detail: "Building a profile from quoted evidence",
      state: status === "analyzing" ? "active" : status === "ready" ? "done" : failed && error?.startsWith("analysis") ? "failed" : "waiting",
    },
    { label: "Profile ready", detail: "Opening the profile", state: status === "ready" ? "done" : "waiting" },
  ];

  return (
    <div className="animate-rise">
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <StepIcon state={s.state} />
              {i < steps.length - 1 && (
                <span className={`my-1 w-px flex-1 ${s.state === "done" ? "bg-ok/50" : "bg-line"}`} />
              )}
            </div>
            <div className="pb-6 pt-1">
              <p className={`font-medium ${s.state === "waiting" ? "text-muted" : ""}`}>{s.label}</p>
              <p className="text-sm text-muted">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {failed ? (
        <div className="mt-2 space-y-3">
          <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error ?? "Something went wrong."}</p>
          <button onClick={onReset} className="text-sm font-medium text-accent hover:underline">
            ← Try again
          </button>
        </div>
      ) : (
        <p className="mt-2 font-mono text-xs text-muted">
          {elapsed}s elapsed · usually takes 1–3 minutes
        </p>
      )}
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const base = "grid size-8 shrink-0 place-items-center rounded-full border text-sm transition-colors";
  if (state === "done") return <span className={`${base} border-ok bg-ok text-white`}>✓</span>;
  if (state === "failed") return <span className={`${base} border-bad bg-bad text-white`}>✕</span>;
  if (state === "active")
    return (
      <span className={`${base} border-accent bg-accent-soft`}>
        <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </span>
    );
  return <span className={`${base} border-line bg-surface`} />;
}
