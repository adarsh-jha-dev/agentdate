import Link from "next/link";
import type { Couple } from "@/lib/rank";
import { Avatar, Card } from "./ui";

export function BestCouples({ couples }: { couples: Couple[] }) {
  return (
    <Card title="Best couples" aside={<span className="text-xs text-muted">Both agents want a second date</span>}>
      {couples.length === 0 ? (
        <p className="text-sm italic text-muted">No mutual matches yet.</p>
      ) : (
        <ol className="divide-y divide-line">
          {couples.map((c, i) => (
            <li key={c.dateId}>
              <Link href={`/dates/${c.dateId}`} className="flex items-center gap-4 py-3 transition hover:opacity-80">
                <span className="w-6 font-display text-2xl text-muted tabular-nums">{i + 1}</span>
                <div className="flex -space-x-2">
                  <Avatar name={c.a.name} size={36} />
                  <Avatar name={c.b.name} size={36} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.a.name} <span className="text-accent">♥</span> {c.b.name}
                  </p>
                  <p className="truncate text-sm text-muted">{c.setting}</p>
                </div>
                <span className="hidden text-sm tabular-nums text-muted sm:inline">
                  {c.a.score} · {c.b.score}
                </span>
                <span className="font-display text-3xl tabular-nums">{Math.round(c.mutual)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
