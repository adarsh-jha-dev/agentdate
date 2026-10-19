"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartDate({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const select =
    "min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (a && b && a !== b) router.push(`/dates/new?a=${a}&b=${b}`);
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <select value={a} onChange={(e) => setA(e.target.value)} className={select} aria-label="First person">
        <option value="">Choose someone…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <span className="text-center font-display text-xl italic text-accent">&amp;</span>
      <select value={b} onChange={(e) => setB(e.target.value)} className={select} aria-label="Second person">
        <option value="">…and their date</option>
        {people.filter((p) => p.id !== a).map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!a || !b || a === b}
        className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-40"
      >
        Send them on a date →
      </button>
    </form>
  );
}
