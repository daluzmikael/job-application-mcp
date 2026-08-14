import mammoth from "mammoth";
import { ResumeSections } from "./schemas.js";

const SECTION_HEADINGS = ["OBJECTIVE", "EDUCATION", "SKILLS", "RELEVANT PROJECTS"] as const;

/**
 * Splits Mikael's resume text on its ALL-CAPS section headings. His resume
 * has no "Experience" section -- just Objective / Education / Skills /
 * Relevant Projects (see Phase 1 plan section 8).
 */
function splitSections(text: string): Record<string, string> {
  const lines = text.split("\n");
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) sections[current] = buffer.join("\n").trim();
    buffer = [];
  };

  for (const line of lines) {
    const cleaned = line.trim();
    const heading = SECTION_HEADINGS.find(
      (h) => cleaned.toUpperCase() === h
    );
    if (heading) {
      flush();
      current = heading;
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return sections;
}

export async function loadMasterResume(docxPath: string): Promise<ResumeSections> {
  const result = await mammoth.extractRawText({ path: docxPath });
  const rawText = result.value;
  const sections = splitSections(rawText);

  return {
    objective: sections["OBJECTIVE"] ?? "",
    education: sections["EDUCATION"] ?? "",
    skills: sections["SKILLS"] ?? "",
    projects: sections["RELEVANT PROJECTS"] ?? "",
    raw_text: rawText.trim(),
  };
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

/** Parses "Category: item, item, item" lines from the Skills section into structured groups. */
export function parseSkillCategories(skillsSection: string): SkillCategory[] {
  const categories: SkillCategory[] = [];
  for (const line of skillsSection.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const [, category, rest] = match;
    const skills = rest
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    categories.push({ category: category.trim(), skills });
  }
  return categories;
}

export function flattenSkills(categories: SkillCategory[]): string[] {
  const seen = new Set<string>();
  for (const cat of categories) {
    for (const skill of cat.skills) {
      seen.add(skill.replace(/\s*\([^)]*\)\s*$/, "").trim());
    }
  }
  return Array.from(seen);
}
