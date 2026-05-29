import { NextResponse } from "next/server";
import { runValidation } from "../../../lib/checks";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { tutorUrl?: string; issuerUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tutorUrl = (body.tutorUrl ?? "").trim();
  const issuerUrl = (body.issuerUrl ?? "").trim();
  if (!tutorUrl || !issuerUrl) {
    return NextResponse.json({ error: "tutorUrl and issuerUrl are required" }, { status: 400 });
  }
  const report = await runValidation(tutorUrl, issuerUrl);
  return NextResponse.json(report);
}
