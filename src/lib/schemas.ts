import { z } from "zod";

export const JobPostingSchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  remote: z.boolean().nullable(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  posting_date: z.string().nullable(),
  apply_url: z.string(),
  description: z.string(),
  ats_platform: z.enum(["greenhouse", "lever", "ashby", "unknown"]),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export const ApplicationStatusSchema = z.enum([
  "not_applied",
  "applied",
  "reviewing",
  "interviewing",
  "rejected",
  "accepted",
  "withdrawn",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationMetadataSchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  url: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  role_type: z.string().nullable().default(null),
  posting_date: z.string().nullable().default(null),
  applied_date: z.string().nullable().default(null),
  resume_used: z.string().nullable().default(null),
  cover_letter_used: z.boolean().default(false),
  cover_letter_file: z.string().nullable().default(null),
  projects_used: z.array(z.string()).default([]),
  status: ApplicationStatusSchema.default("applied"),
  ats_score: z.number().nullable().default(null),
  matched_keywords: z.array(z.string()).default([]),
  missing_keywords: z.array(z.string()).default([]),
  notes: z.string().default(""),
  follow_up_date: z.string().nullable().default(null),
  follow_up_sent: z.boolean().default(false),
  notion_page_id: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ApplicationMetadata = z.infer<typeof ApplicationMetadataSchema>;

export const ResumeSectionsSchema = z.object({
  objective: z.string(),
  education: z.string(),
  skills: z.string(),
  projects: z.string(),
  raw_text: z.string(),
});
export type ResumeSections = z.infer<typeof ResumeSectionsSchema>;
