import { NextRequest, NextResponse } from "next/server";
import { resend, EMAIL_TO, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/resend";
import {
  renderVitallyEmail,
  renderSideProjectEmail,
  renderGiveUpProcessEmail,
  renderWeeklyAuditEmail,
  type VitallyEmailData,
  type SideProjectEmailData,
  type GiveUpProcessEmailData,
  type WeeklyAuditEmailData,
} from "@/lib/email/template";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const { type, data, subject: customSubject, html: customHtml } = body as {
    type: "vitally" | "sideproject" | "giveup" | "weekly-audit" | "test" | "custom";
    data?: VitallyEmailData | SideProjectEmailData | GiveUpProcessEmailData | WeeklyAuditEmailData;
    subject?: string;
    html?: string;
  };

  let subject: string;
  let html: string;

  if (type === "custom") {
    if (!customSubject || !customHtml) {
      return NextResponse.json(
        { error: "Custom type requires 'subject' and 'html' fields" },
        { status: 400 }
      );
    }
    subject = customSubject;
    html = customHtml;
  } else if (type === "test") {
    const result = renderVitallyEmail({
      sprint: { name: "Sprint 42", completed: 7, total: 12, daysRemaining: 5 },
      tasks: [
        { summary: "Task Templates: Part 6 — Cloning", priority: "Medium", status: "Shipped", url: "https://vitally.atlassian.net/browse/VIT-101" },
        { summary: "Property Display widgets: indicator columns", priority: "Medium", status: "In Progress", url: "https://vitally.atlassian.net/browse/VIT-102" },
        { summary: "Seat licensing bug", priority: "Medium", status: "To Do", url: "https://vitally.atlassian.net/browse/VIT-103" },
      ],
      blockers: [
        { summary: "Rotate dev API keys", context: "Credential access needed", url: "https://vitally.atlassian.net/browse/VIT-50" },
      ],
      prs: [
        { title: "Redesign: Magazine editorial layout", number: 5, url: "https://github.com/example/repo/pull/5", reviewStatus: "comments" },
      ],
    });
    subject = result.subject;
    html = result.html;
  } else if (type === "vitally") {
    const result = renderVitallyEmail(data as VitallyEmailData);
    subject = result.subject;
    html = result.html;
  } else if (type === "sideproject") {
    const result = renderSideProjectEmail(data as SideProjectEmailData);
    subject = result.subject;
    html = result.html;
  } else if (type === "giveup") {
    const result = renderGiveUpProcessEmail(data as GiveUpProcessEmailData);
    subject = result.subject;
    html = result.html;
  } else if (type === "weekly-audit") {
    const result = renderWeeklyAuditEmail(data as WeeklyAuditEmailData);
    subject = result.subject;
    html = result.html;
  } else {
    return NextResponse.json(
      { error: `Unknown type: ${type}. Use: vitally, sideproject, giveup, weekly-audit, test, or custom` },
      { status: 400 }
    );
  }

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
