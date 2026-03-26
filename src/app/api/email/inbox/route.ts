import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { requireAuth } from "@/lib/auth";

const INBOX_KEY = "email:inbox";

interface StoredEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  read: boolean;
}

/**
 * GET /api/email/inbox
 *
 * Query params:
 *   unread=true  — only return unread emails (default)
 *   limit=10     — max emails to return
 *   markRead=true — mark returned emails as read (default)
 */
export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;
  const unreadOnly = params.get("unread") !== "false";
  const limit = Math.min(parseInt(params.get("limit") || "50", 10), 100);
  const markRead = params.get("markRead") !== "false";

  // Get all stored emails
  const raw = await kv.lrange(INBOX_KEY, 0, -1);
  let emails: StoredEmail[] = raw.map((item) =>
    typeof item === "string" ? JSON.parse(item) : item
  );

  if (unreadOnly) {
    emails = emails.filter((e) => !e.read);
  }

  emails = emails.slice(0, limit);

  // Mark as read
  if (markRead && emails.length > 0) {
    const allRaw = await kv.lrange(INBOX_KEY, 0, -1);
    const readIds = new Set(emails.map((e) => e.id));
    const updated = allRaw.map((item) => {
      const email: StoredEmail =
        typeof item === "string" ? JSON.parse(item) : item;
      if (readIds.has(email.id)) {
        email.read = true;
      }
      return JSON.stringify(email);
    });

    // Replace the list atomically
    const pipeline = kv.pipeline();
    pipeline.del(INBOX_KEY);
    for (const item of updated) {
      pipeline.rpush(INBOX_KEY, item);
    }
    await pipeline.exec();
  }

  return NextResponse.json({ emails, count: emails.length });
}
