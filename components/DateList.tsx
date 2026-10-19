import Link from "next/link";
import type { listDates } from "@/lib/queries";
import { Avatar } from "./ui";

export function DateList({ all }: { all: Awaited<ReturnType<typeof listDates>> }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {all.map((d) => {
        const match = d.a.secondDate && d.b.secondDate;
        return (
          <li key={d.id}>
            <Link href={`/dates/${d.id}`} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-surface-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Avatar name={d.a.name} size={34} />
                <Avatar name={d.b.name} size={34} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {d.a.name} <span className="text-muted">&amp;</span> {d.b.name}
                </p>
                <p className="truncate text-sm text-muted">{d.setting ?? "Setting not chosen yet"}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {d.status === "done" ? (
                  <>
                    <span className="tabular-nums text-muted">
                      {d.a.score} · {d.b.score}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        match ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {match ? "♥ Match" : "No match"}
                    </span>
                  </>
                ) : d.status === "running" ? (
                  <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
                    On the date · {d.turns}/8
                  </span>
                ) : (
                  <span className="rounded-full bg-bad-soft px-2.5 py-1 text-xs font-medium text-bad">{d.status}</span>
                )}
                <span className="text-muted">→</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
