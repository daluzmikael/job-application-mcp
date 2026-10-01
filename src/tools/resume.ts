import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadMasterResume, parseSkillCategories, flattenSkills } from "../lib/resume-parser.js";
import { DATA_DIR, MASTER_RESUME_PATH, companyFolderPath, resumePdfFileName } from "../lib/paths.js";
import { listAllApplications, ensureCompanyFolder } from "../lib/applications-store.js";
import { generateResumePdf } from "../lib/pdf-generator.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const DEFAULT_NAME = "Mikael Daluz";
// No "Open to <city>" relocation callouts -- see resume-content-rules memory. Default assumes a
// Northeast/remote role; pass contact_line explicitly with the location omitted entirely for roles
// on-site far outside the Northeast (MA/CT/RI/NH/VT/ME/NY/NJ/PA).
const DEFAULT_CONTACT_LINE =
  "Westford, MA 01886 | 978-751-2683 | daluzmikael@outlook.com | https://www.linkedin.com/in/mikaeldaluz/ | https://github.com/daluzmikael";

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

  const NO_STORYTELLING_RULE =
    "Write as a plain factual CV entry, not a narrative -- state what was built and the real outcome/metric, " +
    "full stop. Never add a company-tie-in clause like 'the same rigor <Company> expects' or 'the same way " +
    "<Company>'s team works' -- Mikael's own words: 'I'm trying to systematically lay out the facts of my " +
    "professional CV so the ATS or maybe a human can quickly read and understand. Not telling tales.' The one " +
    "legitimate company mention on the whole resume is the objective's 'targeting <Company>'s <role> role' " +
    "clause -- that's a fact about what's being applied for, not a narrative flourish, and it belongs nowhere else.";

  const PREFLIGHT_RULE =
    "PREFLIGHT -- read these four files BEFORE calling this tool; load_master_resume alone is NOT enough (it " +
    "parses Senior_resume.docx, which predates the current format -- the real baseline is " +
    "~/Documents/Resume/master_resume.pdf): (1) the resume-content-rules memory file for the standing " +
    "checklist, (2) ~/Documents/Resume/projects_catalogue.md -- pick 4 projects from the full 14+ inventory, " +
    "not the master resume's default set, (3) ~/Documents/Resume/skills_catalogue.md -- build skill categories " +
    "fitted to this posting, not the master's narrow ~5, (4) ~/Documents/Resume/work_experience_library.md -- " +
    "the Work Experience section goes on every resume. Skipping this step shipped two rule-violating resumes " +
    "on 2026-09-20; the tool now warns in its result when the output looks like that failure.";

  const ACRONYM_RULE =
    "Every acronym or abbreviation that's true of Mikael and relevant to this posting must appear spelled out " +
    "in full at least once somewhere on the resume, with the abbreviation following in parentheses (e.g. " +
    "'machine learning (ML)') -- not just the bare acronym. A skill category name is often the cleanest place " +
    "to do this once (e.g. a 'Machine Learning' category, not only 'AI/ML' buried in a subheader). This closes " +
    "an ATS keyword-match gap: scanning for the literal phrase 'machine learning' will not match a resume that " +
    "only ever says 'ML'. Never invent an expansion for something Mikael doesn't actually have -- only pair " +
    "acronyms with full phrases for skills/certs that are real.";

  const projectSchema = z.object({
    header: z.string().describe("Project title line, e.g. 'DataSport — AI-Powered NBA Analytics Platform'"),
    subheader: z.string().optional().describe("Context/date line under the title"),
    bullets: z.array(z.string()).min(3).describe(
      "At least 3 specific bullets, not 2 broad catch-all ones -- split combined bullets into distinct, " +
      "concrete points instead of writing fewer, vaguer lines. Page length is not a constraint (narrow margins " +
      "leave room); relevance to the target posting is what should decide bullet count, with 3 as the floor. " +
      NO_STORYTELLING_RULE + " " + ACRONYM_RULE
    ),
  });

  const workHistorySchema = z.object({
    header: z.string().describe("Job title + employer, e.g. 'Summer Help — Westford Public Schools'"),
    subheader: z.string().optional().describe("Date range, e.g. 'June 2022 – August 2025'"),
    bullets: z.array(z.string()).min(1).describe(
      "Work history bullets are NOT subject to the 3-bullet project floor -- a short summer/part-time job is " +
      "often genuinely 2 solid bullets, and padding it to 3 would mean inventing a third point that isn't there. " +
      NO_STORYTELLING_RULE
    ),
  });

  server.registerTool(
    "generate_tailored_resume",
    {
      title: "Generate a tailored resume PDF",
      description:
        "Renders a one-page resume PDF from FINAL, already-tailored section content (you write the tailored " +
        "objective/skills/project text yourself using load_master_resume + the job posting -- this tool only " +
        "renders and saves it). Saves to ~/Documents/Resume/{Company}/{company}_resume.pdf per Mikael's existing " +
        "folder convention, creating the company folder if needed. Content philosophy (corrected 2026-08-26, " +
        "applies to every field you write): this is a systematic factual CV for ATS/human scanning, not a " +
        "narrative -- see the 'no storytelling' and acronym-pairing guidance on the objective/projects/" +
        "work_history fields below before writing content. " +
        PREFLIGHT_RULE +
        " Also writes resume_content.json next to the PDF (re-renderable via scripts/render-from-json.mjs) " +
        "and returns page_count plus a warnings array -- check both before reporting the resume as done.",
      inputSchema: {
        company: z.string(),
        name: z.string().optional().default(DEFAULT_NAME),
        contact_line: z.string().optional().default(DEFAULT_CONTACT_LINE).describe(
          "Override per job by location. Default includes 'Westford, MA 01886' -- keep that for Northeast " +
          "(MA/CT/RI/NH/VT/ME/NY/NJ/PA) roles and anything remote-eligible. For a role on-site far outside the " +
          "Northeast, pass a contact_line with the location segment removed entirely (just phone | email | " +
          "linkedin) -- never add an 'Open to <city>' relocation callout."
        ),
        objective: z.string().describe(
          "TARGET LENGTH: 280-320 characters total, which renders as exactly 3 lines at the current body size. " +
          "Under ~260 leaves blank space at the bottom of the page; over ~340 wraps to 4 lines and risks pushing " +
          "the resume to a second page (both have happened). Sentence 1 must open by naming the target role: " +
          "'University of Connecticut CS graduate targeting <Company>'s <exact posting title> role' -- use the " +
          "posting's own title verbatim, not a paraphrase. Sentence 2 (and optionally a short 3rd) names " +
          "specific catalogue projects/tech relevant to this posting, not generic adjectives. Bare acronyms are " +
          "fine HERE (LLM/RAG/NLP) as long as the full phrase appears once elsewhere, usually a skill category " +
          "name -- don't pay the character cost twice. Do not add the degree/concentration/date parenthetical " +
          "here (that's in education_lines directly below -- repeating it is redundant). Mikael has already " +
          "graduated: past-tense 'graduate', never 'student'/'currently pursuing'/'graduating <date>'. Keep it " +
          "factual, not narrative -- see the project bullets' 'no storytelling' guidance, which applies here too."
        ),
        education_lines: z.array(z.string()).min(1).describe(
          "Two lines: school/location, then degree. The degree line must always read 'Bachelor of Science: " +
          "Computer Science, Concentration in Artificial Intelligence, May 2026' -- the AI concentration is " +
          "required on every resume variant, never the plain 'Bachelor of Science: Computer Science' line."
        ),
        work_history: z.array(workHistorySchema).optional().describe(
          "STANDARD ON EVERY RESUME -- not genuinely optional, despite the type. Rendered as its own 'Work " +
          "Experience' section at the bottom, after Relevant Projects. The default is ONE entry in the " +
          "transferable-skills format: header 'Transferable Skills: 2018 – Present', NO subheader (the renderer " +
          "reserves a line for a present-but-blank one), and the two bullets copied verbatim from " +
          "~/Documents/Resume/work_experience_library.md -- lead with bullet 1 (reliability/independent " +
          "problem-solving) for operations/technical postings, bullet 2 (customer service/teamwork under " +
          "pressure) for customer-facing ones. Do NOT name individual employers, locations, or exact dates. " +
          "Omit this param only if Mikael explicitly asks for a resume with no Work Experience section."
        ),
        skill_categories: z.array(skillCategorySchema).min(1).describe(
          "Build these from the full ~/Documents/Resume/skills_catalogue.md library, selecting and grouping " +
          "whatever fits THIS posting -- do not reflexively reuse the master resume's narrow ~5 categories " +
          "(Frontend/Backend/Data & Cloud/AI Systems/Soft Skills), which leaves genuinely relevant catalogue " +
          "skills unused and the page short. Default to 'Graph Algorithms' plain; only name Dijkstra's or " +
          "Minimum Spanning Tree if the posting itself calls them out by name. " + ACRONYM_RULE
        ),
        projects: z.array(projectSchema).min(3).describe(
          "DEFAULT IS 4 PROJECTS, not 3 -- picked from the full ~/Documents/Resume/projects_catalogue.md " +
          "inventory (14+ entries: DataSport, SlapHead Music, AI Content Moderation, Car Sales Application, " +
          "Second Brain RAG, HSR, NYC Airbnb, Statistical Modeling, Magic Sort, Pickleball Waitlist, Pipe, Pet " +
          "Adoption, ATS Dashboard, ML-work notebooks, Job Application MCP), choosing whichever 4 best fit this " +
          "specific posting rather than the same default four every time. Drop to 3 only when Mikael has asked " +
          "for it on that company (Cortica and Achieve are pinned at 3) or when 4 pushes the resume to a second " +
          "page after spacing and objective/skills trims have already been tried. Never list SlapHead Music and " +
          "Pet Adoption Website on the same resume -- SlapHead was built out of the Pet Adoption codebase, so " +
          "pairing them double-counts one piece of work. Ground every bullet in the catalogue's real facts; " +
          "never invent a plausible-sounding detail."
        ),
      },
    },
    async ({ company, name, contact_line, objective, education_lines, work_history, skill_categories, projects }) => {
      await ensureCompanyFolder(company);
      const content = {
        name: name ?? DEFAULT_NAME,
        contactLine: contact_line ?? DEFAULT_CONTACT_LINE,
        objective,
        education: education_lines,
        workHistory: work_history?.map((w) => ({ header: w.header, subheader: w.subheader, bullets: w.bullets })),
        skillCategories: skill_categories,
        projects: projects.map((p) => ({ header: p.header, subheader: p.subheader, bullets: p.bullets })),
      };
      const pdfBytes = await generateResumePdf(content);
      const pdfName = resumePdfFileName(company);
      const outPath = path.join(companyFolderPath(company), pdfName);
      await fs.writeFile(outPath, pdfBytes);

      // Saved so any future renderer change can be re-applied without retyping content --
      // the MCP server loads dist/ at startup, so scripts/render-from-json.mjs is the only
      // way to pick up a rebuilt renderer without a host restart.
      const contentPath = path.join(companyFolderPath(company), "resume_content.json");
      await fs.writeFile(contentPath, JSON.stringify({ ...content, _pdf_name: pdfName }, null, 2));

      const pageCount = (await PDFDocument.load(pdfBytes)).getPageCount();

      // The embedded Open Sans subset has no glyph for arrows and similar symbols: pdf-lib
      // renders them as blank gaps instead of failing, so "A -> B -> C" silently ships as
      // "A    B    C". Caught on the 2026-09-21 career-fair resumes. Write the word instead.
      const UNRENDERABLE = /[←-⇿➔-➿⬀-⯿⟰-⟿]/g;
      const allText = [
        objective,
        ...education_lines,
        ...skill_categories.flatMap((c) => [c.category, ...c.skills]),
        ...projects.flatMap((p) => [p.header, p.subheader ?? "", ...p.bullets]),
        ...(work_history ?? []).flatMap((w) => [w.header, w.subheader ?? "", ...w.bullets]),
      ].join(" ");
      const badChars = [...new Set(allText.match(UNRENDERABLE) ?? [])];

      const warnings: string[] = [];
      if (badChars.length) {
        warnings.push(
          `Text contains ${badChars.map((c) => JSON.stringify(c)).join(", ")}, which the embedded font ` +
          "cannot render -- these appear as blank gaps in the PDF, not as symbols. Rewrite them as words " +
          "(e.g. \"NBA API to Parquet to DuckDB\", not an arrow chain) and regenerate."
        );
      }
      if (pageCount > 1) {
        warnings.push(
          `Resume rendered on ${pageCount} pages. Fix in this order: (1) tighten spacing in pdf-generator.ts, ` +
          "(2) trim redundancy in the objective or skills list, (3) only then drop to 3 projects, cutting the " +
          "weakest -- never cut project bullets to save space."
        );
      }
      if (!work_history?.length) {
        warnings.push(
          "No Work Experience section. This is standard on every resume -- pass work_history with header " +
          "'Transferable Skills: 2018 – Present' and the two bullets from work_experience_library.md, unless " +
          "Mikael explicitly asked for it to be left off."
        );
      }
      if (projects.length < 4) {
        warnings.push(
          `Only ${projects.length} projects. The default is 4, chosen from projects_catalogue.md -- intentional ` +
          "only for a company Mikael pinned at 3 (Cortica, Achieve) or after a 4-project version ran long."
        );
      }
      if (objective.length < 260 || objective.length > 340) {
        warnings.push(
          `Objective is ${objective.length} characters; target is 280-320 (renders as 3 lines). ` +
          (objective.length < 260 ? "Too short leaves blank space at the bottom." : "Too long wraps to 4 lines.")
        );
      }
      if (!education_lines.some((l) => l.includes("Concentration in Artificial Intelligence"))) {
        warnings.push("Education line is missing 'Concentration in Artificial Intelligence' -- required on every resume.");
      }

      return jsonResult({
        tailored_pdf_path: outPath,
        resume_content_path: contentPath,
        page_count: pageCount,
        skill_category_count: skill_categories.length,
        work_history_count: work_history?.length ?? 0,
        project_count: projects.length,
        objective_chars: objective.length,
        warnings,
      });
    }
  );
}
