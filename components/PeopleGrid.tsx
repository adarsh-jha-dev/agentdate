import Link from "next/link";
import type { listPeople } from "@/lib/queries";
import { Avatar, StatusBadge } from "./ui";

export function PeopleGrid({ all }: { all: Awaited<ReturnType<typeof listPeople>> }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {all.map((p, i) => (
        <li key={p.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
          <Link
            href={`/p/${p.id}`}
            className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-muted/30 hover:shadow-[0_12px_40px_-24px_rgba(28,25,23,0.35)]"
          >
            <div className="flex items-start gap-3">
              <Avatar name={p.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-2xl leading-tight">{p.name}</p>
                <p className="line-clamp-1 text-sm text-muted">{p.headline ?? " "}</p>
              </div>
            </div>
            <p className="mt-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
              {p.summary ?? (p.status === "failed" ? p.error : "Profile not ready yet.")}
            </p>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {p.interests.map((t) => (
                  <span key={t} className="max-w-[10rem] truncate rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
              <StatusBadge status={p.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
