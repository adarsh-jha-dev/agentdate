import { redirect } from "next/navigation";
import { z } from "zod";
import { DateLive } from "@/components/DateLive";

export default async function NewDatePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  if (!z.uuid().safeParse(a).success || !z.uuid().safeParse(b).success || a === b) redirect("/dates");
  return <DateLive aId={a!} bId={b!} />;
}
