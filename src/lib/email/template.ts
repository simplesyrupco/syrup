/**
 * A3 Color Sidebar — Email Template Generator
 *
 * Generates HTML email in the approved A3 Color Sidebar design.
 * Each section has a colored left border for quick visual scanning.
 */

// ── Types ────────────────────────────────────────────────────────

export interface Task {
  summary: string;
  priority?: string;
  status?: string;
  url?: string;
}

export interface Blocker {
  summary: string;
  context?: string;
  url?: string;
}

export interface PR {
  title: string;
  number: number;
  url: string;
  reviewStatus?: "comments" | "needs_review" | "ready" | "draft";
}

export interface Sprint {
  name?: string;
  completed?: number;
  total?: number;
  daysRemaining?: number;
}

export interface VitallyEmailData {
  sprint?: Sprint;
  tasks?: Task[];
  blockers?: Blocker[];
  prs?: PR[];
}

export interface SideProject {
  name?: string;
  status?: string;
  tasks?: Task[];
}

export interface ShippedProject {
  name: string;
  action?: string;
  detail?: string;
  url?: string;
}

export interface CreativeProject {
  name: string;
  nextStep?: string;
  url?: string;
}

export interface SideProjectEmailData {
  sideProject?: SideProject;
  shipped?: ShippedProject[];
  creative?: CreativeProject | null;
  recentlyCompleted?: Task[];
}

export interface GiveUpProcessEmailData {
  projectName: string;
  repo?: string;
  daysSinceLastCommit?: number;
  daysSinceLastTaskUpdate?: number;
  lastCommitDate?: string;
  lastCommitMessage?: string;
}

// ── Constants ────────────────────────────────────────────────────

const COLORS = {
  blue: "#3B82F6",
  amber: "#F59E0B",
  red: "#EF4444",
  purple: "#8B5CF6",
  indigo: "#6366F1",
  teal: "#14B8A6",
  gray: "#6B7280",
  rose: "#F43F5E",
} as const;

const PRIORITY_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "#FEE2E2", text: "#991B1B", label: "Critical" },
  high: { bg: "#FEF3C7", text: "#92400E", label: "High" },
  medium: { bg: "#E0E7FF", text: "#3730A3", label: "Medium" },
  low: { bg: "#F3F4F6", text: "#374151", label: "Low" },
  review: { bg: "#F3E8FF", text: "#6B21A8", label: "Review" },
};

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const SHIPPING_STATUSES = new Set(["in progress", "in review", "to do"]);
const BUSYWORK_KEYWORDS = [
  "update docs", "rename", "cleanup", "clean up", "refactor",
  "reorganize", "formatting", "lint", "tidy", "housekeeping",
  "minor", "chore", "polish",
];

const TRIAGE_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  defer: { bg: "#F3F4F6", text: "#6B7280", label: "Defer" },
  delegate: { bg: "#EDE9FE", text: "#6B21A8", label: "Delegate" },
  busywork: { bg: "#FEF3C7", text: "#92400E", label: "Busywork" },
};

const STATUS_DOTS: Record<string, { color: string; label: string }> = {
  comments: { color: "#EF4444", label: "Has comments" },
  needs_review: { color: "#F59E0B", label: "Needs review" },
  ready: { color: "#22C55E", label: "Ready to merge" },
  draft: { color: "#9CA3AF", label: "Draft" },
};

// ── Helpers ──────────────────────────────────────────────────────

function sectionBlock(
  color: string,
  title: string,
  content: string,
  opts: { mobile?: boolean } = {}
): string {
  const width = opts.mobile ? "3px" : "4px";
  return `
    <div style="background:#FFFFFF;border-left:${width} solid ${color};border-radius:0 8px 8px 0;margin-bottom:${opts.mobile ? "12" : "16"}px;padding:${opts.mobile ? "12px 16px" : "16px 20px"};">
      <div style="font-size:${opts.mobile ? "10" : "11"}px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${color};margin-bottom:${opts.mobile ? "8" : "12"}px;">${title}</div>
      ${content}
    </div>`;
}

function badge(type: string): string {
  const b = PRIORITY_BADGES[type] || PRIORITY_BADGES.medium;
  return `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${b.bg};color:${b.text};margin-left:8px;vertical-align:middle;">${b.label}</span>`;
}

