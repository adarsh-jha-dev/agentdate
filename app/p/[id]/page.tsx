import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AutoRefresh, RetryAnalysis } from "@/components/PersonActions";
import { TraitChips } from "@/components/TraitChips";
import { Avatar, Card, SourceTag, StatusBadge } from "@/components/ui";
import type { Analysis } from "@/lib/analyze";
import { getPersonView, type PersonView } from "@/lib/queries";
import type { InstagramProfile, LinkedInProfile } from "@/lib/scrape";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const view = await getPersonView(id);
  if (!view) notFound();

  const { person, analysis, linkedin, instagram } = view;
  const inProgress = person.status === "scraping" || person.status === "analyzing" || person.status === "pending";

  return (
    <div className="space-y-8">
      {inProgress && <AutoRefresh />}
      <Header view={view} />

      {person.status === "failed" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bad-soft px-5 py-4 text-sm text-bad">
          <span>{person.error ?? "Processing failed."}</span>
          {linkedin && instagram && <RetryAnalysis personId={person.id} />}
        </div>
      )}
      {inProgress && !analysis && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-5 py-6 text-muted">
          <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          {person.status === "analyzing" ? "The agent is reading their profiles…" : "Scraping LinkedIn and Instagram…"}
        </div>
      )}

      {analysis && <AnalysisGrid a={analysis} />}

      {(linkedin || instagram) && <SourcesPanel linkedin={linkedin} instagram={instagram} />}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Top matches">
          {view.matches.length === 0 ? (
            <p className="text-sm italic text-muted">No matches scored yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {view.matches.map((m) => (
                <li key={m.id}>
                  <Link href={`/p/${m.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <Avatar name={m.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.name}</p>
                      {m.reason && <p className="truncate text-sm text-muted">{m.reason}</p>}
                    </div>
                    <Score value={m.score} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Dates">
          {view.dates.length === 0 ? (
            <p className="text-sm italic text-muted">No dates yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {view.dates.map((d) => (
                <li key={d.id}>
                  <Link href={`/dates/${d.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <Avatar name={d.otherName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">with {d.otherName}</p>
                      <p className="truncate text-sm text-muted">{d.setting ?? d.status}</p>
                    </div>
                    {d.myScore != null && <Score value={d.myScore} />}
                    <span className="text-muted">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Header({ view }: { view: PersonView }) {
  const { person, linkedin, instagram } = view;
  return (
    <header className="animate-rise flex flex-col gap-5 sm:flex-row sm:items-center">
      <Avatar name={person.name} size={84} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{person.name}</h1>
          <StatusBadge status={person.status} />
        </div>
        {linkedin?.headline && <p className="mt-1 max-w-2xl text-muted">{linkedin.headline}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {linkedin?.location && <span className="text-muted">{linkedin.location}</span>}
          {person.linkedinUrl && (
            <a href={person.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-li hover:underline">
              LinkedIn ↗
            </a>
          )}
          {person.instagramUrl && (
            <a href={person.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-ig hover:underline">
              @{instagram?.username ?? person.instagramUrl.split("/").pop()} ↗
            </a>
          )}
          {instagram?.followers != null && (
            <span className="text-muted">{Intl.NumberFormat("en", { notation: "compact" }).format(instagram.followers)} followers</span>
          )}
        </div>
      </div>
    </header>
  );
}

function AnalysisGrid({ a }: { a: Analysis }) {
  return (
    <div className="grid gap-5 md:grid-cols-6">
      <Card title="Summary" className="animate-rise md:col-span-4">
        <p className="font-display text-2xl leading-snug sm:text-[28px]">{a.summary}</p>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Meta label="Career stage" value={a.careerStage} />
          <Meta label="Ambitions" value={a.ambitions} />
        </div>
      </Card>
      <Card title="Ideal partner" className="animate-rise bg-accent-soft/40 md:col-span-2">
        <p className="leading-relaxed">{a.idealPartner}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted">Date style</p>
        <p className="mt-1 leading-relaxed">{a.dateStyle}</p>
      </Card>

      <Card title="Needs" aside={<Confidence value={a.confidence.needs} />} className="md:col-span-3">
        <TraitChips traits={a.needs} />
      </Card>
      <Card title="Values" aside={<Confidence value={a.confidence.values} />} className="md:col-span-3">
        <TraitChips traits={a.values} />
      </Card>
      <Card title="Hobbies" aside={<Confidence value={a.confidence.hobbies} />} className="md:col-span-3">
        <TraitChips traits={a.hobbies} />
      </Card>
      <Card title="Interests" aside={<Confidence value={a.confidence.interests} />} className="md:col-span-3">
        <TraitChips traits={a.interests} />
      </Card>

      <Card title="Personality" aside={<Confidence value={a.confidence.personality} />} className="md:col-span-3">
        <TraitChips traits={a.personality.traits} />
        <div className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <Meta label="Communication" value={a.personality.communicationStyle} />
          <Meta label="Energy" value={a.personality.energy} />
        </div>
      </Card>
      <Card title="Lifestyle" className="md:col-span-3">
        <dl className="divide-y divide-line">
          {(["pace", "social", "travel", "fitness"] as const).map((k) => {
            const item = a.lifestyle[k];
            return (
              <div key={k} className="grid grid-cols-[80px_1fr] gap-3 py-2.5 text-sm">
                <dt className="capitalize text-muted">{k}</dt>
                <dd>
                  {item ? (
                    <>
                      <p>{item.value}</p>
                      <p className="mt-0.5 text-xs text-muted">“{item.evidence}”</p>
                    </>
                  ) : (
                    <span className="italic text-muted">No evidence</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </Card>

      <Card title="Possible dealbreakers" className="md:col-span-3">
        <TraitChips traits={a.dealbreakersGuess} empty="None the agent could back with evidence." />
      </Card>
      <Card title="Gaps" className="md:col-span-3">
        <p className="mb-3 text-sm text-muted">What LinkedIn and Instagram don&apos;t reveal, so the agent won&apos;t guess:</p>
        <ul className="space-y-1.5 text-sm">
          {a.gaps.map((g) => (
            <li key={g} className="flex gap-2">
              <span className="text-muted">—</span>
              {g}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function SourcesPanel({ linkedin, instagram }: { linkedin: LinkedInProfile | null; instagram: InstagramProfile | null }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-medium">What the agent read</span>
          <span className="ml-2 text-sm text-muted">Everything the profile above was built from, nothing else</span>
        </span>
        <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-2">
        <div className="space-y-4 text-sm">
          <SourceTag source="linkedin" />
          {linkedin ? (
            <>
              {linkedin.about && <p className="whitespace-pre-line leading-relaxed">{linkedin.about}</p>}
              <SourceList
                title="Experience"
                items={linkedin.experience.map((e) => ({
                  head: [e.title, e.company].filter(Boolean).join(" · "),
                  sub: e.dates,
                  body: e.description,
                }))}
              />
              <SourceList
                title="Education"
                items={linkedin.education.map((e) => ({
                  head: e.school ?? "",
                  sub: [e.degree, e.field, e.dates].filter(Boolean).join(" · "),
                }))}
              />
              {linkedin.skills.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted">Skills</p>
                  <p className="leading-relaxed">{linkedin.skills.join(" · ")}</p>
                </div>
              )}
              {linkedin.languages.length > 0 && (
                <p><span className="text-muted">Languages:</span> {linkedin.languages.join(", ")}</p>
              )}
            </>
          ) : (
            <p className="italic text-muted">Not scraped yet.</p>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <SourceTag source="instagram" />
          {instagram ? (
            <>
              {instagram.bio && <p className="whitespace-pre-line leading-relaxed">{instagram.bio}</p>}
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                  Recent posts ({instagram.posts.length})
                </p>
                <ul className="space-y-2">
                  {instagram.posts.map((p, i) => (
                    <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
                      <p className="mb-1 flex flex-wrap gap-x-2 text-xs text-muted">
                        <span>{p.type}</span>
                        {p.timestamp && <span>{new Date(p.timestamp).toLocaleDateString("en", { dateStyle: "medium" })}</span>}
                        {p.location && <span>📍 {p.location}</span>}
                      </p>
                      <p className="line-clamp-4 whitespace-pre-line">{p.caption ?? <span className="italic text-muted">No caption</span>}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="italic text-muted">Not scraped yet.</p>
          )}
        </div>
      </div>
    </details>
  );
}

function SourceList({ title, items }: { title: string; items: { head: string; sub?: string | null; body?: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted">{title}</p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i}>
            <p className="font-medium">{it.head}</p>
            {it.sub && <p className="text-xs text-muted">{it.sub}</p>}
            {it.body && <p className="mt-1 line-clamp-3 text-muted">{it.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="flex items-center gap-2 text-xs text-muted" title={`Agent confidence: ${pct}%`}>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

// Scores may be stored as 0-1 or 0-100; display on a 0-100 scale.
function Score({ value }: { value: number }) {
  const pct = Math.round(value <= 1 ? value * 100 : value);
  return <span className="font-display text-2xl tabular-nums">{pct}</span>;
}
