import { JobPosting } from "./schemas.js";
import { stripHtml } from "./html.js";

const FETCH_TIMEOUT_MS = 10_000;

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "job-application-mcp/0.1" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Candidate ATS "board tokens" to try for a company name, cheapest/most-likely first. */
export function candidateTokens(company: string): string[] {
  const lower = company.trim().toLowerCase();
  const noSpace = lower.replace(/[^a-z0-9]+/g, "");
  const hyphenated = lower.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return Array.from(new Set([noSpace, hyphenated])).filter(Boolean);
}

export type AtsPlatform = "greenhouse" | "lever" | "ashby" | "unknown";

interface AtsUrlHint {
  platform: AtsPlatform;
  token: string;
}

/** If given a careers-page URL rather than a bare company name, extract platform + token directly. */
export function parseAtsUrl(input: string): AtsUrlHint | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    return segments[0] ? { platform: "greenhouse", token: segments[0] } : null;
  }
  if (host === "jobs.lever.co") {
    return segments[0] ? { platform: "lever", token: segments[0] } : null;
  }
  if (host === "jobs.ashbyhq.com") {
    return segments[0] ? { platform: "ashby", token: segments[0] } : null;
  }
  return null;
}

function normalizeGreenhouse(company: string, job: any): JobPosting {
  return {
    id: `greenhouse:${job.id}`,
    company,
    title: job.title ?? "Unknown title",
    location: job.location?.name ?? null,
    remote: job.location?.name
      ? /remote/i.test(job.location.name)
      : null,
    salary_min: null,
    salary_max: null,
    posting_date: job.updated_at ?? null,
    apply_url: job.absolute_url ?? "",
    description: job.content ? stripHtml(job.content) : "",
    ats_platform: "greenhouse",
  };
}

function normalizeLever(company: string, job: any): JobPosting {
  const location = job.categories?.location ?? null;
  const salaryRange = job.salaryRange ?? job.salaryDescription ?? null;
  return {
    id: `lever:${job.id}`,
    company,
    title: job.text ?? "Unknown title",
    location,
    remote:
      job.workplaceType === "remote"
        ? true
        : job.workplaceType
        ? false
        : location
        ? /remote/i.test(location)
        : null,
    salary_min: typeof salaryRange?.min === "number" ? salaryRange.min : null,
    salary_max: typeof salaryRange?.max === "number" ? salaryRange.max : null,
    posting_date: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    apply_url: job.applyUrl ?? job.hostedUrl ?? "",
    description: job.descriptionPlain
      ? job.descriptionPlain
      : job.description
      ? stripHtml(job.description)
      : "",
    ats_platform: "lever",
  };
}

function normalizeAshby(company: string, job: any): JobPosting {
  const comp = job.compensationTierSummary ?? null;
  return {
    id: `ashby:${job.id}`,
    company,
    title: job.title ?? "Unknown title",
    location: job.location ?? job.address?.postalAddress?.addressLocality ?? null,
    remote: typeof job.isRemote === "boolean" ? job.isRemote : null,
    salary_min: null,
    salary_max: null,
    posting_date: job.publishedDate ?? null,
    apply_url: job.applyUrl ?? job.jobUrl ?? "",
    description: job.descriptionPlain
      ? job.descriptionPlain
      : job.descriptionHtml
      ? stripHtml(job.descriptionHtml)
      : comp ?? "",
    ats_platform: "ashby",
  };
}

async function tryGreenhouse(
  company: string,
  token: string
): Promise<JobPosting[] | null> {
  const data = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
  );
  if (!data?.jobs || !Array.isArray(data.jobs)) return null;
  return data.jobs.map((j: any) => normalizeGreenhouse(company, j));
}

async function tryLever(
  company: string,
  token: string
): Promise<JobPosting[] | null> {
  const data = await fetchJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`
  );
  if (!Array.isArray(data)) return null;
  return data.map((j: any) => normalizeLever(company, j));
}

async function tryAshby(
  company: string,
  token: string
): Promise<JobPosting[] | null> {
  const data = await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`
  );
  if (!data?.jobs || !Array.isArray(data.jobs)) return null;
  return data.jobs.map((j: any) => normalizeAshby(company, j));
}

export interface AtsSearchResult {
  platform: AtsPlatform;
  token: string;
  jobs: JobPosting[];
}

/**
 * Given a company name OR a careers-page URL (boards.greenhouse.io/..,
 * jobs.lever.co/.., jobs.ashbyhq.com/..), figures out which ATS the
 * company uses and returns its full postings list. Tries candidate board
 * tokens against all three platforms since there's no public "search by
 * company name" endpoint across ATSs.
 */
export async function detectAndFetchCompanyJobs(
  companyOrUrl: string
): Promise<AtsSearchResult | null> {
  const urlHint = parseAtsUrl(companyOrUrl);
  if (urlHint) {
    const jobs =
      urlHint.platform === "greenhouse"
        ? await tryGreenhouse(companyOrUrl, urlHint.token)
        : urlHint.platform === "lever"
        ? await tryLever(companyOrUrl, urlHint.token)
        : await tryAshby(companyOrUrl, urlHint.token);
    if (jobs) return { platform: urlHint.platform, token: urlHint.token, jobs };
    return null;
  }

  const tokens = candidateTokens(companyOrUrl);
  for (const token of tokens) {
    const [gh, lv, ab] = await Promise.all([
      tryGreenhouse(companyOrUrl, token),
      tryLever(companyOrUrl, token),
      tryAshby(companyOrUrl, token),
    ]);
    if (gh && gh.length > 0) return { platform: "greenhouse", token, jobs: gh };
    if (lv && lv.length > 0) return { platform: "lever", token, jobs: lv };
    if (ab && ab.length > 0) return { platform: "ashby", token, jobs: ab };
  }
  return null;
}
