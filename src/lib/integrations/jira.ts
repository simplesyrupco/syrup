/**
 * Jira integration — fetch active sprint status and tasks.
 *
 * Env vars:
 *   JIRA_BASE_URL  — e.g. https://yourorg.atlassian.net
 *   JIRA_EMAIL     — Atlassian account email
 *   JIRA_API_TOKEN — Atlassian API token
 *   JIRA_BOARD_ID  — Board ID to pull active sprint from
 */

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    priority?: { name: string };
    status?: { name: string };
    assignee?: { displayName: string };
  };
}

interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface SprintStatus {
  sprintName: string;
  summary: string;
  tasks: {
    key: string;
    summary: string;
    priority: string;
    status: string;
    url: string;
  }[];
  completed: number;
  total: number;
  daysRemaining: number;
}

function jiraHeaders(): HeadersInit {
  const email = process.env.JIRA_EMAIL!;
  const token = process.env.JIRA_API_TOKEN!;
  return {
    Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
    Accept: "application/json",
  };
}

function isConfigured(): boolean {
  return !!(
    process.env.JIRA_BASE_URL &&
    process.env.JIRA_EMAIL &&
    process.env.JIRA_API_TOKEN &&
    process.env.JIRA_BOARD_ID
  );
}

export async function fetchActiveSprintStatus(): Promise<SprintStatus | null> {
  if (!isConfigured()) return null;

  const base = process.env.JIRA_BASE_URL!;
  const boardId = process.env.JIRA_BOARD_ID!;
  const headers = jiraHeaders();

  // Get active sprint
  const sprintRes = await fetch(
    `${base}/rest/agile/1.0/board/${boardId}/sprint?state=active`,
    { headers }
  );
  if (!sprintRes.ok) return null;

  const sprintData = await sprintRes.json();
  const sprint: JiraSprint | undefined = sprintData.values?.[0];
  if (!sprint) return null;

  // Get sprint issues
  const issuesRes = await fetch(
    `${base}/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=50&fields=summary,priority,status,assignee`,
    { headers }
  );
  if (!issuesRes.ok) return null;

  const issuesData = await issuesRes.json();
  const issues: JiraIssue[] = issuesData.issues || [];

  const doneStatuses = new Set(["done", "closed", "resolved", "complete"]);
  const completed = issues.filter((i) =>
    doneStatuses.has(i.fields.status?.name?.toLowerCase() || "")
  ).length;

  const daysRemaining = sprint.endDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(sprint.endDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const pct = issues.length > 0 ? Math.round((completed / issues.length) * 100) : 0;
  const summary = `${sprint.name}: ${completed}/${issues.length} done (${pct}%), ${daysRemaining} days left`;

  return {
    sprintName: sprint.name,
    summary,
    tasks: issues.map((i) => ({
      key: i.key,
      summary: i.fields.summary,
      priority: i.fields.priority?.name || "Medium",
      status: i.fields.status?.name || "Unknown",
      url: `${base}/browse/${i.key}`,
    })),
    completed,
    total: issues.length,
    daysRemaining,
  };
}
