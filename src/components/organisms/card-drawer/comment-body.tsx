import styles from "./CardDrawer.module.scss";
import type { Assignee } from "./types";
import { nameForAssignee } from "./format";

export function CommentBody({
  body,
  directory,
  currentUserId,
}: {
  body: string;
  directory: Map<number, Assignee>;
  currentUserId?: number;
}) {
  if (!body) return null;
  const parts: Array<{ type: "text" | "mention"; value: string; userId?: number }> = [];
  const re = /<@(\d+)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: body.slice(last, m.index) });
    }
    parts.push({ type: "mention", value: m[0], userId: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", value: body.slice(last) });
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        const ref = p.userId != null ? directory.get(p.userId) : null;
        const isMe = p.userId != null && p.userId === currentUserId;
        const name = ref ? nameForAssignee(ref) : "unknown";
        return (
          <span
            key={i}
            className={isMe ? styles.mentionChipSelf : styles.mentionChip}
          >
            @{name}
          </span>
        );
      })}
    </>
  );
}
