import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { detectAndFetchCompanyJobs } from "../lib/ats-clients.js";
import {
  fetchNewGradPostings,
  filterByKeywords,
  filterByTechFocus,
} from "../lib/newgrad-source.js";
import { readCompanyCache, upsertCompanyCache } from "../lib/company-cache.js";
import { JobPosting } from "../lib/schemas.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function filterJobs(
  jobs: JobPosting[],
  opts: { keywords?: string; remoteOnly?: boolean; location?: string }
): JobPosting[] {
  let out = jobs;
  if (opts.keywords) {
    const terms = opts.keywords.toLowerCase().split(/[,\s]+/).filter(Boolean);
    out = out.filter((j) =>
      terms.some((t) => `${j.title} ${j.description}`.toLowerCase().includes(t))
    );
  }
  if (opts.remoteOnly) {
    out = out.filter((j) => j.remote === true);
  }
  if (opts.location) {
    const loc = opts.location.toLowerCase();
    out = out.filter((j) => j.location?.toLowerCase().includes(loc));
  }
  return out;
}

export function registerJobSearchTools(server: McpServer) {
  server.registerTool(
    "search_jobs",
    {
      title: "Search jobs at a company",
      description:
        "Fetches open postings for ONE company by auto-detecting its ATS platform (Greenhouse, Lever, or Ashby). " +
        "Accepts either a bare company name (e.g. 'Stripe') or a careers-page URL " +
        "(e.g. https://boards.greenhouse.io/stripe, https://jobs.lever.co/company, https://jobs.ashbyhq.com/company). " +
        "Note: public ATS APIs are per-company -- there is no cross-company keyword search endpoint. " +
        "For keyword search across many companies at once, use search_jobs_newgrad instead.",
      inputSchema: {
        company: z.string().describe("Company name or careers-page URL"),
        keywords: z.string().optional().describe("Space/comma separated keywords to filter title+description"),
        remote_only: z.boolean().optional(),
        location: z.string().optional().describe("Substring to match against job location"),
      },
    },
    async ({ company, keywords, remote_only, location }) => {
      const result = await detectAndFetchCompanyJobs(company);
      if (!result) {
        return jsonResult({
          found: false,
          message: `Couldn't find a Greenhouse, Lever, or Ashby board for "${company}". Try passing the exact careers-page URL instead.`,
          jobs: [],
        });
      }
      await upsertCompanyCache({
        company,
        platform: result.platform,
        token: result.token,
        last_searched: new Date().toISOString(),
      });
      const filtered = filterJobs(result.jobs, { keywords, remoteOnly: remote_only, location });
      return jsonResult({
        found: true,
        platform: result.platform,
        board_token: result.token,
        total_postings: result.jobs.length,
        matching_postings: filtered.length,
        jobs: filtered.slice(0, 50),
      });
    }
  );

  server.registerTool(
    "search_jobs_newgrad",
    {
      title: "Search new-grad jobs across companies",
      description:
        "Searches the community-maintained SimplifyJobs New-Grad-Positions GitHub list, which aggregates " +
        "entry-level/new-grad roles across many companies -- this is the one source that supports real " +
        "cross-company keyword search (unlike search_jobs, which is per-company).",
      inputSchema: {
        keywords: z.string().optional().describe("Space/comma separated keywords to filter title+company"),
        tech_focus: z.enum(["ml", "data", "backend", "web"]).optional(),
      },
    },
    async ({ keywords, tech_focus }) => {
      const { jobs, error } = await fetchNewGradPostings();
      if (error) {
        return jsonResult({ found: false, message: error, jobs: [] });
      }
      let filtered = jobs;
      if (keywords) filtered = filterByKeywords(filtered, keywords);
      if (tech_focus) filtered = filterByTechFocus(filtered, tech_focus);
      return jsonResult({
        found: true,
        total_postings: jobs.length,
        matching_postings: filtered.length,
        jobs: filtered.slice(0, 50),
      });
    }
  );

  server.registerTool(
    "list_cached_companies",
    {
      title: "List previously searched companies",
      description:
        "Returns companies previously searched with search_jobs, along with which ATS platform/board token " +
        "was found for each -- useful for quickly re-searching without re-detecting the platform.",
      inputSchema: {},
    },
    async () => {
      const cache = await readCompanyCache();
      return jsonResult({ companies: cache });
    }
  );
}
