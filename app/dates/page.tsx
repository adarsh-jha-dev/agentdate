import { AutoRefresh } from "@/components/PersonActions";
import { StartDate } from "@/components/StartDate";
import { DateList } from "@/components/DateList";
import { listDates, readyPeopleNames } from "@/lib/queries";
import { isReadOnly } from "@/lib/readonly";

export const dynamic = "force-dynamic";

export default async function DatesPage() {
  const [all, people] = await Promise.all([listDates(), readyPeopleNames()]);
  const matches = all.filter((d) => d.a.secondDate && d.b.secondDate).length;

  return (
    <div>
      {all.some((d) => d.status === "running") && <AutoRefresh everyMs={5000} />}
      <h1 className="font-display text-5xl">Dates</h1>
      <p className="mt-2 text-muted">
        {all.length} {all.length === 1 ? "date" : "dates"} · {matches} {matches === 1 ? "match" : "matches"} (both agents want a second date)
      </p>

      {!isReadOnly() && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">Set up a date</p>
          <StartDate people={people} />
        </div>
      )}

      {all.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-16 text-center text-muted">
          No dates yet. Pick two people above, or open a profile and press “Find matches”.
        </div>
      ) : (
        <div className="mt-6">
          <DateList all={all} />
        </div>
      )}
    </div>
  );
}
