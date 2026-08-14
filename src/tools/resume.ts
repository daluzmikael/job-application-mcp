import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadMasterResume, parseSkillCategories, flattenSkills } from "../lib/resume-parser.js";
import { DATA_DIR, MASTER_RESUME_PATH, companyFolderPath, resumePdfFileName } from "../lib/paths.js";
import { listAllApplications, ensureCompanyFolder } from "../lib/applications-store.js";
import { generateResumePdf } from "../lib/pdf-generator.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const DEFAULT_NAME = "Mikael Daluz";
const DEFAULT_CONTACT_LINE =
  "Westford, MA 01886 | Remote / Open to SF | 978-751-2683 | daluzmikael@outlook.com | https://www.linkedin.com/in/mikaeldaluz/";

export function registerResumeTools(server: McpServer) {
  server.registerTool(
    "load_master_resume",
    {
      title: "Load master resume",
      description:
        `Parses ${MASTER_RESUME_PATH} and returns its Objective/Education/Skills/Relevant Projects sections ` +
        "(Mikael's resume has no Experience section), plus a flattened skills list. Use this as the source of " +
        "truth before tailoring a resume for a specific job.",
      inputSchema: {},
    },
    async () => {
      try {
        await fs.access(MASTER_RESUME_PATH);
      } catch {
        return jsonResult({
          found: false,
          message: `No master resume found at ${MASTER_RESUME_PATH}.`,
        });
      }
      const sections = await loadMasterResume(MASTER_RESUME_PATH);
      const skillCategories = parseSkillCategories(sections.skills);
      const allSkillsFlat = flattenSkills(skillCategories);
      return jsonResult({
        found: true,
        path: MASTER_RESUME_PATH,
        sections: {
          objective: sections.objective,
          education: sections.education,
          skills: sections.skills,
          projects: sections.projects,
        },
        skill_categories: skillCategories,
        all_skills_flat: allSkillsFlat,
      });
    }
  );

  server.registerTool(
    "load_previous_applications",
    {
      title: "Load previous applications",
      description:
        "Returns applications previously logged via log_application (reads metadata.json from each company " +
        "folder in ~/Documents/Resume). Pre-existing folders from before this tool existed won't appear here " +
        "since they have no metadata.json.",
      inputSchema: {
        limit: z.number().int().positive().max(200).optional().default(10),
      },
    },
    async ({ limit }) => {
      const all = await listAllApplications();
      return jsonResult({ total: all.length, applications: all.slice(0, limit) });
    }
  );

  server.registerTool(
    "list_tailored_resumes",
    {
      title: "List tailored resumes",
      description:
        "Scans ~/Documents/Resume for company folders containing a generated *_resume.pdf, so you can browse " +
        "and reuse existing tailored versions instead of regenerating from scratch.",
      inputSchema: {},
    },
    async () => {
      const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
      const results: { company: string; pdf_path: string; role: string | null; ats_score: number | null }[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(DATA_DIR, entry.name);
        const files = await fs.readdir(dir).catch(() => [] as string[]);
        const pdf = files.find((f) => f.toLowerCase().endsWith("_resume.pdf"));
        if (!pdf) continue;
        let role: string | null = null;
        let ats_score: number | null = null;
        try {
          const meta = JSON.parse(await fs.readFile(path.join(dir, "metadata.json"), "utf-8"));
          role = meta.role ?? null;
          ats_score = meta.ats_score ?? null;
        } catch {
          // no metadata.json for this folder -- still list the PDF
        }
        results.push({ company: entry.name, pdf_path: path.join(dir, pdf), role, ats_score });
      }
      return jsonResult({ resumes: results });
    }
  );

  const skillCategorySchema = z.object({
    category: z.string(),
    skills: z.array(z.string()),
  });

  const projectSchema = z.object({
    header: z.string().describe("Project title line, e.g. 'DataSport — AI-Powered NBA Analytics Platform'"),
    subheader: z.string().optional().describe("Context/date line under the title"),
    bullets: z.array(z.string()),
  });

  server.registerTool(
    "generate_tailored_resume",
    {
      title: "Generate a tailored resume PDF",
      description:
        "Renders a one-page resume PDF from FINAL, already-tailored section content (you write the tailored " +
        "objective/skills/project text yourself using load_master_resume + the job posting -- this tool only " +
        "renders and saves it). Saves to ~/Documents/Resume/{Company}/{company}_resume.pdf per Mikael's existing " +
        "folder convention, creating the company folder if needed.",
      inputSchema: {
        company: z.string(),
        name: z.string().optional().default(DEFAULT_NAME),
        contact_line: z.string().optional().default(DEFAULT_CONTACT_LINE),
        objective: z.string(),
        education_lines: z.array(z.string()).min(1),
        skill_categories: z.array(skillCategorySchema).min(1),
        projects: z.array(projectSchema).min(1),
      },
    },
    async ({ company, name, contact_line, objective, education_lines, skill_categories, projects }) => {
      await ensureCompanyFolder(company);
      const pdfBytes = await generateResumePdf({
        name: name ?? DEFAULT_NAME,
        contactLine: contact_line ?? DEFAULT_CONTACT_LINE,
        objective,
        education: education_lines,
        skillCategories: skill_categories,
        projects: projects.map((p) => ({ header: p.header, subheader: p.subheader, bullets: p.bullets })),
      });
      const outPath = path.join(companyFolderPath(company), resumePdfFileName(company));
      await fs.writeFile(outPath, pdfBytes);
      return jsonResult({
        tailored_pdf_path: outPath,
        skill_category_count: skill_categories.length,
        project_count: projects.length,
      });
    }
  );
}
