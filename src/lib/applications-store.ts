import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ApplicationMetadata,
  ApplicationMetadataSchema,
} from "./schemas.js";
import { DATA_DIR, legacyMetadataFilePath, metadataFilePath, companyFolderPath } from "./paths.js";

export async function ensureCompanyFolder(company: string): Promise<string> {
  const dir = companyFolderPath(company);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export interface MetadataRecord {
  filePath: string;
  meta: ApplicationMetadata;
}

function isMetadataFileName(name: string): boolean {
  return name === "metadata.json" || (name.startsWith("metadata.") && name.endsWith(".json"));
}

function roleMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Every metadata file (metadata.json plus any metadata.<role>.json) logged for a company. */
async function listMetadataFiles(company: string): Promise<MetadataRecord[]> {
  const dir = companyFolderPath(company);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  const results: MetadataRecord[] = [];
  for (const name of entries) {
    if (!isMetadataFileName(name)) continue;
    const filePath = path.join(dir, name);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      results.push({ filePath, meta: ApplicationMetadataSchema.parse(JSON.parse(raw)) });
    } catch {
      // Not a metadata file we wrote (or it's malformed) -- skip it rather than fail the whole scan.
    }
  }
  return results;
}

/**
 * Resolves which logged application(s) match a company (+ optional role).
 * When role is omitted and the company has more than one logged role,
 * `record` is null and `allForCompany` holds every match so the caller can
 * ask for disambiguation instead of silently picking one.
 */
export async function findMetadata(
  company: string,
  role?: string
): Promise<{ record: MetadataRecord | null; allForCompany: MetadataRecord[] }> {
  const files = await listMetadataFiles(company);
  if (role !== undefined) {
    const match = files.find((f) => roleMatches(f.meta.role, role));
    return { record: match ?? null, allForCompany: files };
  }
  if (files.length === 1) return { record: files[0], allForCompany: files };
  return { record: null, allForCompany: files };
}

export async function readMetadata(
  company: string,
  role?: string
): Promise<ApplicationMetadata | null> {
  const { record } = await findMetadata(company, role);
  return record?.meta ?? null;
}

/**
 * Writes metadata for a specific company+role. Updates the existing file in
 * place if that role is already logged; otherwise picks a slot -- the plain
 * "metadata.json" if the company has no logged applications yet, or a
 * role-scoped "metadata.<role>.json" if "metadata.json" already belongs to a
 * different role. This is what stops two roles at the same company from
 * overwriting each other's record (and, via the cached notion_page_id, each
 * other's Notion page).
 */
export async function writeMetadata(
  company: string,
  role: string,
  metadata: ApplicationMetadata
): Promise<MetadataRecord> {
  const { record, allForCompany } = await findMetadata(company, role);
  await ensureCompanyFolder(company);
  let filePath: string;
  if (record) {
    filePath = record.filePath;
  } else {
    const legacyPath = legacyMetadataFilePath(company);
    const legacyTaken = allForCompany.some((f) => f.filePath === legacyPath);
    filePath = legacyTaken ? metadataFilePath(company, role) : legacyPath;
  }
  await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), "utf-8");
  return { filePath, meta: metadata };
}

/**
 * Scans DATA_DIR for immediate subdirectories that contain metadata files
 * written by this server (metadata.json and/or metadata.<role>.json --
 * i.e. the tracking convention). Pre-existing company folders from before
 * this tool existed are intentionally skipped since they have no metadata
 * files at all.
 */
export async function listAllApplications(): Promise<ApplicationMetadata[]> {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const results: ApplicationMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = await listMetadataFiles(entry.name);
    for (const { meta } of files) results.push(meta);
  }
  results.sort((a, b) => (b.applied_date ?? "").localeCompare(a.applied_date ?? ""));
  return results;
}

export function newApplicationId(company: string, role: string): string {
  const slug = `${company}-${role}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}-${Date.now().toString(36)}`;
}
