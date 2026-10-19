// Usage:
//   npm run test:scrape -- <instagram-url> <linkedin-url>   (live Apify runs, costs credits)
//   npm run test:scrape -- --fixtures                        (normalize fixtures/ig.json + li.json, free)
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { normalizeInstagram, normalizeLinkedIn, scrapeInstagram, scrapeLinkedIn } = await import("../lib/scrape");
  const args = process.argv.slice(2);

  if (args[0] === "--fixtures") {
    const ig = JSON.parse(readFileSync("fixtures/ig.json", "utf8"))[0];
    const li = JSON.parse(readFileSync("fixtures/li.json", "utf8"))[0];
    print("instagram", normalizeInstagram(ig));
    print("linkedin", normalizeLinkedIn(li));
    return;
  }

  const igUrl = args.find((a) => a.includes("instagram.com"));
  const liUrl = args.find((a) => a.includes("linkedin.com"));
  if (!igUrl && !liUrl) {
    console.error("usage: test-scrape <instagram-url> <linkedin-url> | --fixtures");
    process.exit(1);
  }

  const results = await Promise.allSettled([
    igUrl ? scrapeInstagram(igUrl) : Promise.resolve(null),
    liUrl ? scrapeLinkedIn(liUrl) : Promise.resolve(null),
  ]);
  for (const [source, r] of [["instagram", results[0]], ["linkedin", results[1]]] as const) {
    if (r.status === "rejected") console.error(`\n== ${source} FAILED: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    else if (r.value) print(source, r.value.normalized);
  }
  if (results.some((r) => r.status === "rejected")) process.exit(1);
}

function print(label: string, value: unknown) {
  console.log(`\n== ${label}`);
  console.log(JSON.stringify(value, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
