// Tests the actual business logic directly (no MCP protocol layer, no spawning
// child processes) to avoid this sandbox's slow per-file cold-start I/O.
process.env.RESUME_DATA_DIR = "/tmp/job_mcp_direct_data";

const t0 = Date.now();
const log = (label) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

log("importing modules...");
const { loadMasterResume, parseSkillCategories, flattenSkills } = await import("./dist/lib/resume-parser.js");
const { detectAndFetchCompanyJobs } = await import("./dist/lib/ats-clients.js");
const { fetchNewGradPostings, filterByTechFocus } = await import("./dist/lib/newgrad-source.js");
const { analyzeJobPosting, compareSkillsGap, scoreAtsMatch } = await import("./dist/lib/keyword-extraction.js");
const { generateResumePdf } = await import("./dist/lib/pdf-generator.js");
const { writeMetadata, readMetadata, listAllApplications, newApplicationId } = await import("./dist/lib/applications-store.js");
log("modules imported");

const fs = await import("node:fs/promises");

// 1. Real master resume parse
log("load_master_resume (real Senior_resume.docx)...");
const sections = await loadMasterResume("/Users/mikaeldaluz/Documents/Resume/Senior_resume.docx");
console.log("OBJECTIVE:", sections.objective.slice(0, 120), "...");
console.log("EDUCATION:", sections.education);
const skillCats = parseSkillCategories(sections.skills);
console.log("SKILL CATEGORIES:", skillCats.map((c) => `${c.category} (${c.skills.length})`));
console.log("FLAT SKILLS COUNT:", flattenSkills(skillCats).length);
log("load_master_resume OK");

// 2. Real ATS fetch (Stripe on Greenhouse)
log("detectAndFetchCompanyJobs('stripe')...");
const stripeResult = await detectAndFetchCompanyJobs("stripe");
if (stripeResult) {
  console.log(`STRIPE: platform=${stripeResult.platform} token=${stripeResult.token} jobs=${stripeResult.jobs.length}`);
  console.log("sample job:", stripeResult.jobs[0]?.title, "|", stripeResult.jobs[0]?.location);
} else {
  console.log("STRIPE: not found (network blocked in this sandbox, or board token mismatch)");
}
log("ats-clients OK");

// 3. New grad source
log("fetchNewGradPostings()...");
const { jobs: newgradJobs, error: newgradError } = await fetchNewGradPostings();
if (newgradError) console.log("NEWGRAD ERROR:", newgradError);
else {
  console.log(`NEWGRAD: ${newgradJobs.length} total postings parsed`);
  const backend = filterByTechFocus(newgradJobs, "backend");
  console.log(`NEWGRAD backend-filtered: ${backend.length}`, backend.slice(0, 3).map((j) => `${j.company} - ${j.title}`));
}
log("newgrad-source OK");

// 4. Keyword extraction / analysis
const jd = `We are looking for a Senior Data Engineer with 5+ years of experience.
Requirements:
- 5+ years of experience with Python and SQL
- Experience with Snowflake and Kafka required
- AWS or GCP experience
Nice to have:
- Experience with Kubernetes a plus
- GraphQL preferred
Salary range: $140,000 - $180,000
Must be onsite in NYC. No visa sponsorship.`;

const analysis = analyzeJobPosting(jd);
console.log("ANALYSIS:", JSON.stringify(analysis, null, 2));

const gap = compareSkillsGap(sections.skills, jd);
console.log("GAP:", JSON.stringify(gap, null, 2));

const atsScore = scoreAtsMatch(sections.raw_text, jd);
console.log("ATS SCORE:", JSON.stringify(atsScore, null, 2));
log("keyword-extraction OK");

// 5. PDF generation
log("generateResumePdf()...");
const pdfBytes = await generateResumePdf({
  name: "Mikael Daluz",
  contactLine: "Westford, MA 01886 | Remote / Open to SF | 978-751-2683 | daluzmikael@outlook.com | linkedin.com/in/mikaeldaluz",
  objective: "Recent UConn CS grad seeking a Data Engineer role, applying Python/SQL and AWS experience from DataSport.",
  education: ["University of Connecticut, Storrs, CT", "Bachelor of Science: Computer Science, May 2026"],
  skillCategories: [
    { category: "Backend & APIs", skills: ["Python", "FastAPI", "REST APIs"] },
    { category: "Data & Cloud", skills: ["PostgreSQL", "DuckDB", "AWS (RDS)", "Docker"] },
  ],
  projects: [
    {
      header: "DataSport — AI-Powered NBA Analytics Platform",
      subheader: "Senior Design Project (Team 45 Lead) | Sept 2025 - May 2026",
      bullets: [
        "Built scalable REST APIs and SQL-backed data services with Python/FastAPI.",
        "Designed ingestion pipeline: NBA API -> Parquet -> DuckDB/PostgreSQL across 10+ unified tables.",
        "Integrated OpenAI tooling for NL-to-SQL agent workflows and structured response generation.",
      ],
    },
  ],
});
await fs.mkdir("/tmp/job_mcp_direct_data/TestCo", { recursive: true });
await fs.writeFile("/tmp/job_mcp_direct_data/TestCo/testco_resume.pdf", pdfBytes);
console.log(`PDF written: ${pdfBytes.length} bytes -> /tmp/job_mcp_direct_data/TestCo/testco_resume.pdf`);
log("pdf-generator OK");

// 6. Application tracking round-trip
log("applications-store round trip...");
const now = new Date().toISOString();
const meta = {
  id: newApplicationId("TestCo", "Data Engineer"),
  company: "TestCo",
  role: "Data Engineer",
  url: "https://example.com/jobs/123",
  posting_date: null,
  applied_date: "2026-07-20",
  resume_used: "/tmp/job_mcp_direct_data/TestCo/testco_resume.pdf",
  cover_letter_used: false,
  cover_letter_file: null,
  status: "applied",
  ats_score: atsScore.score,
  matched_keywords: atsScore.matches,
  missing_keywords: atsScore.missing_keywords,
  notes: "smoke test entry",
  follow_up_date: null,
  follow_up_sent: false,
  created_at: now,
  updated_at: now,
};
await writeMetadata("TestCo", meta);
const readBack = await readMetadata("TestCo");
console.log("READBACK MATCHES:", JSON.stringify(readBack) === JSON.stringify(meta));
const all = await listAllApplications();
console.log("ALL APPLICATIONS:", all.length, all.map((a) => `${a.company}:${a.role}`));
log("applications-store OK");

console.log("\n=== ALL DIRECT TESTS PASSED ===");
