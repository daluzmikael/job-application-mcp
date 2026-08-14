import { JobPosting } from "./schemas.js";

const README_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md";
const FETCH_TIMEOUT_MS = 15_000;

export interface NewGradFetchResult {
  jobs: JobPosting[];
  error: string | null;
}

const TECH_FOCUS_KEYWORDS: Record<string, string[]> = {
  ml: ["machine learning", "ml engineer", "ai engineer", " ai ", "artificial intelligence", "llm"],
  data: ["data engineer", "data scientist", "data analyst", "analytics"],
  backend: ["backend", "back-end", "server", "platform engineer", "infrastructure"],
  web: ["frontend", "front-end", "full stack", "fullstack", "web developer", "ui engineer"],
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** First real (non-tracking-pixel) href in a cell -- the README puts the actual apply link first, then a Simplify tracking link. */
function extractUrl(cell: string): string {
  const hrefMatches = [...cell.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)];
  if (hrefMatches.length > 0) return decodeEntities(hrefMatches[0][1]);
  const mdLink = cell.match(/\]\((https?:\/\/[^\s)]+)\)/);
  if (mdLink) return decodeEntities(mdLink[1]);
  const bare = cell.match(/https?:\/\/[^\s)]+/);
  if (bare) return decodeEntities(bare[0]);
  return "";
}

function stripMarkdown(cell: string): string {
  return cell
    .replace(/<\/?br\s*\/?>/gi, "; ")
    .replace(/<\/details>/gi, "")
    .replace(/<summary>[\s\S]*?<\/summary>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/[🔒🇺🇸🛂👉↳🔥🎓]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isClosed(row: string): boolean {
  return /🔒/.test(row);
}

/**
 * Fetches and parses the SimplifyJobs New-Grad-Positions README job tables.
 * As of the current README, postings live in raw HTML <table> blocks (one
 * per category), not markdown pipe-tables, with rows like:
 *   <tr><td>Company</td><td>Role</td><td>Location</td><td>Application links</td><td>Age</td></tr>
 * A "↳" company cell means "same company as the row above" (carry-forward).
 * This is the one source that genuinely supports cross-company keyword
 * search (Greenhouse/Lever/Ashby only support fetching one known company
 * at a time -- see ats-clients.ts).
 */
export async function fetchNewGradPostings(): Promise<NewGradFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let text: string;
  try {
    const res = await fetch(README_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "job-application-mcp/0.1" },
    });
    if (!res.ok) {
      return { jobs: [], error: `GitHub returned HTTP ${res.status}` };
    }
    text = await res.text();
  } catch (err: any) {
    return { jobs: [], error: `Fetch failed: ${err?.message ?? String(err)}` };
  } finally {
    clearTimeout(timer);
  }

  const jobs: JobPosting[] = [];
  let lastCompany = "";
  let idx = 0;

  const rowMatches = text.matchAll(/<tr>([\s\S]*?)<\/tr>/gi);
  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    if (/<th[\s>]/i.test(rowHtml)) continue; // header row

    const cellMatches = [...rowHtml.matchAll(/<td>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cellMatches.length < 5) continue;

    if (isClosed(rowHtml)) continue;

    const rawCompany = stripMarkdown(cellMatches[0]);
    const company = rawCompany.length > 0 ? rawCompany : lastCompany;
    if (rawCompany.length > 0) lastCompany = rawCompany;
    if (!company) continue;

    const title = stripMarkdown(cellMatches[1]);
    const location = stripMarkdown(cellMatches[2]) || null;
    const applyUrl = extractUrl(cellMatches[3] ?? "");
    const datePosted = cellMatches[4] ? stripMarkdown(cellMatches[4]) : null;

    if (!title || !applyUrl) continue;

    idx += 1;
    jobs.push({
      id: `newgrad:${idx}:${company}:${title}`.slice(0, 200),
      company,
      title,
      location,
      remote: location ? /remote/i.test(location) : null,
      salary_min: null,
      salary_max: null,
      posting_date: datePosted,
      apply_url: applyUrl,
      description: "",
      ats_platform: "unknown",
    });
  }

  return { jobs, error: null };
}

export function filterByKeywords(jobs: JobPosting[], keywords: string): JobPosting[] {
  const terms = keywords
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  if (terms.length === 0) return jobs;
  return jobs.filter((j) => {
    const haystack = `${j.title} ${j.company}`.toLowerCase();
    return terms.some((t) => haystack.includes(t));
  });
}

export function filterByTechFocus(jobs: JobPosting[], techFocus: string): JobPosting[] {
  const keywords = TECH_FOCUS_KEYWORDS[techFocus.toLowerCase()];
  if (!keywords) return jobs;
  return jobs.filter((j) => {
    const haystack = ` ${j.title.toLowerCase()} `;
    return keywords.some((k) => haystack.includes(k));
  });
}
