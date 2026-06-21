/* Markdown subset -> HTML, for rendering a card description. */

export const IMAGE_LINE = /^!\[([^\]]*)\]\((\S+)\)\s*$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
