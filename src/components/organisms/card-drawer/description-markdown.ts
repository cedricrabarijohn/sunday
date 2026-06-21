/* ------------------------------------------------------- *
 *   Description markdown <-> HTML.
 *
 *   The description is stored as a small, controlled subset of
 *   markdown. We render it to HTML for display/editing, and
 *   serialize the contenteditable DOM back to markdown so the stored
 *   form stays portable and we never have to trust raw HTML.
 *
 *   Everything here is pure (no React, no DOM globals beyond the Node
 *   types used while serializing a contenteditable element), so it
 *   lives apart from the CardDrawer component.
 * ------------------------------------------------------- */

export const IMAGE_LINE = /^!\[([^\]]*)\]\((\S+)\)\s*$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Allow only http(s) and root-relative URLs in <img src>. */
function safeUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith("/")) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return null;
}

function inlineMd(text: string): string {
  let t = escapeHtml(text);

  // Extract `code` spans into placeholders so bold/italic/etc. don't
  // eat markers that happen to live inside code.
  const codes: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_m, c: string) => {
    const i = codes.push(`<code>${c}</code>`) - 1;
    return ` ${i} `;
  });

  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<u>$1</u>");
  t = t.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return "";
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" draggable="false" />`;
  });

  // Restore protected code spans.
  t = t.replace(/ (\d+) /g, (_m, idx: string) => codes[Number(idx)] ?? "");

  return t;
}

export function descriptionToHtml(text: string): string {
  if (!text.trim()) return "";
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n");

      // A heading is its own single-line block: "# ", "## " or "### ".
      const heading = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.+)$/) : null;
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${inlineMd(heading[2])}</h${level}>`;
      }

      const imgMatches = lines.map((l) => l.match(IMAGE_LINE));
      if (imgMatches.every((m) => m !== null)) {
        return (
          "<p>" +
          imgMatches
            .map((m) => {
              if (!m) return "";
              const safe = safeUrl(m[2]);
              if (!safe) return "";
              return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(m[1])}" draggable="false" />`;
            })
            .join("") +
          "</p>"
        );
      }

      if (lines.every((l) => /^- /.test(l))) {
        return (
          "<ul>" +
          lines.map((l) => `<li>${inlineMd(l.replace(/^- /, ""))}</li>`).join("") +
          "</ul>"
        );
      }

      if (lines.every((l) => /^\d+\. /.test(l))) {
        return (
          "<ol>" +
          lines.map((l) => `<li>${inlineMd(l.replace(/^\d+\.\s+/, ""))}</li>`).join("") +
          "</ol>"
        );
      }

      return "<p>" + lines.map(inlineMd).join("<br>") + "</p>";
    })
    .join("");
}

// Wrap markdown with markers implied by an element's inline CSS. Browsers
// often apply Ctrl+B / Ctrl+I as `style="font-weight:bold"` on a <span>
// rather than a <b> tag, so tag-matching alone loses the formatting.
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

// Wrap already-serialized inner markdown with the markers implied by an
// element's own tag and inline style. Applied both to child elements AND to a
// top-level inline element (e.g. a bare <b>hey</b> with no paragraph around
// it), whose own formatting would otherwise be lost.
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

/** Strip every occurrence of an image URL from a description. */
export function stripImageFromDescription(text: string, url: string): string {
  if (!text || !url) return text ?? "";
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inlinePattern = new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, "g");
  const lines = text.split("\n").map((l) => l.replace(inlinePattern, ""));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
