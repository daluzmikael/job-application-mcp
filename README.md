# job-application-mcp

An **MCP server** for a data-driven job search workflow: search postings, tailor resumes, score ATS fit, track applications in Notion, and generate live analytics dashboards.

## Overview

This server is **host-LLM-driven** — no `ANTHROPIC_API_KEY`, no internal AI. It provides deterministic tools (search, parsing, keyword scoring, tracking) and delegates all reasoning to the calling assistant. The goal is to remove friction from the job search: log an application once, automatically sync to Notion, and get real-time pipeline analytics showing which portfolio projects actually land interviews.

## Architecture

**Three layers:**

1. **Job Search & Resume Tools** — deterministic: fetch postings, parse resumes, score ATS matches, extract keywords. You reason over the results in the conversation.
2. **Application Tracking** — local metadata files (`metadata.json` per company) + **Notion database sync** (optional). `log_application` writes to both and auto-calculates follow-up dates.
3. **Analytics & Dashboards** — aggregates all applications, surfaces project-to-outcome correlation (e.g., "DataSport used in 8 apps: 3 interviewing, 2 rejected, 3 pending"). Dashboard is a static HTML snapshot that refreshes on request.

## Setup

### Prerequisites

- Node.js 18+
- `~/Documents/Resume/Senior_resume.docx` (master resume)
- *Optional:* Notion API key (for database sync)

### Install & Build

```bash
git clone https://github.com/daluzmikael/job-application-mcp.git
cd job-application-mcp
npm install
npm run build
```

**Storage location:** This lives in `~/projects_offcloud/`, not `~/Documents/`, because iCloud Drive intercepts every file access in `~/Documents`. That kills cold import speed on a Node project (thousands of small files). Keep node_modules projects offcloud.

### Add to Claude Desktop

