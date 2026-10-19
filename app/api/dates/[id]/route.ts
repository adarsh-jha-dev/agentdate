import { NextResponse } from "next/server";
import { z } from "zod";
import { getDate } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const date = await getDate(id);
  if (!date) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(date);
}
