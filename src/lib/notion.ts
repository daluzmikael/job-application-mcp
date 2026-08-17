import { ApplicationMetadata, ApplicationStatus } from "./schemas.js";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
// Data source ID for Mikael's "Job Apps" database (created via Notion MCP setup).
// Overridable via env var in case the database is ever recreated.
const NOTION_DATA_SOURCE_ID =
  process.env.NOTION_DATA_SOURCE_ID ?? "3bb5bf71-e428-8015-a722-000b6a20d32b";
const NOTION_VERSION = "2025-09-03";
const NOTION_API_BASE = "https://api.notion.com/v1";

const STATUS_MAP: Record<ApplicationStatus, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  reviewing: "Reviewing application",
  interviewing: "Interviewing",
  rejected: "Rejected",
  accepted: "Hired!",
  withdrawn: "Withdrawn",
};

export interface NotionSyncResult {
  synced: boolean;
  page_id?: string;
  page_url?: string;
  error?: string;
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function buildProperties(app: ApplicationMetadata): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    Company: { title: [{ text: { content: app.company } }] },
    Role: { rich_text: [{ text: { content: app.role } }] },
    Status: { select: { name: STATUS_MAP[app.status] } },
    "Projects Used": { multi_select: app.projects_used.map((p) => ({ name: p })) },
  };
  if (app.applied_date) properties["Applied Date"] = { date: { start: app.applied_date } };
  if (app.follow_up_date) properties["Follow Up Date"] = { date: { start: app.follow_up_date } };
  if (app.ats_score !== null) properties["ATS Score"] = { number: app.ats_score };
  if (app.url) properties["URL"] = { url: app.url };
  const metaLine = [app.location, app.role_type].filter(Boolean).join(" | ");
  const notesWithMeta = metaLine ? [metaLine, app.notes].filter(Boolean).join("\n") : app.notes;
  if (notesWithMeta) properties["Notes"] = { rich_text: [{ text: { content: notesWithMeta } }] };
  return properties;
}

async function findExistingPageId(company: string, role: string): Promise<string | null> {
  const res = await fetch(`${NOTION_API_BASE}/data_sources/${NOTION_DATA_SOURCE_ID}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      filter: {
        and: [
          { property: "Company", title: { equals: company } },
          { property: "Role", rich_text: { equals: role } },
        ],
      },
      page_size: 1,
    }),
  });
  if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { results: Array<{ id: string }> };
  return data.results[0]?.id ?? null;
}

async function createPage(app: ApplicationMetadata): Promise<{ id: string; url: string }> {
  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: NOTION_DATA_SOURCE_ID },
      properties: buildProperties(app),
    }),
  });
  if (!res.ok) throw new Error(`Notion page create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; url: string };
}

async function updatePage(pageId: string, app: ApplicationMetadata): Promise<{ id: string; url: string }> {
  const res = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({ properties: buildProperties(app) }),
  });
  if (!res.ok) throw new Error(`Notion page update failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; url: string };
}

/**
 * Upserts an application into the Notion "Job Apps" database. Uses the cached
 * notion_page_id on the metadata when available; otherwise looks up by
 * Company + Role before deciding to create vs. update. No-ops (synced: false)
 * when NOTION_API_KEY isn't configured, so local tracking keeps working
 * without Notion set up.
 */
export async function syncApplicationToNotion(app: ApplicationMetadata): Promise<NotionSyncResult> {
  if (!NOTION_API_KEY) {
    return { synced: false, error: "NOTION_API_KEY not set -- skipped Notion sync" };
  }
  try {
    let pageId = app.notion_page_id ?? (await findExistingPageId(app.company, app.role));
    const page = pageId ? await updatePage(pageId, app) : await createPage(app);
    return { synced: true, page_id: page.id, page_url: page.url };
  } catch (err: any) {
    return { synced: false, error: err?.message ?? String(err) };
  }
}
