import { extractSkills } from "./skill-dictionary.js";

export interface JobAnalysis {
  extracted_requirements: string[];
  extracted_skills: string[];
  seniority_level: string;
  estimated_salary_range: string | null;
  red_flags: string[];
}

const BULLET_LINE_RE = /^\s*[-*••]\s+/;

function splitBullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (BULLET_LINE_RE.test(l) || l.length < 200))
    .map((l) => l.replace(BULLET_LINE_RE, "").trim())
    .filter((l) => l.length > 0);
}

function detectSeniority(text: string): string {
  const lower = text.toLowerCase();
  // Matches "5+ years experience", "4-6 years of professional software development experience", etc.
  // "experience" doesn't have to immediately follow "years" -- postings routinely insert
  // "professional software development" or similar between them.
  const yearsMatch = lower.match(/(\d+)\+?\s*(?:-\s*(\d+)\s*)?\+?\s*years?\b(?:[^.\n]{0,60}\bexperience\b)?/);
  if (yearsMatch) {
    const low = parseInt(yearsMatch[1], 10);
    const high = yearsMatch[2] ? parseInt(yearsMatch[2], 10) : low;
    const label = yearsMatch[2] ? `${low}-${high} years listed` : `${low}+ years listed`;
    if (high >= 5) return `senior (${label})`;
    if (high >= 2) return `mid-level (${label})`;
    return `entry-level (${label})`;
  }
  if (/\b(new grad|entry level|entry-level|early career|junior)\b/.test(lower)) {
    return "entry-level / new grad";
  }
  if (/\b(senior|staff|principal|lead)\b/.test(lower)) {
    return "senior+";
  }
  return "unclear";
}

function detectSalaryRange(text: string): string | null {
  const rangeMatch = text.match(
    /\$\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?k?)\s*(?:-|–|to)\s*\$?\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?k?)/i
  );
  if (rangeMatch) return `$${rangeMatch[1]} - $${rangeMatch[2]}`;
  const hourlyMatch = text.match(/\$\s?(\d{2,3})\s*(?:-|–|to)\s*\$?\s?(\d{2,3})\s*\/\s*(?:hr|hour)/i);
  if (hourlyMatch) return `$${hourlyMatch[1]} - $${hourlyMatch[2]} / hr`;
  return null;
}

// CANDIDATE FACT (permanent): Mikael is a full US citizen. He does not now, and never will,
// require visa sponsorship, and he is eligible for any security clearance a role sponsors.
// Therefore "no sponsorship / must be authorized to work in the US" and "must be able to OBTAIN
// a clearance" are NOT red flags for him and must never be reported as such -- nearly every US
// posting carries that language and flagging it is pure noise. Only an ALREADY-ACTIVE clearance
// is a real gate, since that cannot be self-obtained before being hired.
const RED_FLAG_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bactive\s+(?:ts\/sci|top secret|secret)\s+clearance\b|\bcurrent\s+(?:ts\/sci|top secret)\b/i, label: "Requires an ALREADY-ACTIVE clearance (cannot be obtained post-hire)" },
  { re: /\bmust\s+be\s+(?:on-?site|in-office)\b/i, label: "Onsite required, no remote option" },
  { re: /\bunpaid\b/i, label: "Unpaid position" },
  { re: /\bmaster'?s?\s+degree\s+required\b|\bphd\s+required\b/i, label: "Advanced degree required" },
];

/**
 * Any stated years-of-experience requirement, reported range-aware.
 *
 * Threshold lowered from 5+ to 2+ on 2026-09-21: Mikael is a May 2026 graduate with no
 * professional years, so a "2-4 years" or "6 years" line is just as disqualifying as "5+".
 * A career-fair list built elsewhere had missed exactly these -- a 6-year state IT req and a
 * 2-4 year BI req were both reported as entry-level. A 0-2 / 0-3 band is NOT flagged, since
 * those are genuinely open to a new grad.
 */