Edit `~/.claude.json` (or create it if it doesn't exist):

```json
{
  "mcpServers": {
    "job-application-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/job-application-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

Optionally, for Notion sync, add your API key:

```json
"env": {
  "NOTION_API_KEY": "your-notion-secret-token-here",
  "NOTION_DATA_SOURCE_ID": "the-collection-uuid-from-your-db"
}
```

Restart Claude Desktop after editing.

## Tools

### Job Search

- **`search_jobs`** — Fetch postings for ONE company by auto-detecting its Greenhouse/Lever/Ashby board. No cross-company search.
- **`search_jobs_newgrad`** — Keyword search across SimplifyJobs New-Grad-Positions GitHub list (real cross-company source).
- **`list_cached_companies`** — Previously searched companies and their detected ATS platform.

### Resume

- **`load_master_resume`** — Parse `Senior_resume.docx` into Objective/Education/Skills/Projects sections.
- **`load_previous_applications`** — Read all logged applications (`metadata.json` files).
- **`list_tailored_resumes`** — Scan for existing `{company}_resume.pdf` files.
- **`generate_tailored_resume`** — Render a one-page tailored resume PDF from final text.

### Analysis

- **`analyze_job_posting`** — Extract requirements, keywords, seniority, salary, red flags.
- **`compare_skills_gap`** — Match/missing skills between resume and posting.
- **`score_ats_match`** — 0-1 keyword coverage score.

### Tracking & Notion Sync

- **`log_application`** — Upsert `metadata.json` in `{Company}/` + sync to Notion (if `NOTION_API_KEY` is set). Auto-calculates follow-up date (default 7 days).
  - Params: company, role, status, applied_date, projects_used, url, ats_score, notes
  - Returns: application object + Notion sync result (synced: true/false + page_id + page_url)
- **`get_application_status`** — Look up a logged application by company.
- **`list_pending_followups`** — Applications ready for a follow-up email (status="applied", older than N days, not yet followed up).
- **`draft_followup_email`** — Generate and save a follow-up email draft (never sends).
- **`get_application_analytics`** — Aggregate all applications: pipeline by status, response rate, overdue follow-ups, **project frequency breakdown** (which projects ride along most and their outcomes).
- **`export_applications_csv`** — Write all applications to CSV for Excel/Sheets import.

## Notion Integration (Optional)

### Prerequisites

1. Create a Notion database called "Job Apps" with this schema:
   - **Company** (Title)
   - **Role** (Text)
   - **Status** (Select: Applied, Not applied, Interviewing, Reviewing application, Rejected, Hired!)
   - **Applied Date** (Date)
   - **Follow Up Date** (Date)
   - **Location** (Place)
   - **ATS Score** (Number)
   - **Projects Used** (Multi-select: DataSport, Fine-Tuned Language Model, NYC Airbnb ML, Job Application Tracking, etc.)
   - **URL** (URL)
   - **Notes** (Text)
   - **Files & media** (File)

2. Create a Notion integration at [notion.com/my-integrations](https://www.notion.com/my-integrations):
   - Name it "job-application-mcp"
   - Copy the secret token

3. In your Notion workspace, share the "Job Apps" database with your new integration.

4. Add the API key to `~/.claude.json` in the job-application-mcp env block.

### How It Works

When you call `log_application`:
- Updates or creates a `metadata.json` file locally (persistent, survives without Notion)
- If `NOTION_API_KEY` is set, syncs to Notion (finds existing row by Company+Role, creates if new)
- Caches the Notion page ID locally so future updates are a single API call
- If Notion sync fails, local tracking still works

### Analytics Dashboard

The dashboard is a static HTML snapshot (no live polling). To build it:
```bash
# From Claude or your terminal:
gh workflow run refresh-dashboard.yml  # or ask Claude to refresh the dashboard
```

The dashboard displays:
- **KPI row**: Total applications, active pipeline, follow-ups due this week, response rate
- **Status pipeline**: Click any status to filter the table
- **Follow-ups due**: Sorted by urgency (overdue, today, tomorrow, within 7 days)
- **Project performance**: Which projects appear in how many applications + their outcomes
- **All applications table**: Company, role, status, dates, projects, link to posting

## Workflow Example

```
1. Find a job posting
   → search_jobs("Company Name") or search_jobs_newgrad("keywords")

2. Analyze it
   → analyze_job_posting(posting_url)
   → compare_skills_gap(master_resume_text, posting_text)

3. Decide if you're a fit
   → This is reasoning, not a tool. You judge in the conversation.

4. Tailor your resume
   → generate_tailored_resume(
       company="Company Name",
       objective="...",
       skills="...",
       projects="...",
       final_text="..."
     )

5. Apply & log it
   → log_application(
       company="Company Name",
       role="Job Title",
       status="applied",
       applied_date="2026-08-13",
       projects_used=["DataSport", "Fine-Tuned Language Model"],
       url="...",
       notes="..."
     )
   → Syncs to Notion (if configured) + saves locally

6. Track follow-ups
   → list_pending_followups()
   → draft_followup_email(company="Company Name")

7. View analytics
   → get_application_analytics()
   → See: which projects are landing interviews, response rate, overdue follow-ups
```

## Data Storage

- **Local**: `~/Documents/Resume/{Company}/metadata.json` — portable, survives without Notion
- **Notion**: Optional sync to a database you own
- **CSV**: `~/Documents/Resume/applications_tracker.csv` — export for Excel/Sheets analysis
- **No external API calls**: Tracking stays local; Notion is write-only (no read-back during log)

## Notes

- Existing per-company folders from before this MCP existed (e.g., `accenture/`, `Acra/`) are left untouched — they have no `metadata.json` and won't appear in `load_previous_applications` until you call `log_application` for them.
- Company folder names are normalized by stripping punctuation (`"Crate & Barrel"` → `CrateBarrel`).
- Follow-up dates default to 7 days after applied_date; override with `follow_up_date` parameter.
- The dashboard is a snapshot at the time of generation. Ask Claude to refresh it when you want fresh numbers.

## License

MIT
