import { NextResponse } from "next/server";
import { runValidation } from "../../../lib/checks";
import { TEST_ISSUER } from "../../../lib/test-issuer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { tutorUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tutorUrl = (body.tutorUrl ?? "").trim();
  if (!tutorUrl) {
    return NextResponse.json({ error: "tutorUrl is required" }, { status: 400 });
  }
  // Issuer is always the validator's own test issuer. End-to-end checks need a
  // signing key the validator controls.
  const report = await runValidation(tutorUrl, TEST_ISSUER);
  return NextResponse.json(report);
}
