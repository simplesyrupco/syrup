import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the external API key from the Authorization header.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const expectedKey = process.env.EXTERNAL_API_KEY;
  if (!expectedKey) return null; // no key configured = open (dev mode)

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
