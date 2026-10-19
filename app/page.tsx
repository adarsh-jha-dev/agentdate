import { AddPerson } from "@/components/AddPerson";

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
        <h2 className="mb-6 font-display text-3xl">Add a person</h2>
        <AddPerson />
      </div>
    </div>
  );
}
