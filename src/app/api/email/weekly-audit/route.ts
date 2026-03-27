import { NextRequest, NextResponse } from "next/server";
import { resend, EMAIL_TO, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/resend";
import {
  renderWeeklyAuditEmail,
  type WeeklyAuditEmailData,
} from "@/lib/email/template";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/email/weekly-audit
 *
 * Dedicated endpoint for the Weekly Priority Audit email.
 * Accepts structured data, renders the template, and sends.
 *
 * Body: WeeklyAuditEmailData (all fields optional)
 * {
 *   weekOf?: string,
 *   sprintSummary?: string,
 *   priorities?: [{ title, reasoning, source?, url? }],
 *   sideProject?: { project, action, url? },
 *   parked?: [{ title, reason? }]
 * }
 */
export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const data = (await request.json()) as WeeklyAuditEmailData;
  const { subject, html } = renderWeeklyAuditEmail(data);

  const { data: emailResult, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: [EMAIL_TO],
    replyTo: EMAIL_REPLY_TO ? [EMAIL_REPLY_TO] : undefined,
    subject,
    html,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: emailResult?.id, subject });
}
