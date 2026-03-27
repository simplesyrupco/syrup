/**
 * Paperclip integration — fetch assigned tasks and projects.
 *
 * Env vars:
 *   PAPERCLIP_EA_URL — Paperclip API base URL
 *   PAPERCLIP_EA_KEY — API key for Paperclip
 *   PAPERCLIP_EA_COMPANY_ID — Company ID
 */

export interface PaperclipTask {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  projectName?: string;
}

export interface PaperclipTaskSummary {
  tasks: PaperclipTask[];
  inProgress: number;
  todo: number;
  blocked: number;
  total: number;
}

function isConfigured(): boolean {
  return !!(
    process.env.PAPERCLIP_EA_URL &&
    process.env.PAPERCLIP_EA_KEY &&
    process.env.PAPERCLIP_EA_COMPANY_ID
  );
}

export async function fetchPaperclipTasks(): Promise<PaperclipTaskSummary | null> {
  if (!isConfigured()) return null;

  const base = process.env.PAPERCLIP_EA_URL!;
  const key = process.env.PAPERCLIP_EA_KEY!;
  const companyId = process.env.PAPERCLIP_EA_COMPANY_ID!;

  const res = await fetch(
    `${base}/api/companies/${companyId}/issues?status=todo,in_progress,blocked`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const issues = Array.isArray(data) ? data : data.issues || data.data || [];

  const tasks: PaperclipTask[] = issues.map(
    (i: Record<string, unknown>) => ({
      id: i.id as string,
      identifier: i.identifier as string,
      title: i.title as string,
      status: i.status as string,
      priority: (i.priority as string) || "medium",
      projectName: (i as Record<string, unknown>).projectName as string | undefined,
    })
  );

  return {
    tasks,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    todo: tasks.filter((t) => t.status === "todo").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    total: tasks.length,
  };
}
