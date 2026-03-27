/**
 * GitHub integration — fetch recent activity for side project repos.
 *
 * Env vars:
 *   GITHUB_TOKEN — Personal access token (optional, falls back to unauthenticated)
 *   GITHUB_SIDE_REPOS — Comma-separated list of owner/repo to track
 */

export interface RepoActivity {
  repo: string;
  lastCommitDate: string | null;
  daysSinceCommit: number | null;
  lastCommitMessage: string | null;
  openPRs: number;
  recentCommits: number; // commits in last 7 days
  url: string;
}

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchRepoActivity(repo: string): Promise<RepoActivity> {
  const headers = githubHeaders();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent commits (last 7 days)
  const commitsRes = await fetch(
    `https://api.github.com/repos/${repo}/commits?since=${sevenDaysAgo}&per_page=100`,
    { headers }
  );
  const commits = commitsRes.ok ? await commitsRes.json() : [];

  // Fetch latest commit for staleness
  const latestRes = await fetch(
    `https://api.github.com/repos/${repo}/commits?per_page=1`,
    { headers }
  );
  const latest = latestRes.ok ? await latestRes.json() : [];
  const lastCommitDate = latest[0]?.commit?.committer?.date || null;
  const lastCommitMessage = latest[0]?.commit?.message?.split("\n")[0] || null;
  const daysSinceCommit = lastCommitDate
    ? Math.floor(
        (Date.now() - new Date(lastCommitDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  // Fetch open PRs
  const prsRes = await fetch(
    `https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`,
    { headers }
  );
  const prs = prsRes.ok ? await prsRes.json() : [];

  return {
    repo,
    lastCommitDate,
    daysSinceCommit,
    lastCommitMessage,
    openPRs: Array.isArray(prs) ? prs.length : 0,
    recentCommits: Array.isArray(commits) ? commits.length : 0,
    url: `https://github.com/${repo}`,
  };
}

export async function fetchSideProjectActivity(
  repos?: string[]
): Promise<RepoActivity[]> {
  const repoList =
    repos ||
    (process.env.GITHUB_SIDE_REPOS
      ? process.env.GITHUB_SIDE_REPOS.split(",").map((r) => r.trim())
      : []);

  if (repoList.length === 0) return [];

  return Promise.all(repoList.map(fetchRepoActivity));
}
