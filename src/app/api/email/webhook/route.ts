import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseReplyBody(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const freshLines: string[] = [];
  for (const line of lines) {
    // Stop at quoted reply markers
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{3,}/.test(line.trim())) break;
    // Skip individually quoted lines, but don't break — there may be fresh content after
    if (/^>{1}\s/.test(line.trim())) continue;
    freshLines.push(line);
  }
  const result = freshLines.join("\n").trim();
  // If stripping removed everything, return the original (better to have noisy data than nothing)
  return result || text.trim();
}

function extractBody(data: Record<string, unknown>): string {
  // Try multiple field names that Resend might use
  const candidates = [
    data.text,
    data.body,
    data.html,
    data.plain_text,
    data.content,
    // Nested under email object
    (data.email as Record<string, unknown>)?.text,
    (data.email as Record<string, unknown>)?.html,
    (data.email as Record<string, unknown>)?.body,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      // If it looks like HTML, strip tags first
      if (candidate.includes("<") && candidate.includes(">")) {
        return stripHtml(candidate);
      }
      return candidate;
    }
  }
  return "";
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

  const data = (event.data || event) as Record<string, unknown>;
  const from = (data.from as string) || "unknown sender";
  const subject = (data.subject as string) || "(no subject)";
  const rawText = extractBody(data);
  const replyContent = parseReplyBody(rawText);

  // Always store — even if parsing found nothing, store the raw event for debugging
  if (!replyContent) {
    const email = await prisma.email.create({
      data: {
        from,
        subject,
        body: `[raw payload — body extraction failed]\n\n${JSON.stringify(data, null, 2).substring(0, 2000)}`,
      },
    });
    return NextResponse.json({ status: "stored_raw", id: email.id });
  }

  const email = await prisma.email.create({
    data: {
      from,
      subject,
      body: replyContent,
    },
  });

  return NextResponse.json({ status: "stored", id: email.id });
}
