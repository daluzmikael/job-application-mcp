import { PDFDocument, StandardFonts, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolves to <project-root>/assets/fonts regardless of whether this file is running
// from src/ (ts-node) or dist/lib (compiled) -- both are exactly two levels under the root.
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");

export interface ResumeProject {
  header: string; // e.g. "DataSport — AI-Powered NBA Analytics Platform, ..."
  subheader?: string; // e.g. "Senior Design Project ... | Sept 2025 - May 2026"
  bullets: string[];
}

export interface ResumeSkillCategory {
  category: string;
  skills: string[];
}

export interface ResumeContent {
  name: string;
  contactLine: string;
  objective: string;
  education: string[]; // one or more lines, e.g. ["University of Connecticut, Storrs, CT", "Bachelor of Science: Computer Science, May 2026"]
  skillCategories: ResumeSkillCategory[];
  projects: ResumeProject[];
  // Optional -- rendered as the last section, after Relevant Projects. Same shape as a
  // project entry (header/subheader/bullets), e.g. header "Summer Help — Westford Public
  // Schools", subheader "June 2022 – August 2025".
  workHistory?: ResumeProject[];
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 30; // 0.42in -- narrowed further (was 36/0.5in) to help fit one page
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const NAME_SIZE = 14;
const CONTACT_SIZE = 8.5;
const HEADING_SIZE = 10;
const BODY_SIZE = 9;
const LINE_GAP = 1.05;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

class Layout {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;

  constructor(doc: PDFDocument, page: PDFPage, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.page = page;
    this.regular = regular;
    this.bold = bold;
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  centeredText(text: string, font: PDFFont, size: number, gapAfter: number) {
    this.ensureSpace(size + gapAfter);
    const width = font.widthOfTextAtSize(text, size);
    this.page.drawText(text, {
      x: (PAGE_WIDTH - width) / 2,
      y: this.y - size,
      size,
      font,
    });
    this.y -= size + gapAfter;
  }

  sectionHeading(text: string) {
    this.ensureSpace(HEADING_SIZE + 10);
    this.y -= 1;
    this.page.drawText(text.toUpperCase(), {
      x: MARGIN,
      y: this.y - HEADING_SIZE,
      size: HEADING_SIZE,
      font: this.bold,
    });
    this.y -= HEADING_SIZE + 2;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.75,
      color: rgb(0.2, 0.2, 0.2),
    });
    this.y -= 3;
  }

  paragraph(text: string, opts: { size?: number; font?: PDFFont; indent?: number } = {}) {
    const size = opts.size ?? BODY_SIZE;
    const font = opts.font ?? this.regular;
    const indent = opts.indent ?? 0;
    const lines = wrapText(text, font, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      this.ensureSpace(size * LINE_GAP);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font });
      this.y -= size * LINE_GAP;
    }
  }

  bullet(text: string) {
    const size = BODY_SIZE;
    const bulletIndent = 12;
    const lines = wrapText(text, this.regular, size, CONTENT_WIDTH - bulletIndent);
    lines.forEach((line, i) => {
      this.ensureSpace(size * LINE_GAP);
      const prefix = i === 0 ? "• " : "  ";
      this.page.drawText(prefix + line, {
        x: MARGIN + bulletIndent - 12,
        y: this.y - size,
        size,
        font: this.regular,
      });
      this.y -= size * LINE_GAP;
    });
  }

  spacer(px: number) {
    this.y -= px;
  }
}

export async function generateResumePdf(content: ResumeContent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const [regularBytes, boldBytes] = await Promise.all([
    fs.readFile(path.join(FONTS_DIR, "OpenSans-Regular.ttf")),
    fs.readFile(path.join(FONTS_DIR, "OpenSans-Bold.ttf")),
  ]);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });

  const layout = new Layout(doc, page, regular, bold);

  layout.centeredText(content.name, bold, NAME_SIZE, 4);
  layout.centeredText(content.contactLine, regular, CONTACT_SIZE, 12);

  layout.sectionHeading("Objective");
  layout.paragraph(content.objective);
  layout.spacer(3);

  layout.sectionHeading("Education");
  for (const line of content.education) {
    layout.paragraph(line);
  }
  layout.spacer(3);

  layout.sectionHeading("Skills");
  for (const cat of content.skillCategories) {
    layout.paragraph(`${cat.category}: ${cat.skills.join(", ")}`);
  }
  layout.spacer(3);

  layout.sectionHeading("Relevant Projects");
  for (const project of content.projects) {
    layout.paragraph(project.header, { font: bold });
    if (project.subheader) {
      layout.paragraph(project.subheader, { size: BODY_SIZE - 0.5 });
    }
    layout.spacer(1);
    for (const bullet of project.bullets) {
      layout.bullet(bullet);
    }
    layout.spacer(2);
  }

  if (content.workHistory && content.workHistory.length > 0) {
    layout.sectionHeading("Work Experience");
    for (const job of content.workHistory) {
      layout.paragraph(job.header, { font: bold });
      if (job.subheader) {
        layout.paragraph(job.subheader, { size: BODY_SIZE - 0.5 });
      }
      layout.spacer(1);
      for (const bullet of job.bullets) {
        layout.bullet(bullet);
      }
      layout.spacer(2);
    }
  }

  return doc.save();
}
