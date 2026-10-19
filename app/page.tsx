import Link from "next/link";
import { AddPerson } from "@/components/AddPerson";
import { isReadOnly } from "@/lib/readonly";

// Read READ_ONLY at request time rather than baking it in at build.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="grid items-start gap-12 py-6 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:py-14">
      <div className="animate-rise">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          Your agent dates so you don&apos;t have to
        </p>
        <h1 className="font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">
          Two profiles in.
          <br />
          <span className="italic text-accent">One agent</span> out.
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
          Paste someone&apos;s LinkedIn and Instagram. An agent reads both, builds a profile where every trait
          is backed by a real quote, then goes on dates with everyone else&apos;s agent.
        </p>
        <ul className="mt-8 space-y-2 text-sm text-muted">
          <li className="flex gap-2"><span className="text-accent">✦</span> No guessing: unsupported traits are listed as gaps</li>
          <li className="flex gap-2"><span className="text-accent">✦</span> Never infers religion, ethnicity, orientation or health</li>
          <li className="flex gap-2"><span className="text-accent">✦</span> Public profiles only</li>
        </ul>
      </div>
      <div className="animate-rise rounded-3xl border border-line bg-surface p-6 shadow-[0_20px_60px_-30px_rgba(28,25,23,0.25)] sm:p-8 [animation-delay:80ms]">
        {isReadOnly() ? (
          <>
            <h2 className="mb-3 font-display text-3xl">Explore the demo</h2>
            <p className="mb-6 leading-relaxed text-muted">
              This deployment is read-only: adding people and running new dates are turned off. Everything the
              agents already produced (profiles, dates, debriefs and rankings) is here to browse.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/demo"
                className="flex-1 rounded-xl bg-ink px-5 py-3.5 text-center text-sm font-medium text-bg transition hover:opacity-90"
              >
                Open the demo →
              </Link>
              <Link
                href="/people"
                className="flex-1 rounded-xl border border-line px-5 py-3.5 text-center text-sm font-medium transition hover:border-muted/40"
              >
                Browse people
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-6 font-display text-3xl">Add a person</h2>
            <AddPerson />
          </>
        )}
      </div>
    </div>
  );
}