function statusDot(type: string): string {
  const d = STATUS_DOTS[type] || STATUS_DOTS.needs_review;
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${d.color};margin-right:8px;vertical-align:middle;" title="${d.label}"></span>`;
}

function progressBar(
  completed: number,
  total: number,
  color: string = COLORS.blue
): string {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="flex:1;background:#E5E7EB;border-radius:4px;height:8px;">
        <div style="background:${color};border-radius:4px;height:8px;width:${pct}%;"></div>
      </div>
      <span style="font-size:13px;font-weight:600;color:${color};">${pct}%</span>
    </div>`;
}

function linkWrap(text: string, url?: string): string {
  if (!url)
    return `<span style="font-size:14px;color:#1F2937;">${text}</span>`;
  return `<a href="${url}" style="font-size:14px;color:#1F2937;text-decoration:none;border-bottom:1px solid #E5E7EB;" target="_blank">${text}</a>`;
}

function taskRow(
  num: number,
  text: string,
  priority?: string,
  status?: string | null,
  url?: string
): string {
  const priorityBadge = priority ? badge(priority.toLowerCase()) : "";
  const statusBadge = status
    ? `<span style="display:inline-block;font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;background:#F3F4F6;color:#6B7280;margin-left:6px;">${status}</span>`
    : "";
  const label = url
    ? `<a href="${url}" style="font-size:14px;color:#1F2937;text-decoration:none;border-bottom:1px solid #E5E7EB;" target="_blank">${text}</a>`
    : `<span style="font-size:14px;color:#1F2937;">${text}</span>`;
  return `
    <div style="display:flex;align-items:baseline;padding:6px 0;border-bottom:1px solid #F3F4F6;">
      <span style="font-size:13px;font-weight:600;color:#9CA3AF;width:24px;flex-shrink:0;">${num}</span>
      <span style="flex:1;">${label}${priorityBadge}${statusBadge}</span>
    </div>`;
}

// ── Sprint Triage ────────────────────────────────────────────────

interface TriagedTask extends Task {
  recommendation?: "defer" | "delegate" | "busywork";
}

function triageScore(task: Task): number {
  const prio = PRIORITY_RANK[(task.priority || "medium").toLowerCase()] || 2;
  const statusBoost =
    task.status && SHIPPING_STATUSES.has(task.status.toLowerCase()) ? 1 : 0;
  return prio + statusBoost;
}

function isBusywork(task: Task): boolean {
  const text = task.summary.toLowerCase();
  return BUSYWORK_KEYWORDS.some((kw) => text.includes(kw));
}

function triageTasks(tasks: Task[]): {
  focus: Task[];
  rest: TriagedTask[];
} {
  const scored = tasks
    .map((t) => ({ task: t, score: triageScore(t), busy: isBusywork(t) }))
    .sort((a, b) => b.score - a.score);

  const focusCount = Math.min(3, Math.max(1, scored.filter((s) => s.score >= 4).length || 1));
  const focus = scored.slice(0, focusCount).map((s) => s.task);
  const rest: TriagedTask[] = scored.slice(focusCount).map((s) => {
    const rec: TriagedTask["recommendation"] = s.busy
      ? "busywork"
      : s.score <= 2
        ? "defer"
        : "delegate";
    return { ...s.task, recommendation: rec };
  });

  return { focus, rest };
}

function triageBadge(rec: TriagedTask["recommendation"]): string {
  if (!rec) return "";
  const b = TRIAGE_BADGES[rec];
  return `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${b.bg};color:${b.text};margin-left:8px;vertical-align:middle;">${b.label}</span>`;
}

function focusTaskRow(num: number, task: Task): string {
  const priorityBadge = task.priority ? badge(task.priority.toLowerCase()) : "";
  const label = task.url
    ? `<a href="${task.url}" style="font-size:14px;color:#1F2937;font-weight:700;text-decoration:none;border-bottom:1px solid #E5E7EB;" target="_blank">${task.summary}</a>`
    : `<span style="font-size:14px;color:#1F2937;font-weight:700;">${task.summary}</span>`;
  return `
    <div style="display:flex;align-items:baseline;padding:8px 0;border-bottom:1px solid #F3F4F6;">
      <span style="font-size:13px;font-weight:700;color:#3B82F6;width:24px;flex-shrink:0;">${num}</span>
      <span style="flex:1;">${label}${priorityBadge}</span>
    </div>`;
}

