import type { ReactNode } from "react";
import type { Person } from "@/lib/schema";

export function Card({
  title,
  aside,
  className = "",
  children,
}: {
  title?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)] ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS: Record<Person["status"], { label: string; cls: string; pulse?: boolean }> = {
  pending: { label: "Pending", cls: "bg-surface-2 text-muted" },
  scraping: { label: "Scraping", cls: "bg-info-soft text-info", pulse: true },
  analyzing: { label: "Agent reading", cls: "bg-warn-soft text-warn", pulse: true },
  ready: { label: "Ready", cls: "bg-ok-soft text-ok" },
  failed: { label: "Failed", cls: "bg-bad-soft text-bad" },
};

export function StatusBadge({ status }: { status: Person["status"] }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      <span className={`size-1.5 rounded-full bg-current ${s.pulse ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

export type SourceKind = "linkedin" | "instagram";

export function SourceTag({ source, className = "" }: { source: SourceKind; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        source === "linkedin" ? "bg-li-soft text-li" : "bg-ig-soft text-ig"
      } ${className}`}
    >
      {source === "linkedin" ? "LinkedIn" : "Instagram"}
    </span>
  );
}

// Deterministic warm gradient per name; no remote photos (IG/LinkedIn CDN URLs expire).
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .replace(/^@/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-display text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 65% 48%))`,
      }}
    >
      {initials}
    </div>
  );
}
