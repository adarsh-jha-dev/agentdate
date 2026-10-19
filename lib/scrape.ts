import { ApifyClient } from "apify-client";
import { z } from "zod";
import { parseInstagramUrl, parseLinkedInUrl } from "./urls";

// ---------------------------------------------------------------------------
// Actor inputs. Edit here when switching actors or changing scrape options.
// ---------------------------------------------------------------------------

const ACTOR_INPUTS = {
  // apify/instagram-profile-scraper
  instagram: (username: string) => ({
    usernames: [username],
    includeAboutSection: false,
  }),
  // harvestapi/linkedin-profile-scraper
  linkedin: (profileUrl: string) => ({
    profileScraperMode: "Profile details no email ($4 per 1k)",
    queries: [profileUrl],
  }),
};

const WAIT_SECS = 120;
const MAX_POSTS = 30;

export class ScrapeError extends Error {
  constructor(
    public source: "instagram" | "linkedin",
    message: string,
  ) {
    super(`${source}: ${message}`);
    this.name = "ScrapeError";
  }
}

let client: ApifyClient | null = null;
function getClient() {
  if (!process.env.APIFY_TOKEN) throw new Error("APIFY_TOKEN is not set");
  client ??= new ApifyClient({ token: process.env.APIFY_TOKEN });
  return client;
}

function actorId(source: "instagram" | "linkedin") {
  const id = source === "instagram" ? process.env.APIFY_IG_ACTOR : process.env.APIFY_LI_ACTOR;
  if (!id) throw new Error(`${source === "instagram" ? "APIFY_IG_ACTOR" : "APIFY_LI_ACTOR"} is not set`);
  return id;
}

