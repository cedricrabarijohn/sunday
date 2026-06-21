/* Contenteditable DOM -> markdown subset, for saving a card description. */

import { IMAGE_LINE } from "./markdown-to-html";

function styleMarkers(c: HTMLElement, inner: string): string {
  if (!inner) return inner;
  const fw = c.style.fontWeight;
  const isBold = fw === "bold" || fw === "bolder" || (fw !== "" && Number(fw) >= 600);
  const isItalic = c.style.fontStyle === "italic";
  const deco = `${c.style.textDecoration} ${c.style.textDecorationLine}`;
  const isUnder = deco.includes("underline");
  const isStrike = deco.includes("line-through");
  let s = inner;
  if (isBold) s = `**${s}**`;
  if (isItalic) s = `*${s}*`;
  if (isUnder) s = `__${s}__`;
  if (isStrike) s = `~~${s}~~`;
  return s;
}

function wrapInline(el: HTMLElement, inner: string): string {
  const tag = el.tagName;
  if (tag === "STRONG" || tag === "B") return `**${inner}**`;
  if (tag === "EM" || tag === "I") return `*${inner}*`;
  if (tag === "U") return `__${inner}__`;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") return `~~${inner}~~`;
  if (tag === "CODE") return `\`${inner}\``;
  // SPAN / FONT / etc.: formatting may live in inline CSS.
  return styleMarkers(el, inner);
}

function inlineToMarkdown(el: Node): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const c = child as HTMLElement;
    const tag = c.tagName;
    if (tag === "BR") {
      out += "\n";
    } else if (tag === "IMG") {
      const img = c as HTMLImageElement;
      const alt = (img.alt ?? "").replace(/[\]\[]/g, "");
      out += `\n![${alt}](${img.src})\n`;
    } else {
      out += wrapInline(c, inlineToMarkdown(c));
    }
  }
  return out;
}

const INLINE_TAGS = new Set([
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "CODE",
  "A",
  "SPAN",
  "FONT",
  "SUB",
  "SUP",
  "MARK",
  "SMALL",
]);

export function serializeDescription(editor: HTMLElement): string {
  const blocks: string[] = [];

  const pushParagraph = (markdown: string) => {
    const lines = markdown.split("\n");
    let buf: string[] = [];
    const flush = () => {
      if (buf.length === 0) return;
      const text = buf.join("\n").trim();
      if (text) blocks.push(text);
      buf = [];
    };
    for (const line of lines) {
      if (IMAGE_LINE.test(line.trim())) {
        flush();
        blocks.push(line.trim());
      } else {
        buf.push(line);
      }
    }
    flush();
  };

  const visit = (parent: Node) => {
    let inlineBuf: string[] = [];
    const flushInline = () => {
      const md = inlineBuf.join("").trim();
      if (md) pushParagraph(md);
      inlineBuf = [];
    };

    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        inlineBuf.push(node.textContent ?? "");
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      const tag = el.tagName;

      if (tag === "BR") {
        inlineBuf.push("\n");
        continue;
      }
      if (INLINE_TAGS.has(tag)) {
        // Apply el's OWN tag/style, not just its children's.
        inlineBuf.push(wrapInline(el, inlineToMarkdown(el)));
        continue;
      }
      if (tag === "IMG") {
        // Top-level image: its own block.
        flushInline();
        const img = el as HTMLImageElement;
        const alt = (img.alt ?? "").replace(/[\]\[]/g, "");
        blocks.push(`![${alt}](${img.src})`);
        continue;
      }

      // Block elements from here on: flush any pending inline content.
      flushInline();

      if (tag === "UL") {
        const items = Array.from(el.children).filter((c) => c.tagName === "LI") as HTMLElement[];
        if (items.length) {
          // Whole list = one block so the renderer sees consecutive
          // "- " lines and groups them back into a single <ul>.
          blocks.push(items.map((li) => `- ${inlineToMarkdown(li).trim()}`).join("\n"));
        }
        continue;
      }
      if (tag === "OL") {
        const items = Array.from(el.children).filter((c) => c.tagName === "LI") as HTMLElement[];
        if (items.length) {
          blocks.push(items.map((li, i) => `${i + 1}. ${inlineToMarkdown(li).trim()}`).join("\n"));
        }
        continue;
      }
      if (/^H[1-6]$/.test(tag)) {
        const level = Math.min(3, Number(tag[1])); // we support # to ###
        const inner = inlineToMarkdown(el).trim();
        if (inner) blocks.push(`${"#".repeat(level)} ${inner}`);
        continue;
      }
      if (
        tag === "P" ||
        tag === "DIV" ||
        tag === "BLOCKQUOTE" ||
        tag === "SECTION" ||
        tag === "ARTICLE" ||
        tag === "HEADER" ||
        tag === "FOOTER"
      ) {
        // Recurse so nested lists, images, etc. are picked up correctly.
        visit(el);
        continue;
      }

      // Unknown block: just keep its inline content as a paragraph.
      pushParagraph(inlineToMarkdown(el));
    }

    flushInline();
  };

  visit(editor);
  return blocks.join("\n\n").trim();
}

export function stripImageFromDescription(text: string, url: string): string {
  if (!text || !url) return text ?? "";
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inlinePattern = new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, "g");
  const lines = text.split("\n").map((l) => l.replace(inlinePattern, ""));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