function deferredTaskRow(task: TriagedTask): string {
  const label = task.url
    ? `<a href="${task.url}" style="font-size:13px;color:#6B7280;text-decoration:none;border-bottom:1px solid #E5E7EB;" target="_blank">${task.summary}</a>`
    : `<span style="font-size:13px;color:#6B7280;">${task.summary}</span>`;
  return `
    <div style="display:flex;align-items:baseline;padding:4px 0;border-bottom:1px solid #F3F4F6;">
      <span style="flex:1;">${label}${triageBadge(task.recommendation)}</span>
    </div>`;
}

function emailWrapper(
  subject: string,
  bodyContent: string,
  mobile: boolean = false
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${subject}</title>
  <!--[if mso]><style>body{font-family:Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:${mobile ? "390" : "600"}px;margin:0 auto;padding:${mobile ? "16px 12px" : "24px 16px"};">
    ${bodyContent}
    <div style="text-align:center;padding:20px 0 8px;font-size:12px;color:#9CA3AF;">
      Reply to this email to update Paperclip &middot; <a href="https://paperclip.ing" style="color:#6366F1;text-decoration:none;">Paperclip</a>
    </div>
  </div>
</body>
</html>`;
}

// ── Vitally Email (9am / Noon) ──────────────────────────────────

export function renderVitallyEmail(data: VitallyEmailData): {
  subject: string;
  html: string;
} {
  const { sprint = {}, tasks = [], blockers = [], prs = [] } = data;

  const sprintName = sprint.name || "Current Sprint";
  const completed = sprint.completed || 0;
  const total = sprint.total || 0;
  const daysRemaining =
    sprint.daysRemaining != null ? sprint.daysRemaining : "?";
  const sprintContent = `
    ${progressBar(completed, total)}
    <div style="display:flex;justify-content:space-between;margin-top:8px;">
      <span style="font-size:13px;color:#6B7280;">${completed}/${total} complete</span>
      <span style="font-size:13px;color:#6B7280;">${daysRemaining} days remaining</span>
    </div>`;

  const useTriage = tasks.length > 5;

  let tasksSectionHtml: string;
  let triageRestHtml = "";
  let busyworkCallout = "";

  if (useTriage) {
    const { focus, rest } = triageTasks(tasks);

    const focusRows = focus
      .map((t, i) => focusTaskRow(i + 1, t))
      .join("");
    tasksSectionHtml = sectionBlock(
      COLORS.blue,
      `Focus — ${focus.length} item${focus.length > 1 ? "s" : ""} that move the needle`,
      focusRows
    );

    if (rest.length > 0) {
      const restRows = rest.map((t) => deferredTaskRow(t)).join("");
      triageRestHtml = sectionBlock(
        COLORS.gray,
        "Everything Else",
        restRows
      );
    }

    const busyworkItems = rest.filter((t) => t.recommendation === "busywork");
    if (busyworkItems.length > 0) {
      const names = busyworkItems.map((t) => `"${t.summary}"`).join(", ");
      busyworkCallout = sectionBlock(
        COLORS.amber,
        "Busywork Alert",
        `<div style="font-size:13px;color:#92400E;">${names} feel${busyworkItems.length === 1 ? "s" : ""} productive but won't ship anything. Skip or timebox.</div>`
      );
    }
  } else {
    const taskRows = tasks
      .map((t, i) => taskRow(i + 1, t.summary, t.priority, t.status, t.url))
      .join("");
    tasksSectionHtml = sectionBlock(
      COLORS.amber,
      "Today's Tasks",
      taskRows || '<p style="font-size:13px;color:#9CA3AF;">No tasks in sprint</p>'
    );
  }

  let blockerHtml = "";
  if (blockers.length > 0) {
    const blockerRows = blockers
      .map(
        (b) =>
          `<div style="padding:6px 0;border-bottom:1px solid #F3F4F6;">
        ${linkWrap(b.summary, b.url)}
        ${b.context ? `<div style="font-size:12px;color:#6B7280;margin-top:2px;">${b.context}</div>` : ""}
      </div>`
      )
      .join("");
    blockerHtml = sectionBlock(
      COLORS.red,
      "Blockers — Waiting on You",
      blockerRows
    );
  }

  let prHtml = "";
  if (prs.length > 0) {
    const prRows = prs
      .map((pr) => {
        const dot = statusDot(pr.reviewStatus || "needs_review");
        return `<div style="padding:6px 0;border-bottom:1px solid #F3F4F6;">
        ${dot}<a href="${pr.url}" style="font-size:14px;color:#1F2937;text-decoration:none;">${pr.title}</a>
        <span style="font-size:12px;color:#6B7280;margin-left:6px;">#${pr.number}</span>
      </div>`;
      })
      .join("");
    prHtml = sectionBlock(COLORS.purple, "PRs Needing Attention", prRows);
  }

  const body = [
    sectionBlock(COLORS.blue, `Sprint — ${sprintName}`, sprintContent),
    tasksSectionHtml,
    busyworkCallout,
    triageRestHtml,
    blockerHtml,
    prHtml,
  ]
    .filter(Boolean)
    .join("");

  const subject = `Vitally Briefing — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
  return { subject, html: emailWrapper(subject, body) };
}

// ── Side Project Email (5pm / Weekend 8am) ──────────────────────

export function renderSideProjectEmail(data: SideProjectEmailData): {
  subject: string;
  html: string;
} {
  const {
    sideProject = {},
    shipped = [],
    creative = null,
    recentlyCompleted = [],
  } = data;

  const spContent =
    (sideProject.tasks || [])
      .map((t, i) => taskRow(i + 1, t.summary, t.priority, null, t.url))
      .join("") ||
    '<p style="font-size:13px;color:#9CA3AF;">No active tasks</p>';

  const spBadge = sideProject.status
    ? `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:#E0E7FF;color:#3730A3;margin-left:8px;">${sideProject.status}</span>`
    : "";

  let completedHtml = "";
  if (recentlyCompleted.length > 0) {
    const rows = recentlyCompleted
      .map(
        (t) =>
          `<div style="padding:4px 0;border-bottom:1px solid #F3F4F6;">
        <span style="color:#22C55E;margin-right:6px;">&#10003;</span>
        ${linkWrap(t.summary, t.url)}
      </div>`
      )
      .join("");
    completedHtml = sectionBlock(COLORS.teal, "Recently Completed", rows);
  }

  let shippedHtml = "";
  if (shipped.length > 0) {
    const rows = shipped
      .map((s) => {
        const actionBadge = s.action
          ? `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:#FEF3C7;color:#92400E;margin-left:8px;">${s.action}</span>`
          : "";
        return `<div style="padding:6px 0;border-bottom:1px solid #F3F4F6;">
        ${linkWrap(s.name, s.url)}${actionBadge}
        ${s.detail ? `<div style="font-size:12px;color:#6B7280;margin-top:2px;">${s.detail}</div>` : ""}
      </div>`;
      })
      .join("");
    shippedHtml = sectionBlock(COLORS.gray, "Shipped Projects", rows);
  }

  let creativeHtml = "";
  if (creative) {
    const nameEl = creative.url
      ? `<a href="${creative.url}" style="font-size:14px;color:#1F2937;font-weight:500;text-decoration:none;border-bottom:1px solid #E5E7EB;" target="_blank">${creative.name}</a>`
      : `<div style="font-size:14px;color:#1F2937;font-weight:500;">${creative.name}</div>`;
    const creativeContent = `
      ${nameEl}
      ${creative.nextStep ? `<div style="font-size:13px;color:#6B7280;margin-top:4px;">Next: ${creative.nextStep}</div>` : ""}
    `;
    creativeHtml = sectionBlock(COLORS.rose, "Creative Project", creativeContent);
  }

  const body = [
    sectionBlock(
      COLORS.indigo,
      `Side Project — ${sideProject.name || "None"}${spBadge}`,
      spContent
    ),
    completedHtml,
    shippedHtml,
    creativeHtml,
  ]
    .filter(Boolean)
    .join("");

  const subject = `Side Projects — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
  return { subject, html: emailWrapper(subject, body) };
}

// ── Give-Up Process Email ────────────────────────────────────────

function giveUpQuestion(
  num: number,
  question: string,
  guidance: string,
  color: string
): string {
  return `
    <div style="display:flex;align-items:flex-start;padding:12px 0;border-bottom:1px solid #F3F4F6;">
      <span style="font-size:20px;font-weight:700;color:${color};width:32px;flex-shrink:0;">${num}</span>
      <div style="flex:1;">
        <div style="font-size:16px;font-weight:700;color:#1F2937;margin-bottom:4px;">${question}</div>
        <div style="font-size:13px;color:#6B7280;line-height:1.5;">${guidance}</div>
      </div>
    </div>`;
}

export function renderGiveUpProcessEmail(data: GiveUpProcessEmailData): {
  subject: string;
  html: string;
} {
  const {
    projectName,
    repo,
    daysSinceLastCommit,
    daysSinceLastTaskUpdate,
    lastCommitDate,
    lastCommitMessage,
  } = data;

  const staleDays = daysSinceLastCommit ?? daysSinceLastTaskUpdate ?? 14;

  const staleSummary = [
    daysSinceLastCommit != null
      ? `${daysSinceLastCommit} days since last commit`
      : null,
    daysSinceLastTaskUpdate != null
      ? `${daysSinceLastTaskUpdate} days since last task update`
      : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const lastCommitInfo =
    lastCommitDate || lastCommitMessage
      ? `<div style="font-size:12px;color:#9CA3AF;margin-top:4px;">${
          lastCommitMessage
            ? `Last commit: "${lastCommitMessage}"`
            : ""
        }${lastCommitDate ? ` on ${lastCommitDate}` : ""}</div>`
      : "";

  const alertContent = `
    <div style="font-size:14px;color:#991B1B;font-weight:600;margin-bottom:4px;">
      ${projectName} has been idle for ${staleDays} days.
    </div>
    <div style="font-size:13px;color:#6B7280;">
      ${staleSummary}${repo ? ` &middot; ${repo}` : ""}
    </div>
    ${lastCommitInfo}`;

  const questionsContent = [
    giveUpQuestion(
      1,
      "Bored?",
      "Not a valid reason to quit. Boredom is the middle of every project. Push through to the other side.",
      COLORS.amber
    ),
    giveUpQuestion(
      2,
      "Bad idea?",
      "Valid reason. Document why it failed, what you learned, and close it. No shame in killing a bad bet early.",
      COLORS.teal
    ),
    giveUpQuestion(
      3,
      "Better project waiting?",
      "Requires real reasoning, not shiny-object energy. Write down specifically what makes the new project better and what makes this one worse.",
      COLORS.purple
    ),
  ].join("");

  const outcomeContent = `
    <div style="padding:6px 0;border-bottom:1px solid #F3F4F6;">
      <span style="font-size:13px;font-weight:600;color:${COLORS.blue};">Recommit</span>
      <span style="font-size:13px;color:#6B7280;margin-left:8px;">Reset the clock. Pick one next action and do it today.</span>
    </div>
    <div style="padding:6px 0;border-bottom:1px solid #F3F4F6;">
      <span style="font-size:13px;font-weight:600;color:${COLORS.red};">Give Up</span>
      <span style="font-size:13px;color:#6B7280;margin-left:8px;">Archive the repo. Write a post-mortem. Move on.</span>
    </div>
    <div style="padding:6px 0;">
      <span style="font-size:13px;font-weight:600;color:${COLORS.amber};">Pause</span>
      <span style="font-size:13px;color:#6B7280;margin-left:8px;">Set a hard restart date. If you don't restart by then, it's dead.</span>
    </div>`;

  const body = [
    sectionBlock(COLORS.red, "Stale Project Alert", alertContent),
    sectionBlock(COLORS.indigo, "The Give-Up Process", questionsContent),
    sectionBlock(COLORS.gray, "Your Options", outcomeContent),
  ].join("");

  const subject = `Give-Up Process — ${projectName}`;
  return { subject, html: emailWrapper(subject, body) };
}

// ── Weekly Priority Audit Email (Sunday 6pm) ────────────────────

export interface WeeklyPriority {
  title: string;
  reasoning: string;
  source?: string;
  url?: string;
}

export interface SideProjectAction {
  project: string;
  action: string;
  url?: string;
}

export interface ParkedIdea {
  title: string;
  reason?: string;
}

export interface WeeklyAuditEmailData {
  weekOf?: string;
  priorities?: WeeklyPriority[];
  sideProject?: SideProjectAction;
  parked?: ParkedIdea[];
  sprintSummary?: string;
}

export function renderWeeklyAuditEmail(data: WeeklyAuditEmailData): {
  subject: string;
  html: string;
} {
  const {
    weekOf,
    priorities = [],
    sideProject,
    parked = [],
    sprintSummary,
  } = data;

  const weekLabel =
    weekOf ||
    `Week of ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // Sprint summary (optional overview)
  let sprintHtml = "";
  if (sprintSummary) {
    sprintHtml = sectionBlock(
      COLORS.blue,
      "Sprint Status",
      `<p style="font-size:14px;color:#1F2937;margin:0;line-height:1.5;">${sprintSummary}</p>`
    );
  }

  // Top priorities section
  let prioritiesHtml = "";
  if (priorities.length > 0) {
    const rows = priorities
      .map((p, i) => {
        const sourceTag = p.source
          ? `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:#E0E7FF;color:#3730A3;margin-left:8px;">${p.source}</span>`
          : "";
        const label = p.url
          ? `<a href="${p.url}" style="font-size:14px;font-weight:600;color:#1F2937;text-decoration:none;border-bottom:1px solid #E5E7EB;" target="_blank">${p.title}</a>`
          : `<span style="font-size:14px;font-weight:600;color:#1F2937;">${p.title}</span>`;
        return `
          <div style="padding:8px 0;${i < priorities.length - 1 ? "border-bottom:1px solid #F3F4F6;" : ""}">
            <div style="display:flex;align-items:baseline;">
              <span style="font-size:18px;font-weight:700;color:${COLORS.amber};width:28px;flex-shrink:0;">${i + 1}</span>
              <span>${label}${sourceTag}</span>
            </div>
            <div style="font-size:13px;color:#6B7280;margin-top:4px;padding-left:28px;">${p.reasoning}</div>
          </div>`;
      })
      .join("");
    prioritiesHtml = sectionBlock(COLORS.amber, "This Week's Priorities", rows);
  } else {
    prioritiesHtml = sectionBlock(
      COLORS.amber,
      "This Week's Priorities",
      '<p style="font-size:13px;color:#9CA3AF;">No priorities set</p>'
    );
  }

  // Side project next action
  let sideProjectHtml = "";
  if (sideProject) {
    const nameEl = sideProject.url
      ? `<a href="${sideProject.url}" style="font-size:14px;font-weight:600;color:#1F2937;text-decoration:none;border-bottom:1px solid #E5E7EB;" target="_blank">${sideProject.project}</a>`
      : `<span style="font-size:14px;font-weight:600;color:#1F2937;">${sideProject.project}</span>`;
    sideProjectHtml = sectionBlock(
      COLORS.indigo,
      "Side Project — One Next Action",
      `<div>${nameEl}</div>
       <div style="font-size:13px;color:#6B7280;margin-top:6px;">→ ${sideProject.action}</div>`
    );
  }

  // Park these — ideas to ignore
  let parkedHtml = "";
  if (parked.length > 0) {
    const rows = parked
      .map(
        (p) =>
          `<div style="padding:4px 0;border-bottom:1px solid #F3F4F6;">
            <span style="font-size:14px;color:#6B7280;">✗ ${p.title}</span>
            ${p.reason ? `<span style="font-size:12px;color:#9CA3AF;margin-left:8px;">— ${p.reason}</span>` : ""}
          </div>`
      )
      .join("");
    parkedHtml = sectionBlock(COLORS.gray, "Park These — Ignore This Week", rows);
  }

  const body = [sprintHtml, prioritiesHtml, sideProjectHtml, parkedHtml]
    .filter(Boolean)
    .join("");

  const subject = `Weekly Priority Audit — ${weekLabel}`;
  return { subject, html: emailWrapper(subject, body) };
}
