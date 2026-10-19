// Canonical URL forms, used both for validation and for deduping people.

const IG_RESERVED = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "tv", "direct"]);

export function parseInstagramUrl(input: string): { username: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!/^(www\.)?instagram\.com$/i.test(url.hostname)) return null;
  const username = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (!username || IG_RESERVED.has(username) || !/^[a-z0-9._]{1,30}$/.test(username)) return null;
  return { username, url: `https://www.instagram.com/${username}` };
}

export function parseLinkedInUrl(input: string): { slug: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!/^([a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname)) return null;
  const [section, rawSlug] = url.pathname.split("/").filter(Boolean);
  if (section !== "in" || !rawSlug) return null;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  if (!/^[\p{L}\p{N}_-]{3,100}$/u.test(slug)) return null;
  return { slug, url: `https://www.linkedin.com/in/${slug}` };
}
