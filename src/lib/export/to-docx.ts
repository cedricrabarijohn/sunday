/* Serialize a loaded board export to a .docx document (the `docx` package).
 *
 * Card descriptions and comment bodies are Markdown (the subset defined by
 * `markdown-to-html.ts`); this mirrors that block model into Word paragraphs.
 * Block-level images that point at local uploads are embedded; anything else
 * (remote/S3 images) is rendered as a hyperlink — the v1 image policy. */

import { promises as fs } from "fs";
import path from "path";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { formatFieldValue } from "@/lib/fields";
import { nameFor } from "@/lib/card-format";
import { imageMeta } from "@/lib/export/image-size";
import { IMAGE_LINE } from "@/components/organisms/card-drawer/lib/markdown-to-html";
import type { BoardExport, ExportTask } from "@/lib/board-export";
import type { ExportMeta } from "@/lib/export/to-markdown";

const DESC_HEADING = [HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const MAX_IMG_WIDTH = 500; // px

function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

// Any inline marker: code, bold, underline, strike, italic, inline-image.
const INLINE =
  /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|!\[[^\]]*\]\([^)\s]+\))/g;

/** Parse one line of inline Markdown into styled runs (non-nested, mirroring
 *  the source renderer). Inline images degrade to their alt text. */
function inlineRuns(text: string, base: { break?: number } = {}): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  let first = true;
  const push = (opts: ConstructorParameters<typeof TextRun>[0]) => {
    const o = typeof opts === "string" ? { text: opts } : opts;
    runs.push(new TextRun(first && base.break ? { ...o, break: base.break } : o));
    first = false;
  };

  for (const m of text.matchAll(INLINE)) {
    const token = m[0];
    const idx = m.index ?? 0;
    if (idx > last) push({ text: text.slice(last, idx) });
    if (token.startsWith("**")) push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith("__")) push({ text: token.slice(2, -2), underline: {} });
    else if (token.startsWith("~~")) push({ text: token.slice(2, -2), strike: true });
    else if (token.startsWith("`")) push({ text: token.slice(1, -1), font: "Consolas" });
    else if (token.startsWith("![")) {
      const alt = /!\[([^\]]*)\]/.exec(token)?.[1] ?? "";
      if (alt) push({ text: alt, italics: true });
    } else push({ text: token.slice(1, -1), italics: true });
    last = idx + token.length;
  }
  if (last < text.length) push({ text: text.slice(last) });
  if (!runs.length) push({ text: "" });
  return runs;
}

/** Resolve a local (`/uploads/...`) image URL to bytes on disk, safely. Remote
 *  URLs and traversal attempts return null. */
async function readLocalImage(url: string): Promise<Buffer | null> {
  if (!url.startsWith("/")) return null;
  const publicDir = path.join(process.cwd(), "public");
  const full = path.join(publicDir, url.replace(/^\/+/, ""));
  if (!full.startsWith(publicDir + path.sep)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

async function imageParagraph(alt: string, url: string): Promise<Paragraph> {
  const bytes = await readLocalImage(url);
  const meta = bytes ? imageMeta(bytes) : null;
  if (bytes && meta) {
    const scale = meta.width > MAX_IMG_WIDTH ? MAX_IMG_WIDTH / meta.width : 1;
    return new Paragraph({
      children: [
        new ImageRun({
          type: meta.type,
          data: bytes,
          transformation: {
            width: Math.round(meta.width * scale),
            height: Math.round(meta.height * scale),
          },
        }),
      ],
    });
  }
  // Fallback: a hyperlink to the image.
  return new Paragraph({
    children: [
      new ExternalHyperlink({
        children: [new TextRun({ text: alt || url, style: "Hyperlink" })],
        link: url,
      }),
    ],
  });
}

/** Convert a Markdown block string into Word paragraphs, mirroring
 *  `descriptionToHtml`'s block model. */
async function markdownBlocks(text: string): Promise<Paragraph[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const out: Paragraph[] = [];

  for (const raw of trimmed.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split("\n");

    const heading = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.+)$/) : null;
    if (heading) {
      out.push(
        new Paragraph({
          heading: DESC_HEADING[heading[1].length - 1],
          children: inlineRuns(heading[2]),
        }),
      );
      continue;
    }

    const imgMatches = lines.map((l) => l.match(IMAGE_LINE));
    if (imgMatches.every((m) => m !== null)) {
      for (const m of imgMatches) if (m) out.push(await imageParagraph(m[1], m[2]));
      continue;
    }

    if (lines.every((l) => /^- /.test(l))) {
      for (const l of lines) {
        out.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(l.replace(/^- /, "")) }));
      }
      continue;
    }

    if (lines.every((l) => /^\d+\. /.test(l))) {
      lines.forEach((l, i) => {
        out.push(new Paragraph({ children: inlineRuns(`${i + 1}. ${l.replace(/^\d+\.\s+/, "")}`) }));
      });
      continue;
    }

    // Plain paragraph: soft line breaks between lines.
    const children: TextRun[] = [];
    lines.forEach((l, i) => children.push(...inlineRuns(l, i ? { break: 1 } : {})));
    out.push(new Paragraph({ children }));
  }

  return out;
}

function metaParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
  });
}

async function cardParagraphs(card: ExportTask, columns: BoardExport["columns"]): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(card.title?.trim() || "Untitled card")] }),
  );

  if (card.labels.length) out.push(metaParagraph("Labels", card.labels.map((l) => l.title).join(", ")));
  if (card.assignees.length) out.push(metaParagraph("Assignees", card.assignees.map(nameFor).join(", ")));
  if (card.dueAt) out.push(metaParagraph("Due", fmtDate(card.dueAt)));
  for (const col of columns) {
    const text = formatFieldValue(col.type, card.fields[col.id], col.config);
    if (text) out.push(metaParagraph(col.label ?? "Field", text));
  }

  if (card.description?.trim()) out.push(...(await markdownBlocks(card.description)));

  if (card.checklist.length) {
    out.push(new Paragraph({ children: [new TextRun({ text: "Checklist", bold: true })] }));
    for (const item of card.checklist) {
      out.push(new Paragraph({ children: [new TextRun(`${item.done ? "☑" : "☐"} ${item.title}`)] }));
    }
  }

  if (card.comments.length) {
    out.push(new Paragraph({ children: [new TextRun({ text: "Comments", bold: true })] }));
    for (const c of card.comments) {
      const stamp = fmtDate(c.createdAt);
      out.push(
        new Paragraph({
          children: [
            new TextRun({ text: c.author, bold: true }),
            ...(stamp ? [new TextRun({ text: ` — ${stamp}`, italics: true, color: "888888" })] : []),
          ],
        }),
      );
      out.push(...(await markdownBlocks(c.body || "")));
    }
  }

  return out;
}

export async function boardToDocx(data: BoardExport, meta: ExportMeta): Promise<Buffer> {
  const children: Paragraph[] = [];
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(data.board.title)] }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text:
            `Workspace: ${data.board.workspaceTitle} · Exported ${fmtDate(meta.generatedAt)}` +
            (meta.filtered ? " · filtered view" : ""),
          italics: true,
          color: "888888",
        }),
      ],
    }),
  );

  for (const pile of data.piles) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(pile.title)] }));
    if (!pile.cards.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: "No cards.", italics: true })] }));
      continue;
    }
    for (const card of pile.cards) children.push(...(await cardParagraphs(card, data.columns)));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
