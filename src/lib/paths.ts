import { homedir } from "node:os";
import path from "node:path";

// ~/Documents/Resume is Mikael's existing workspace. Overridable for testing.
export const DATA_DIR =
  process.env.RESUME_DATA_DIR ?? path.join(homedir(), "Documents", "Resume");

export const MASTER_RESUME_PATH = path.join(DATA_DIR, "Senior_resume.docx");

export const COMPANY_CACHE_PATH = path.join(DATA_DIR, ".mcp_company_cache.json");

/** Turns "Crate & Barrel" -> "CrateBarrel", "OpenAI" -> "OpenAI". Deterministic, filesystem-safe. */
export function normalizeCompanyFolderName(company: string): string {
  const words = company
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const joined = words.join("");
  return joined.length > 0 ? joined : "UnknownCompany";
}

export function companyFolderPath(company: string): string {
  return path.join(DATA_DIR, normalizeCompanyFolderName(company));
}

export function resumePdfFileName(company: string): string {
  return `${normalizeCompanyFolderName(company).toLowerCase()}_resume.pdf`;
}

/** Turns "Forward Deployed Software Engineer" -> "forward-deployed-software-engineer". */
export function slugifyRole(role: string): string {
  const slug = role
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug.length > 0 ? slug : "role";
}

/**
 * The default metadata slot for a company -- used when a company has only
 * one logged application. Keeps the common case's filename unchanged
 * (metadata.json) for backward compatibility with folders written before
 * per-role tracking existed.
 */
export function legacyMetadataFilePath(company: string): string {
  return path.join(companyFolderPath(company), "metadata.json");
}

/** The role-scoped metadata slot, used once a company has more than one logged role. */
export function metadataFilePath(company: string, role: string): string {
  return path.join(companyFolderPath(company), `metadata.${slugifyRole(role)}.json`);
}

export function coverLetterFilePath(company: string): string {
  return path.join(companyFolderPath(company), "cover_letter.md");
}

/**
 * Companion files (job posting text, follow-up draft) are named to mirror
 * whichever metadata slot they belong to -- metadata.json pairs with
 * job_posting.md / followup_email.md, and metadata.<role>.json pairs with
 * job_posting.<role>.md / followup_email.<role>.md. This keeps multiple
 * roles at the same company from clobbering each other's drafts.
 */
function companionFilePath(metadataPath: string, baseName: string, ext: string): string {
  const dir = path.dirname(metadataPath);
  const base = path.basename(metadataPath, ".json"); // "metadata" or "metadata.<role-slug>"
  const suffix = base === "metadata" ? "" : base.slice("metadata".length); // "" or ".<role-slug>"
  return path.join(dir, `${baseName}${suffix}.${ext}`);
}

export function jobPostingFilePath(metadataPath: string): string {
  return companionFilePath(metadataPath, "job_posting", "md");
}

export function followupDraftFilePath(metadataPath: string): string {
  return companionFilePath(metadataPath, "followup_email", "md");
}

export const APPLICATIONS_CSV_PATH = path.join(DATA_DIR, "applications_tracker.csv");
