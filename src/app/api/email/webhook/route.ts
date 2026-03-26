import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL;
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY;
const PAPERCLIP_COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID;
const PAPERCLIP_AGENT_ID = process.env.PAPERCLIP_AGENT_ID;
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

async function paperclipRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`${PAPERCLIP_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
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

  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY || !PAPERCLIP_COMPANY_ID || !PAPERCLIP_AGENT_ID) {
    console.error("Missing Paperclip env vars");
    return NextResponse.json({ error: "Paperclip not configured" }, { status: 500 });
  }

  // Find CEO's current in_progress task
  const issues = await paperclipRequest(
    "GET",
    `/api/companies/${PAPERCLIP_COMPANY_ID}/issues?assigneeAgentId=${PAPERCLIP_AGENT_ID}&status=in_progress`
  );

  if (!Array.isArray(issues) || issues.length === 0) {
    await paperclipRequest(
      "POST",
      `/api/companies/${PAPERCLIP_COMPANY_ID}/issues`,
      {
        title: `Email reply: ${subject}`,
        description: `**From:** ${from}\n\n${replyContent}`,
        status: "todo",
        priority: "medium",
        assigneeAgentId: PAPERCLIP_AGENT_ID,
      }
    );
    return NextResponse.json({ status: "created task" });
  }

  const task = issues.sort(
    (a: { updatedAt: string }, b: { updatedAt: string }) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];

  await paperclipRequest("POST", `/api/issues/${task.id}/comments`, {
    body: `**Email reply from ${from}:**\n\n${replyContent}`,
  });

  return NextResponse.json({ status: "commented", issueId: task.id });
}
