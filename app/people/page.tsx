import Link from "next/link";
import { AutoRefresh } from "@/components/PersonActions";
import { PeopleGrid } from "@/components/PeopleGrid";
import { listPeople } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const all = await listPeople();
  const ready = all.filter((p) => p.status === "ready").length;
  const busy = all.some((p) => p.status === "scraping" || p.status === "analyzing");

  return (
    <div>
      {busy && <AutoRefresh everyMs={5000} />}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl">People</h1>
          <p className="mt-2 text-muted">
            {all.length} {all.length === 1 ? "person" : "people"} · {ready} with a profile ready
          </p>
        </div>
        <Link href="/" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90">
          + Add person
        </Link>
      </div>

      {all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-muted">
          No one yet. <Link href="/" className="text-accent hover:underline">Add the first person →</Link>
        </div>
      ) : (
        <PeopleGrid all={all} />
      )}
    </div>
  );
}
