import { PDFDocument, StandardFonts, PDFFont, PDFPage, rgb } from "pdf-lib";

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
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const NAME_SIZE = 17;
const CONTACT_SIZE = 9;
const HEADING_SIZE = 11;
const BODY_SIZE = 9.5;
const LINE_GAP = 1.25;

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
    this.y -= 4;
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
    this.y -= 8;
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
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const layout = new Layout(doc, page, regular, bold);

  layout.centeredText(content.name, bold, NAME_SIZE, 4);
  layout.centeredText(content.contactLine, regular, CONTACT_SIZE, 12);

  layout.sectionHeading("Objective");
  layout.paragraph(content.objective);
  layout.spacer(8);

  layout.sectionHeading("Education");
  for (const line of content.education) {
    layout.paragraph(line);
  }
  layout.spacer(8);

  layout.sectionHeading("Skills");
  for (const cat of content.skillCategories) {
    layout.paragraph(`${cat.category}: ${cat.skills.join(", ")}`);
  }
  layout.spacer(8);

  layout.sectionHeading("Relevant Projects");
  for (const project of content.projects) {
    layout.paragraph(project.header, { font: bold });
    if (project.subheader) {
      layout.paragraph(project.subheader, { size: BODY_SIZE - 0.5 });
    }
    layout.spacer(2);
    for (const bullet of project.bullets) {
      layout.bullet(bullet);
    }
    layout.spacer(6);
  }

  return doc.save();
}
