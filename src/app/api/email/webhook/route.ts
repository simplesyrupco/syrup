import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

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
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{3,}/.test(line.trim())) break;
    if (/^>{1}\s/.test(line.trim())) continue;
    freshLines.push(line);
  }
  const result = freshLines.join("\n").trim();
  return result || text.trim();
}

async function fetchReceivedEmail(emailId: string): Promise<{ text?: string; html?: string } | null> {
  if (!RESEND_API_KEY) return null;

  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });

  if (!res.ok) {
    console.error(`Failed to fetch received email ${emailId}: ${res.status}`);
    return null;
  }

  return res.json();
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
  const emailId = data.email_id as string;

  // Fetch the full email content from Resend API
  let bodyText = "";
  if (emailId) {
    const fullEmail = await fetchReceivedEmail(emailId);
    if (fullEmail) {
      if (fullEmail.text) {
        bodyText = fullEmail.text;
      } else if (fullEmail.html) {
        bodyText = stripHtml(fullEmail.html);
      }
    }
  }

  const replyContent = parseReplyBody(bodyText);

  if (!replyContent) {
    // Store raw metadata if we still couldn't get the body
    const email = await prisma.email.create({
      data: {
        from,
        subject,
        body: `[body fetch failed — email_id: ${emailId}]\n\n${JSON.stringify(data, null, 2).substring(0, 2000)}`,
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
