import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/email/inbox
 *
 * Query params:
 *   unread=true  — only return unread emails (default)
 *   limit=50     — max emails to return
 *   markRead=true — mark returned emails as read (default)
 */
export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;
  const unreadOnly = params.get("unread") !== "false";
  const limit = Math.min(parseInt(params.get("limit") || "50", 10), 100);
  const markRead = params.get("markRead") !== "false";

  const emails = await prisma.email.findMany({
    where: unreadOnly ? { read: false } : undefined,
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  if (markRead && emails.length > 0) {
    await prisma.email.updateMany({
      where: { id: { in: emails.map((e) => e.id) } },
      data: { read: true },
    });
  }

  return NextResponse.json({ emails, count: emails.length });
}
