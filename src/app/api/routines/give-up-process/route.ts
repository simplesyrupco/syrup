import { NextRequest, NextResponse } from "next/server";
import { resend, EMAIL_TO, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/resend";
import {
  renderGiveUpEmail,
  type StaleRepo,
} from "@/lib/email/template";
import { requireAuth } from "@/lib/auth";
import {
  fetchSideProjectActivity,
  type RepoActivity,
} from "@/lib/integrations/github";

const STALE_THRESHOLD_DAYS = 14;

/**
 * POST /api/routines/give-up-process
 *
 * Checks GitHub side project repos for staleness (14+ days without commits).
 * If any stale repos are found, sends the Give-Up Process email asking the
 * three questions: Bored? Bad idea? Better project waiting?
 * If all repos are active, skips silently.
 *
 * Optional body:
 * {
 *   repos?: string[],    // Override GITHUB_SIDE_REPOS
 *   dryRun?: boolean,    // Return email data without sending
 * }
 */
export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  let body: { repos?: string[]; dryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const repoActivity = await fetchSideProjectActivity(body.repos).catch(
    () => [] as RepoActivity[]
  );

  // Find repos that are 14+ days stale
  const staleRepos: StaleRepo[] = repoActivity
    .filter(
      (r) => r.daysSinceCommit !== null && r.daysSinceCommit >= STALE_THRESHOLD_DAYS
    )
    .map((r) => ({
      name: r.repo.split("/").pop() || r.repo,
      daysSinceCommit: r.daysSinceCommit!,
      lastCommitMessage: r.lastCommitMessage || undefined,
      url: r.url,
    }));

  // If no stale repos, skip silently
  if (staleRepos.length === 0) {
    return NextResponse.json({
      status: "skipped",
      reason: "All repos active — no stale projects found",
      reposChecked: repoActivity.length,
    });
  }

  const emailData = { staleRepos };

  if (body.dryRun) {
    const { subject, html } = renderGiveUpEmail(emailData);
    return NextResponse.json({
      status: "dry_run",
      subject,
      emailData,
      htmlLength: html.length,
    });
  }

  // Send the give-up process email
  const { subject, html } = renderGiveUpEmail(emailData);
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

  return NextResponse.json({
    status: "sent",
    emailId: emailResult?.id,
    subject,
    staleCount: staleRepos.length,
    reposChecked: repoActivity.length,
  });
}
