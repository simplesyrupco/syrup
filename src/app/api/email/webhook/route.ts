import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

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

  const email = await prisma.email.create({
    data: {
      from,
      subject,
      body: replyContent,
    },
  });

  return NextResponse.json({ status: "stored", id: email.id });
}
