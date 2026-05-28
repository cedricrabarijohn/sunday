/**
 * Comment bodies embed mentions as <@USERID> tokens so renaming a user
 * never breaks an old comment. This helper pulls the unique ids out.
 */
export function extractMentionedUserIds(body: string | null): number[] {
  if (!body) return [];
  const ids = new Set<number>();
  const re = /<@(\d+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.add(id);
  }
  return Array.from(ids);
}
