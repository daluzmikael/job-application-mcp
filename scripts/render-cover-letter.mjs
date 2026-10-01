// Render a plain-text cover letter to PDF in Open Sans, matching the resume's font.
// Usage: node scripts/render-cover-letter.mjs <input.md> <output.pdf>
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(HERE, '../assets/fonts');

const PAGE_W = 612, PAGE_H = 792;
const MARGIN = 64;          // ~0.89in, correspondence-appropriate
const NAME_SIZE = 14;
const CONTACT_SIZE = 9;
const BODY_SIZE = 10.5;
const LINE_GAP = 1.45;
const PARA_GAP = 9;
const SHORT_LINE = 62;      // blocks whose lines are all shorter keep their breaks

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/render-cover-letter.mjs <input.md> <output.pdf>');
  process.exit(1);
}

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const regular = await doc.embedFont(readFileSync(`${FONTS}/OpenSans-Regular.ttf`), { subset: true });
const bold = await doc.embedFont(readFileSync(`${FONTS}/OpenSans-Bold.ttf`), { subset: true });

let page = doc.addPage([PAGE_W, PAGE_H]);
let y = PAGE_H - MARGIN;
const width = PAGE_W - MARGIN * 2;
const ink = rgb(0.1, 0.1, 0.1);

function draw(text, { font = regular, size = BODY_SIZE } = {}) {
  if (y < MARGIN + size) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  page.drawText(text, { x: MARGIN, y, size, font, color: ink });
  y -= size * LINE_GAP;
}

function wrap(text, font, size) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; }
    else line = next;
  }
  if (line) out.push(line);
  return out;
}

const blocks = readFileSync(resolve(inPath), 'utf8').trim().split(/\n\s*\n/);

blocks.forEach((block, i) => {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (i === 0) {
    draw(lines[0], { font: bold, size: NAME_SIZE });
    for (const l of lines.slice(1)) draw(l, { size: CONTACT_SIZE });
  } else if (lines.every(l => l.length < SHORT_LINE)) {
    for (const l of lines) draw(l);
  } else {
    for (const l of wrap(lines.join(' '), regular, BODY_SIZE)) draw(l);
  }
  y -= PARA_GAP;
});

writeFileSync(resolve(outPath), await doc.save());
console.log(`wrote ${outPath} (${doc.getPageCount()} page)`);
