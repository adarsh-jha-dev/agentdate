"use client";

import { useState } from "react";
import { SourceTag, type SourceKind } from "./ui";

export type Trait = { trait: string; evidence: string; source?: SourceKind };

export function TraitChips({ traits, empty = "Nothing with clear evidence." }: { traits: Trait[]; empty?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (traits.length === 0) return <p className="text-sm italic text-muted">{empty}</p>;
  const selected = open === null ? null : traits[open];

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {traits.map((t, i) => {
          const active = open === i;
          return (
            <li key={`${t.trait}-${i}`}>
              <button
                type="button"
                onClick={() => setOpen(active ? null : i)}
                aria-expanded={active}
                className={`inline-flex items-center gap-2 rounded-full border py-1 pl-3 pr-1.5 text-sm transition ${
                  active
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-surface-2 hover:border-muted/40"
                }`}
              >
                {t.trait}
                {t.source ? (
                  <SourceTag source={t.source} />
                ) : (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    quote
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {selected && (
        <blockquote
          key={open}
          className={`animate-rise mt-3 border-l-2 py-1 pl-3 text-sm leading-relaxed ${
            selected.source === "linkedin" ? "border-li" : selected.source === "instagram" ? "border-ig" : "border-accent"
          }`}
        >
          <span className="text-muted">“</span>
          {selected.evidence}
          <span className="text-muted">”</span>
          {selected.source && (
            <span className="ml-2 text-xs text-muted">from {selected.source === "linkedin" ? "LinkedIn" : "Instagram"}</span>
          )}
        </blockquote>
      )}
    </div>
  );
}
