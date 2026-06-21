"use client";

import kStyles from "../_styles/Kanban.module.scss";
import type { CardAssignee } from "../_lib/board-types";
import { initialsFor, nameFor } from "../_lib/card-format";

export function AvatarStack({ assignees }: { assignees: CardAssignee[] }) {
  const visible = assignees.slice(0, 3);
  const extra = assignees.length - visible.length;
  return (
    <span className={kStyles.avatarStack} title={assignees.map(nameFor).join(", ")}>
      {visible.map((a) => (
        <span key={a.userId} className={kStyles.avatarPip}>
          {initialsFor(a)}
        </span>
      ))}
      {extra > 0 && <span className={`${kStyles.avatarPip} ${kStyles.avatarPipMore}`}>+{extra}</span>}
    </span>
  );
}
