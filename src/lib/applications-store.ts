import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ApplicationMetadata,
  ApplicationMetadataSchema,
} from "./schemas.js";
import { DATA_DIR, metadataFilePath, companyFolderPath } from "./paths.js";

export async function ensureCompanyFolder(company: string): Promise<string> {
  const dir = companyFolderPath(company);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function readMetadata(
  company: string
): Promise<ApplicationMetadata | null> {
  try {
    const raw = await fs.readFile(metadataFilePath(company), "utf-8");
    return ApplicationMetadataSchema.parse(JSON.parse(raw));
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeMetadata(
  company: string,
  metadata: ApplicationMetadata
): Promise<void> {
  await ensureCompanyFolder(company);
  await fs.writeFile(
    metadataFilePath(company),
    JSON.stringify(metadata, null, 2),
    "utf-8"
  );
}

/**
 * Scans DATA_DIR for immediate subdirectories that contain a metadata.json
 * written by this server (i.e. the new tracking convention). Pre-existing
 * company folders from before this tool existed are intentionally skipped
 * since they have no metadata.json.
 */
export async function listAllApplications(): Promise<ApplicationMetadata[]> {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const results: ApplicationMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(DATA_DIR, entry.name, "metadata.json");
    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      results.push(ApplicationMetadataSchema.parse(JSON.parse(raw)));
    } catch {
      // no metadata.json here (either not an application folder, or a
      // pre-existing folder from before this tool existed) -- skip it.
    }
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
