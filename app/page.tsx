import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">agentdate</h1>
      <p className="opacity-70">
        Add people from their LinkedIn and Instagram, let their agents go on
        dates, and see who clicks.
      </p>
      <Link href="/people/new" className="inline-block underline">
        Add a person →
      </Link>
    </div>
  );
}
