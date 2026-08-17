import { z } from "zod";
import { promises as fs } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  readMetadata,
  writeMetadata,
  findMetadata,
  listAllApplications,
  newApplicationId,
} from "../lib/applications-store.js";
import { ApplicationMetadata, ApplicationStatusSchema } from "../lib/schemas.js";
import { jobPostingFilePath, followupDraftFilePath, APPLICATIONS_CSV_PATH } from "../lib/paths.js";
import { syncApplicationToNotion } from "../lib/notion.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function registerTrackingTools(server: McpServer) {
  server.registerTool(
    "log_application",
    {
      title: "Log a job application",
      description:
        "Creates or updates the metadata.json in ~/Documents/Resume/{Company}/ for an application (upsert by " +
        "company name). Use this right after applying to keep a searchable record, and again later to update " +
        "status/notes/follow-up fields as things change.",
      inputSchema: {
        company: z.string(),
        role: z.string(),
        url: z.string().optional(),
        location: z.string().optional().describe("e.g. 'Boston, MA'"),
        role_type: z.string().optional().describe("Work arrangement + employment type, e.g. 'Hybrid, Full-time'"),
        posting_date: z.string().optional(),
        applied_date: z.string().optional().describe("Defaults to today (ISO date)"),
        resume_file: z.string().optional().describe("Path to the resume PDF used"),
        cover_letter_file: z.string().optional(),
        projects_used: z.array(z.string()).optional().describe("Project headers included on the tailored resume, e.g. ['DataSport', 'NYC Airbnb Price Prediction']"),
        ats_score: z.number().min(0).max(1).optional(),
        matched_keywords: z.array(z.string()).optional(),
        missing_keywords: z.array(z.string()).optional(),
        notes: z.string().optional(),
        status: ApplicationStatusSchema.optional(),
        follow_up_date: z.string().optional().describe("Defaults to 7 days after applied_date if not set"),
        job_posting_text: z.string().optional().describe("If provided, saved as job_posting.md in the folder"),
      },
    },
    async (input) => {
      // Scoped to company+role -- a company with more than one open
      // application gets its own metadata slot per role, so applying to a
      // second role never overwrites the first one's record (or, via a
      // stale cached notion_page_id, silently overwrites its Notion page).
      const existing = await readMetadata(input.company, input.role);
      const now = new Date().toISOString();
      const appliedDate = input.applied_date ?? existing?.applied_date ?? todayIso();
      const merged: ApplicationMetadata = {
        id: existing?.id ?? newApplicationId(input.company, input.role),
        company: input.company,
        role: input.role,
        url: input.url ?? existing?.url ?? null,
        location: input.location ?? existing?.location ?? null,
        role_type: input.role_type ?? existing?.role_type ?? null,
        posting_date: input.posting_date ?? existing?.posting_date ?? null,
        applied_date: appliedDate,
        resume_used: input.resume_file ?? existing?.resume_used ?? null,
        cover_letter_used: input.cover_letter_file ? true : existing?.cover_letter_used ?? false,
        cover_letter_file: input.cover_letter_file ?? existing?.cover_letter_file ?? null,
        projects_used: input.projects_used ?? existing?.projects_used ?? [],
        status: input.status ?? existing?.status ?? "applied",
        ats_score: input.ats_score ?? existing?.ats_score ?? null,
        matched_keywords: input.matched_keywords ?? existing?.matched_keywords ?? [],
        missing_keywords: input.missing_keywords ?? existing?.missing_keywords ?? [],
        notes: input.notes ?? existing?.notes ?? "",
        follow_up_date: input.follow_up_date ?? existing?.follow_up_date ?? addDaysIso(appliedDate, 7),
        follow_up_sent: existing?.follow_up_sent ?? false,
        notion_page_id: existing?.notion_page_id ?? null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      const notionResult = await syncApplicationToNotion(merged);
      if (notionResult.page_id) merged.notion_page_id = notionResult.page_id;
      const written = await writeMetadata(input.company, input.role, merged);
      if (input.job_posting_text) {
        await fs.writeFile(jobPostingFilePath(written.filePath), input.job_posting_text, "utf-8");
      }
      return jsonResult({
        application: merged,
        updated_existing: existing !== null,
        saved_to: written.filePath,
        notion_sync: notionResult,
      });
    }
  );

  server.registerTool(
    "get_application_status",
    {
      title: "Get application status",
      description:
        "Looks up a previously logged application by company name (e.g. \"Did I apply to Google yet?\", " +
        "\"what resume did I use for Stripe?\"). Pass role too if the company has more than one open " +
        "application on file.",
      inputSchema: {
        company: z.string(),
        role: z.string().optional(),
      },
    },
    async ({ company, role }) => {
      const { record, allForCompany } = await findMetadata(company, role);
      if (record) return jsonResult({ found: true, application: record.meta });
      if (allForCompany.length > 1) {
        return jsonResult({
          found: false,
          message: `Multiple applications logged for "${company}" -- specify role to disambiguate.`,
          roles: allForCompany.map((f) => f.meta.role),
        });
      }
      return jsonResult({ found: false, message: `No logged application found for "${company}".` });
    }
  );

  server.registerTool(
    "list_pending_followups",
    {
      title: "List applications needing follow-up",
      description:
        "Scans all logged applications for status 'applied' where applied_date is at least days_threshold days " +
        "ago and no follow-up has been sent yet.",
      inputSchema: {
        days_threshold: z.number().int().positive().optional().default(7),
      },
    },
    async ({ days_threshold }) => {
      const all = await listAllApplications();
      const now = Date.now();
      const msThreshold = days_threshold * 24 * 60 * 60 * 1000;
      const pending = all.filter((a) => {
        if (a.status !== "applied" || a.follow_up_sent) return false;
        if (!a.applied_date) return false;
        const appliedMs = new Date(a.applied_date).getTime();
        if (Number.isNaN(appliedMs)) return false;
        return now - appliedMs >= msThreshold;
      });
      return jsonResult({ days_threshold, pending_count: pending.length, applications: pending });
    }
  );

  server.registerTool(
    "draft_followup_email",
    {
      title: "Draft a follow-up email",
      description:
        "Generates a polite, brief follow-up email draft (subject + body) for a logged application, referencing " +
        "the role/company/applied date and 2-3 matched skill hooks if available. Saves the draft as " +
        "followup_email.md in the company folder for review (or followup_email.<role>.md if the company has " +
        "more than one open application). Does NOT send anything -- Mikael reviews and sends it himself. Pass " +
        "role if the company has more than one open application on file.",
      inputSchema: {
        company: z.string(),
        role: z.string().optional(),
      },
    },
    async ({ company, role }) => {
      const { record, allForCompany } = await findMetadata(company, role);
      if (!record) {
        if (allForCompany.length > 1) {
          return jsonResult({
            found: false,
            message: `Multiple applications logged for "${company}" -- specify role to disambiguate.`,
            roles: allForCompany.map((f) => f.meta.role),
          });
        }
        return jsonResult({ found: false, message: `No logged application found for "${company}". Log it first with log_application.` });
      }
      const meta = record.meta;
      const subject = `Application Follow-Up – ${meta.role} – Mikael Daluz`;
      const appliedDateText = meta.applied_date ?? "recently";
      const body = `Hi there,

My name is Mikael Daluz and I am a recent graduate of UConn's College of Engineering. I applied for the ${meta.role} role at ${meta.company} on ${appliedDateText} and wanted to follow up on my application status.

I'm very interested in this opportunity and would welcome the chance to discuss what I would bring to the team. Happy to answer any questions or provide additional materials in the meantime.

Best,
Mikael Daluz
978-751-2683 | daluzmikael@outlook.com
linkedin.com/in/mikaeldaluz | github.com/daluzmikael`;

      const draft = `Subject: ${subject}\n\n${body}\n`;
      const draftPath = followupDraftFilePath(record.filePath);
      await fs.writeFile(draftPath, draft, "utf-8");

      return jsonResult({
        saved_to: draftPath,
        subject,
        body,
      });
    }
  );

  server.registerTool(
    "get_application_analytics",
    {
      title: "Get job search analytics",
      description:
        "Aggregates all logged applications into pipeline analytics: totals by status, response rate, overdue " +
        "follow-ups, and -- most usefully -- which projects appear most often and how each project's applications " +
        "have played out (e.g. 'DataSport was used in 8 applications: 3 interviewing, 1 rejected, 4 still pending'). " +
        "Use this to answer 'how's my job search going' or 'which projects are actually landing interviews'.",
      inputSchema: {},
    },
    async () => {
      const all = await listAllApplications();
      const total = all.length;

      const byStatus: Record<string, number> = {};
      for (const a of all) {
        byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      }
      const respondedCount = all.filter((a) =>
        ["interviewing", "rejected", "accepted"].includes(a.status)
      ).length;
      const responseRate = total > 0 ? Math.round((respondedCount / total) * 1000) / 1000 : null;

      const now = Date.now();
      const overdueFollowups = all.filter((a) => {
        if (a.status !== "applied" || a.follow_up_sent) return false;
        if (!a.follow_up_date) return false;
        return new Date(a.follow_up_date).getTime() <= now;
      });

      const projectStats: Record<string, { total: number; by_status: Record<string, number> }> = {};
      for (const a of all) {
        for (const project of a.projects_used) {
          if (!projectStats[project]) projectStats[project] = { total: 0, by_status: {} };
          projectStats[project].total += 1;
          projectStats[project].by_status[a.status] = (projectStats[project].by_status[a.status] ?? 0) + 1;
        }
      }
      const projectFrequency = Object.entries(projectStats)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([project, stats]) => ({ project, ...stats }));

      const byCompany = all.map((a) => ({
        company: a.company,
        role: a.role,
        status: a.status,
        applied_date: a.applied_date,
        projects_used: a.projects_used,
      }));

      return jsonResult({
        total_applications: total,
        by_status: byStatus,
        response_rate: responseRate,
        overdue_followups_count: overdueFollowups.length,
        overdue_followups: overdueFollowups.map((a) => ({ company: a.company, role: a.role, follow_up_date: a.follow_up_date })),
        project_frequency: projectFrequency,
        applications: byCompany,
      });
    }
  );

  function csvEscape(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  server.registerTool(
    "export_applications_csv",
    {
      title: "Export applications to CSV",
      description:
        `Writes all logged applications to ${APPLICATIONS_CSV_PATH} as a CSV (company, role, status, applied ` +
        "date, follow-up date, projects used, url, ats score, notes). Open it directly in Excel, or in Google " +
        "Sheets via File > Import > Upload. Overwrites the file each time it's called, so it always reflects the " +
        "current state of ~/Documents/Resume.",
      inputSchema: {},
    },
    async () => {
      const all = await listAllApplications();
      const header = [
        "company",
        "role",
        "status",
        "applied_date",
        "follow_up_date",
        "follow_up_sent",
        "projects_used",
        "url",
        "ats_score",
        "notes",
      ];
      const rows = all.map((a) =>
        [
          a.company,
          a.role,
          a.status,
          a.applied_date ?? "",
          a.follow_up_date ?? "",
          String(a.follow_up_sent),
          a.projects_used.join("; "),
          a.url ?? "",
          a.ats_score !== null ? String(a.ats_score) : "",
          a.notes,
        ]
          .map((v) => csvEscape(v))
          .join(",")
      );
      const csv = [header.join(","), ...rows].join("\n") + "\n";
      await fs.writeFile(APPLICATIONS_CSV_PATH, csv, "utf-8");
      return jsonResult({ saved_to: APPLICATIONS_CSV_PATH, row_count: all.length });
    }
  );
}
