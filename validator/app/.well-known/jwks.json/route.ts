import { NextResponse } from "next/server";
import { TEST_PUBLIC_JWK } from "../../../lib/test-issuer";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    { keys: [TEST_PUBLIC_JWK] },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
