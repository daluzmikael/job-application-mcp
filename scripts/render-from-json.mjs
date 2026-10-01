// Re-renders tailored resumes from the resume_content.json saved in each company folder.
//
//   node scripts/render-from-json.mjs Quora PangramLabs HolobeamTechnologies
//
// Why this exists: the MCP server loads dist/ at startup, so a renderer change
// (font, margins, spacing, section order) does NOT reach an already-running server.
// This script always uses the freshly built dist/, so after `npm run build` you can
// regenerate any past resume without re-typing its content or restarting the host.
import fs from "node:fs/promises";
import path from "node:path";
import { generateResumePdf } from "../dist/lib/pdf-generator.js";

const RESUME_DIR = "/Users/mikaeldaluz/Documents/Resume";

// Renders every resume_content.json found in a company folder, so any resume can be
// regenerated after a renderer change without re-typing its content.
const targets = process.argv.slice(2);
for (const folder of targets) {
  const dir = path.join(RESUME_DIR, folder);
  const content = JSON.parse(await fs.readFile(path.join(dir, "resume_content.json"), "utf8"));
  const bytes = await generateResumePdf(content);
  const out = path.join(dir, content._pdf_name);
  await fs.writeFile(out, bytes);
  const { PDFDocument } = await import("pdf-lib");
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  console.log(`${folder.padEnd(24)} pages=${pages}  ${out}`);
}
