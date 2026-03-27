import { NextRequest, NextResponse } from "next/server";
import { resend, EMAIL_TO, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/resend";
import {
  renderWeeklyAuditEmail,
  type WeeklyAuditEmailData,
  type WeeklyPriority,
  type SideProjectAction,
  type ParkedIdea,
} from "@/lib/email/template";
import { requireAuth } from "@/lib/auth";
import { fetchActiveSprintStatus } from "@/lib/integrations/jira";
import {
  fetchSideProjectActivity,
  type RepoActivity,
} from "@/lib/integrations/github";
import { fetchPaperclipTasks } from "@/lib/integrations/paperclip";

/**
 * POST /api/routines/weekly-audit
 *
 * Pulls data from Jira, GitHub, and Paperclip, ranks priorities,
 * and sends the weekly priority audit email.
 *
 * Optional body:
 * {
 *   repos?: string[],       // Override GITHUB_SIDE_REPOS
 *   dryRun?: boolean,       // Return email data without sending
 *   overrides?: Partial<WeeklyAuditEmailData>  // Merge into generated data
 * }
 */
export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  let body: {
    repos?: string[];
    dryRun?: boolean;
    overrides?: Partial<WeeklyAuditEmailData>;
  } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  // Fetch all data sources in parallel
  const [sprintStatus, repoActivity, paperclipTasks] = await Promise.all([
    fetchActiveSprintStatus().catch(() => null),
    fetchSideProjectActivity(body.repos).catch(() => []),
    fetchPaperclipTasks().catch(() => null),
  ]);

  // Build priorities from all sources, ranked by urgency
  const priorities: WeeklyPriority[] = [];

  // 1. Blocked Paperclip tasks (highest urgency)
  if (paperclipTasks) {
    for (const t of paperclipTasks.tasks.filter((t) => t.status === "blocked")) {
      priorities.push({
        title: `Unblock: ${t.title}`,
        reasoning: `${t.identifier} is blocked — needs resolution before other work can proceed`,
        source: "Paperclip",
      });
    }
  }

  // 2. Sprint tasks not yet done (from Jira)
  if (sprintStatus) {
    const notDone = sprintStatus.tasks.filter(
      (t) => !["done", "closed", "resolved", "complete"].includes(t.status.toLowerCase())
    );
    // Prioritize by Jira priority, then by status (in progress first)
    const priorityRank: Record<string, number> = {
      highest: 0,
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      lowest: 4,
    };
    const statusRank: Record<string, number> = {
      "in progress": 0,
      "in review": 1,
      "to do": 2,
    };
    notDone.sort((a, b) => {
      const pa = priorityRank[a.priority.toLowerCase()] ?? 2;
      const pb = priorityRank[b.priority.toLowerCase()] ?? 2;
      if (pa !== pb) return pa - pb;
      const sa = statusRank[a.status.toLowerCase()] ?? 3;
      const sb = statusRank[b.status.toLowerCase()] ?? 3;
      return sa - sb;
    });

    // Take top 5 sprint tasks
    for (const t of notDone.slice(0, 5)) {
      priorities.push({
        title: t.summary,
        reasoning: `${t.key} — ${t.status} (${t.priority} priority), ${sprintStatus.daysRemaining} days left in sprint`,
        source: "Jira",
        url: t.url,
      });
    }
  }

  // 3. In-progress Paperclip tasks
  if (paperclipTasks) {
    for (const t of paperclipTasks.tasks.filter(
      (t) => t.status === "in_progress"
    )) {
      priorities.push({
        title: t.title,
        reasoning: `${t.identifier} in progress — keep momentum`,
        source: "Paperclip",
      });
    }
  }

  // 4. Todo Paperclip tasks (lower priority)
  if (paperclipTasks) {
    for (const t of paperclipTasks.tasks
      .filter((t) => t.status === "todo")
      .slice(0, 3)) {
      priorities.push({
        title: t.title,
        reasoning: `${t.identifier} queued — pick up when sprint work allows`,
        source: "Paperclip",
      });
    }
  }

  // Pick the most active side project as the "one next action"
  let sideProject: SideProjectAction | undefined;
  const activeRepos = (repoActivity || [])
    .filter((r: RepoActivity) => r.recentCommits > 0)
    .sort((a: RepoActivity, b: RepoActivity) => b.recentCommits - a.recentCommits);

  if (activeRepos.length > 0) {
    const top = activeRepos[0];
    const repoName = top.repo.split("/").pop() || top.repo;
    sideProject = {
      project: repoName,
      action: top.openPRs > 0
        ? `Review and merge ${top.openPRs} open PR${top.openPRs > 1 ? "s" : ""}`
        : `Continue momentum — ${top.recentCommits} commit${top.recentCommits > 1 ? "s" : ""} this week`,
      url: top.url,
    };
  } else if ((repoActivity || []).length > 0) {
    // No active repos — pick least stale as the one to push
    const sorted = [...(repoActivity || [])].sort(
      (a: RepoActivity, b: RepoActivity) => (a.daysSinceCommit ?? 999) - (b.daysSinceCommit ?? 999)
    );
    const pick = sorted[0];
    const repoName = pick.repo.split("/").pop() || pick.repo;
    sideProject = {
      project: repoName,
      action: `Stale ${pick.daysSinceCommit ?? "?"}d — pick one small task to re-engage`,
      url: pick.url,
    };
  }

  // Park stale repos (14+ days without commits)
  const parked: ParkedIdea[] = (repoActivity || [])
    .filter(
      (r: RepoActivity) =>
        r.daysSinceCommit !== null &&
        r.daysSinceCommit >= 14 &&
        r.repo !== sideProject?.project
    )
    .map((r: RepoActivity) => ({
      title: r.repo.split("/").pop() || r.repo,
      reason: `${r.daysSinceCommit}d stale — not this week`,
    }));

  // Build the week label
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  const weekOf = `Week of ${nextMonday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // Assemble email data
  const emailData: WeeklyAuditEmailData = {
    weekOf,
    sprintSummary: sprintStatus?.summary,
    priorities: priorities.slice(0, 7), // cap at 7 priorities
    sideProject,
    parked: parked.length > 0 ? parked : undefined,
    ...body.overrides,
  };

  if (body.dryRun) {
    const { subject, html } = renderWeeklyAuditEmail(emailData);
    return NextResponse.json({
      status: "dry_run",
      subject,
      emailData,
      htmlLength: html.length,
    });
  }

  // Send the email
  const { subject, html } = renderWeeklyAuditEmail(emailData);
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
    sourceSummary: {
      jira: sprintStatus
        ? `${sprintStatus.completed}/${sprintStatus.total} done`
        : "not configured",
      github: `${(repoActivity || []).length} repos tracked`,
      paperclip: paperclipTasks
        ? `${paperclipTasks.total} tasks`
        : "not configured",
    },
    priorityCount: emailData.priorities?.length || 0,
  });
}