function detectYearsRedFlag(text: string): string | null {
  const lower = text.toLowerCase();
  const m = lower.match(/(\d+)\+?\s*(?:-\s*(\d+)\s*)?\+?\s*years?\b(?:[^.\n]{0,60}\bexperience\b)?/);
  if (!m) return null;
  const low = parseInt(m[1], 10);
  const high = m[2] ? parseInt(m[2], 10) : low;
  if (low === 0) return null; // "0-2 years" / "0-3 years" -- open to a new grad
  if (low >= 2) return `Requires ${m[2] ? `${low}-${high}` : `${low}+`} years experience (Mikael has 0 professional years)`;
  return null;
}

export function analyzeJobPosting(text: string): JobAnalysis {
  const yearsFlag = detectYearsRedFlag(text);
  return {
    extracted_requirements: splitBullets(text).slice(0, 40),
    extracted_skills: extractSkills(text).map((m) => m.canonical),
    seniority_level: detectSeniority(text),
    estimated_salary_range: detectSalaryRange(text),
    red_flags: [
      ...(yearsFlag ? [yearsFlag] : []),
      ...RED_FLAG_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label),
    ],
  };
}

export interface SkillGap {
  matching_skills: string[];
  missing_skills: { skill: string; importance: "critical" | "nice-to-have" }[];
}

const CRITICAL_CONTEXT_RE = /require|must have|minimum|need to have|essential/i;
const NICE_TO_HAVE_CONTEXT_RE = /nice.to.have|preferred|plus|bonus|a plus|ideally/i;

export function compareSkillsGap(resumeSkillsText: string, jobPostingText: string): SkillGap {
  const resumeSkillSet = new Set(extractSkills(resumeSkillsText).map((m) => m.canonical));
  const jobSkills = extractSkills(jobPostingText);

  const matching: string[] = [];
  const missing: { skill: string; importance: "critical" | "nice-to-have" }[] = [];

  const lines = jobPostingText.split("\n");

  for (const { canonical } of jobSkills) {
    if (resumeSkillSet.has(canonical)) {
      matching.push(canonical);
      continue;
    }
    // find the line mentioning this skill to classify importance
    const skillLower = canonical.toLowerCase();
    const contextLine = lines.find((l) => l.toLowerCase().includes(skillLower.split(" ")[0]));
    const importance: "critical" | "nice-to-have" =
      contextLine && CRITICAL_CONTEXT_RE.test(contextLine)
        ? "critical"
        : contextLine && NICE_TO_HAVE_CONTEXT_RE.test(contextLine)
        ? "nice-to-have"
        : "nice-to-have";
    missing.push({ skill: canonical, importance });
  }

  return { matching_skills: matching, missing_skills: missing };
}

export interface AtsScoreResult {
  score: number;
  matches: string[];
  missing_keywords: string[];
  feedback: string;
}

export function scoreAtsMatch(resumeText: string, jobPostingText: string): AtsScoreResult {
  const jobSkills = Array.from(new Set(extractSkills(jobPostingText).map((m) => m.canonical)));
  const resumeSkillSet = new Set(extractSkills(resumeText).map((m) => m.canonical));

  if (jobSkills.length === 0) {
    return {
      score: 0.5,
      matches: [],
      missing_keywords: [],
      feedback:
        "Couldn't detect any recognizable tech keywords in the job posting text -- score is a neutral default, not a real measurement.",
    };
  }

  const matches = jobSkills.filter((s) => resumeSkillSet.has(s));
  const missing = jobSkills.filter((s) => !resumeSkillSet.has(s));
  const score = Math.round((matches.length / jobSkills.length) * 100) / 100;

  const feedback =
    missing.length === 0
      ? `Strong keyword match: all ${jobSkills.length} detected keywords are present in the resume.`
      : `Matched ${matches.length}/${jobSkills.length} detected keywords. Missing: ${missing.join(", ")}.`;

  return { score, matches, missing_keywords: missing, feedback };
}
