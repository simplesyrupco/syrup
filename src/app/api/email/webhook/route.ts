import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const INBOX_KEY = "email:inbox";
const MAX_STORED = 100;

interface StoredEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  read: boolean;
}

function parseReplyBody(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const freshLines: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{3,}/.test(line.trim())) break;
    if (/^>{1}/.test(line.trim())) continue;
    freshLines.push(line);
  }
  return freshLines.join("\n").trim();
}

function verifySignature(
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): boolean {
  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(toSign)
    .digest("base64");
  const signatures = svixSignature.split(" ").map((s) => s.replace("v1,", ""));
  return signatures.includes(expected);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Optional signature verification
  if (WEBHOOK_SECRET) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (
      svixId &&
      svixTimestamp &&
      svixSignature &&
      !verifySignature(rawBody, svixId, svixTimestamp, svixSignature, WEBHOOK_SECRET)
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const event = JSON.parse(rawBody);

  if (event.type !== "email.received") {
    return NextResponse.json({ status: "ignored" });
  }

  const data = event.data || event;
  const from = data.from || "unknown sender";
  const subject = data.subject || "(no subject)";
  const text = data.text || data.html || "";
  const replyContent = parseReplyBody(text);

  if (!replyContent) {
    return NextResponse.json({ status: "empty reply" });
  }

  const email: StoredEmail = {
    id: crypto.randomUUID(),
    from,
    subject,
    body: replyContent,
    receivedAt: new Date().toISOString(),
    read: false,
  };

  // Push to the front of the list
  await kv.lpush(INBOX_KEY, JSON.stringify(email));
  // Trim to keep only the most recent emails
  await kv.ltrim(INBOX_KEY, 0, MAX_STORED - 1);

  return NextResponse.json({ status: "stored", id: email.id });
}
