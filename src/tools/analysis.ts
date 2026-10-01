import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeJobPosting, compareSkillsGap, scoreAtsMatch } from "../lib/keyword-extraction.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerAnalysisTools(server: McpServer) {
  server.registerTool(
    "analyze_job_posting",
    {
      title: "Analyze a job posting",
      description:
        "Deterministic (non-AI) extraction from pasted job posting text: requirement bullets, recognized tech " +
        "keywords, seniority signal, salary range if present, and red flags (e.g. '5+ years required', 'no " +
        "sponsorship'). This is objective extraction only -- judging fit against Mikael's actual background is " +
        "your job as the calling assistant. CANDIDATE FACT (permanent): Mikael is a full US citizen -- he " +
        "never requires visa sponsorship and is eligible for any clearance a role sponsors, so " +
        "'must be authorized to work in the US', 'no sponsorship', and 'must be able to obtain a " +
        "clearance' are NOT disqualifiers for him and are deliberately not reported as red flags. " +
        "Use this output plus load_master_resume to judge fit.",
      inputSchema: {
        job_posting_text: z.string().min(20),
      },
    },
    async ({ job_posting_text }) => {
      return jsonResult(analyzeJobPosting(job_posting_text));
    }
  );

  server.registerTool(
    "compare_skills_gap",
    {
      title: "Compare resume skills vs job posting",
      description:
        "Deterministic gap analysis between the resume's Skills section text and a job posting's text: which " +
        "recognized skills match, and which are missing (roughly classified critical vs nice-to-have based on " +
        "surrounding language like 'required'/'must have' vs 'preferred'/'a plus').",
      inputSchema: {
        resume_skills_text: z.string().describe("The Skills section text, e.g. from load_master_resume's sections.skills"),
        job_posting_text: z.string().min(20),
      },
    },
    async ({ resume_skills_text, job_posting_text }) => {
      return jsonResult(compareSkillsGap(resume_skills_text, job_posting_text));
    }
  );

  server.registerTool(
    "score_ats_match",
    {
      title: "Score ATS keyword match",
      description:
        "Deterministic keyword-coverage score (0-1) between resume text and a job posting: fraction of the job's " +
        "recognized tech keywords that also appear in the resume. This approximates ATS keyword screening -- it " +
        "is NOT an AI judgment of overall fit.",
      inputSchema: {
        resume_text: z.string().describe("Full resume text, or just the tailored sections"),
        job_posting_text: z.string().min(20),
      },
    },
    async ({ resume_text, job_posting_text }) => {
      return jsonResult(scoreAtsMatch(resume_text, job_posting_text));
    }
  );
}
