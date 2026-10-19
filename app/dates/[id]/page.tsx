import { notFound } from "next/navigation";
import { z } from "zod";
import { DateReplay } from "@/components/DateReplay";
import { getDate } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const date = await getDate(id);
  if (!date) notFound();
  return <DateReplay initial={date} />;
}