async function runActor(source: "instagram" | "linkedin", input: object): Promise<unknown[]> {
  const run = await getClient()
    .actor(actorId(source))
    .call(input, { waitSecs: WAIT_SECS, log: null });
  if (run.status !== "SUCCEEDED") {
    throw new ScrapeError(source, `actor run ${run.id} ended with status ${run.status}`);
  }
  const { items } = await getClient().dataset(run.defaultDatasetId).listItems({ clean: true });
  return items;
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

const igRawPost = z.object({
  caption: z.string().nullish(),
  hashtags: z.array(z.string()).nullish(),
  locationName: z.string().nullish(),
  type: z.string().nullish(),
  timestamp: z.string().nullish(),
});

const igRaw = z.object({
  username: z.string(),
  fullName: z.string().nullish(),
  biography: z.string().nullish(),
  followersCount: z.number().nullish(),
  private: z.boolean().nullish(),
  latestPosts: z.array(igRawPost).nullish(),
});

export const instagramProfile = z.object({
  username: z.string(),
  fullName: z.string().nullable(),
  bio: z.string().nullable(),
  followers: z.number().nullable(),
  isPrivate: z.boolean(),
  posts: z.array(
    z.object({
      caption: z.string().nullable(),
      hashtags: z.array(z.string()),
      location: z.string().nullable(),
      type: z.string().nullable(),
      timestamp: z.string().nullable(),
    }),
  ),
});
export type InstagramProfile = z.infer<typeof instagramProfile>;

export function normalizeInstagram(raw: unknown): InstagramProfile {
  const parsed = igRaw.safeParse(raw);
  if (!parsed.success) throw new ScrapeError("instagram", "unexpected actor output shape");
  const r = parsed.data;
  return instagramProfile.parse({
    username: r.username,
    fullName: r.fullName || null,
    bio: r.biography || null,
    followers: r.followersCount ?? null,
    isPrivate: r.private ?? false,
    posts: (r.latestPosts ?? []).slice(0, MAX_POSTS).map((p) => ({
      caption: p.caption || null,
      hashtags: p.hashtags ?? [],
      location: p.locationName || null,
      type: p.type || null,
      timestamp: p.timestamp || null,
    })),
  });
}

export async function scrapeInstagram(url: string) {
  const parsedUrl = parseInstagramUrl(url);
  if (!parsedUrl) throw new ScrapeError("instagram", `invalid profile URL: ${url}`);

  const items = await runActor("instagram", ACTOR_INPUTS.instagram(parsedUrl.username));
  const raw = items.find(
    (i) => (i as { username?: string }).username?.toLowerCase() === parsedUrl.username,
  );
  if (!raw) {
    const err = (items[0] as { error?: string; errorDescription?: string } | undefined);
    throw new ScrapeError(
      "instagram",
      `no profile returned for @${parsedUrl.username}${err?.errorDescription || err?.error ? ` (${err.errorDescription ?? err.error})` : ""}`,
    );
  }

  const normalized = normalizeInstagram(raw);
  if (normalized.isPrivate) {
    throw new ScrapeError("instagram", `@${normalized.username} is private; only public profiles can be analyzed`);
  }
  if (!normalized.bio && normalized.posts.length === 0) {
    throw new ScrapeError("instagram", `@${normalized.username} returned no bio and no posts`);
  }
  return { raw, normalized };
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

const liDate = z.object({ text: z.string().nullish() }).nullish();

const liRaw = z.object({
  publicIdentifier: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  headline: z.string().nullish(),
  about: z.string().nullish(),
  location: z
    .object({
      linkedinText: z.string().nullish(),
      parsed: z.object({ text: z.string().nullish() }).nullish(),
    })
    .nullish(),
  experience: z
    .array(
      z.object({
        position: z.string().nullish(),
        companyName: z.string().nullish(),
        startDate: liDate,
        endDate: liDate,
        description: z.string().nullish(),
      }),
    )
    .nullish(),
  education: z
    .array(
      z.object({
        schoolName: z.string().nullish(),
        degree: z.string().nullish(),
        fieldOfStudy: z.string().nullish(),
        period: z.string().nullish(),
      }),
    )
    .nullish(),
  skills: z.array(z.object({ name: z.string().nullish() })).nullish(),
  languages: z.array(z.object({ name: z.string().nullish() })).nullish(),
  volunteering: z
    .array(
      z.object({
        role: z.string().nullish(),
        organizationName: z.string().nullish(),
        cause: z.string().nullish(),
        description: z.string().nullish(),
      }),
    )
    .nullish(),
  certifications: z
    .array(z.object({ title: z.string().nullish(), issuedBy: z.string().nullish() }))
    .nullish(),
});

export const linkedinProfile = z.object({
  name: z.string(),
  headline: z.string().nullable(),
  about: z.string().nullable(),
  location: z.string().nullable(),
  experience: z.array(
    z.object({
      title: z.string().nullable(),
      company: z.string().nullable(),
      dates: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string().nullable(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      dates: z.string().nullable(),
    }),
  ),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  volunteering: z.array(
    z.object({
      role: z.string().nullable(),
      organization: z.string().nullable(),
      cause: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  certifications: z.array(z.object({ title: z.string(), issuer: z.string().nullable() })),
});
export type LinkedInProfile = z.infer<typeof linkedinProfile>;

const clean = (s: string | null | undefined) => s?.trim() || null;
const names = (xs: { name?: string | null }[] | null | undefined) =>
  (xs ?? []).map((x) => clean(x.name)).filter((x): x is string => !!x);

export function normalizeLinkedIn(raw: unknown): LinkedInProfile {
  const parsed = liRaw.safeParse(raw);
  if (!parsed.success) throw new ScrapeError("linkedin", "unexpected actor output shape");
  const r = parsed.data;
  const dates = (start?: { text?: string | null } | null, end?: { text?: string | null } | null) =>
    [clean(start?.text), clean(end?.text)].filter(Boolean).join(" - ") || null;

  return linkedinProfile.parse({
    name: [clean(r.firstName), clean(r.lastName)].filter(Boolean).join(" "),
    headline: clean(r.headline),
    about: clean(r.about),
    location: clean(r.location?.parsed?.text) ?? clean(r.location?.linkedinText),
    experience: (r.experience ?? []).map((e) => ({
      title: clean(e.position),
      company: clean(e.companyName),
      dates: dates(e.startDate, e.endDate),
      description: clean(e.description),
    })),
    education: (r.education ?? []).map((e) => ({
      school: clean(e.schoolName),
      degree: clean(e.degree),
      field: clean(e.fieldOfStudy),
      dates: clean(e.period),
    })),
    skills: names(r.skills),
    languages: names(r.languages),
    volunteering: (r.volunteering ?? []).map((v) => ({
      role: clean(v.role),
      organization: clean(v.organizationName),
      cause: clean(v.cause),
      description: clean(v.description),
    })),
    certifications: (r.certifications ?? [])
      .map((c) => ({ title: clean(c.title), issuer: clean(c.issuedBy) }))
      .filter((c): c is { title: string; issuer: string | null } => !!c.title),
  });
}

export async function scrapeLinkedIn(url: string) {
  const parsedUrl = parseLinkedInUrl(url);
  if (!parsedUrl) throw new ScrapeError("linkedin", `invalid profile URL: ${url}`);

  const items = await runActor("linkedin", ACTOR_INPUTS.linkedin(parsedUrl.url));
  const raw = items.find((i) => (i as { publicIdentifier?: string }).publicIdentifier);
  if (!raw) {
    const err = (items[0] as { error?: string } | undefined)?.error;
    throw new ScrapeError("linkedin", `no profile returned for ${parsedUrl.url}${err ? ` (${err})` : ""}`);
  }

  const normalized = normalizeLinkedIn(raw);
  if (!normalized.name) throw new ScrapeError("linkedin", `profile at ${parsedUrl.url} has no name`);
  if (!normalized.headline && !normalized.about && normalized.experience.length === 0) {
    throw new ScrapeError("linkedin", `profile at ${parsedUrl.url} returned no headline, about or experience`);
  }
  return { raw, normalized };
}
