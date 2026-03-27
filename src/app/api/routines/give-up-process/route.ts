import { NextRequest, NextResponse } from "next/server";
import { resend, EMAIL_TO, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/resend";
import {
  renderGiveUpProcessEmail,
  type GiveUpProcessEmailData,
} from "@/lib/email/template";
import { requireAuth } from "@/lib/auth";

const STALE_THRESHOLD_DAYS = 14;

async function getLastCommitInfo(
  repo: string
): Promise<{ date: string; message: string; daysAgo: number } | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "syrup-give-up-process",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?per_page=1`,
    { headers }
  );

  if (!res.ok) return null;

  const commits = await res.json();
  if (!commits.length) return null;

  const commit = commits[0];
  const commitDate = new Date(commit.commit.author.date);
  const now = new Date();
  const daysAgo = Math.floor(
    (now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    date: commitDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    message: commit.commit.message.split("\n")[0].slice(0, 80),
    daysAgo,
  };
}

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const { repo, projectName } = body as {
    repo: string;
    projectName?: string;
  };

  if (!repo) {
    return NextResponse.json(
      { error: "Missing required field: repo (e.g. 'owner/repo')" },
      { status: 400 }
    );
  }

  const name = projectName || repo.split("/").pop() || repo;

  const commitInfo = await getLastCommitInfo(repo);

  if (!commitInfo) {
    return NextResponse.json(
      { error: `Could not fetch commit data for ${repo}` },
      { status: 502 }
    );
  }

  if (commitInfo.daysAgo < STALE_THRESHOLD_DAYS) {
    return NextResponse.json({
      status: "healthy",
      project: name,
      daysSinceLastCommit: commitInfo.daysAgo,
      message: `Project is active — last commit ${commitInfo.daysAgo} day(s) ago.`,
    });
  }

  const emailData: GiveUpProcessEmailData = {
    projectName: name,
    repo,
    daysSinceLastCommit: commitInfo.daysAgo,
    lastCommitDate: commitInfo.date,
    lastCommitMessage: commitInfo.message,
  };

  const { subject, html } = renderGiveUpProcessEmail(emailData);

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
    status: "stale",
    project: name,
    daysSinceLastCommit: commitInfo.daysAgo,
    emailId: emailResult?.id,
    message: `Give-Up Process email sent — ${name} has been idle for ${commitInfo.daysAgo} days.`,
  });
}
