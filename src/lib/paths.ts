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

export function metadataFilePath(company: string): string {
  return path.join(companyFolderPath(company), "metadata.json");
}

export function jobPostingFilePath(company: string): string {
  return path.join(companyFolderPath(company), "job_posting.md");
}

export function coverLetterFilePath(company: string): string {
  return path.join(companyFolderPath(company), "cover_letter.md");
}

export function followupDraftFilePath(company: string): string {
  return path.join(companyFolderPath(company), "followup_email.md");
}

export const APPLICATIONS_CSV_PATH = path.join(DATA_DIR, "applications_tracker.csv");
