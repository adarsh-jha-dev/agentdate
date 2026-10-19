"use client";

import { useRouter } from "next/navigation";

export function PersonPicker({
  people,
  selected,
  basePath,
}: {
  people: { id: string; name: string }[];
  selected: string | null;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selected ?? ""}
      onChange={(e) => router.push(e.target.value ? `${basePath}?person=${e.target.value}` : basePath)}
      aria-label="Choose a person"
      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft sm:w-72"
    >
      <option value="">Choose a person…</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
