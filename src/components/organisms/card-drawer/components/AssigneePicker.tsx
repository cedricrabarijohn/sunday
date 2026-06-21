"use client";

import styles from "@/components/organisms/card-drawer/styles/CardDrawer.module.scss";
import type { Assignee } from "@/components/organisms/card-drawer/lib/types";
import { initialsForAssignee, nameForAssignee } from "@/components/organisms/card-drawer/lib/format";

export function AssigneePicker({
  members,
  loading,
  selected,
  onToggle,
}: {
  members: Assignee[];
  loading: boolean;
  selected: Set<number>;
  onToggle: (member: Assignee) => void;
}) {
  if (loading) {
    return <div className={styles.pickerEmpty}>Loading board members…</div>;
  }
  if (members.length === 0) {
    return (
      <div className={styles.pickerEmpty}>
        No one else is on this board yet. Invite people from the board members page.
      </div>
    );
  }
  return (
    <div className={styles.assigneePicker}>
      {members.map((m) => {
        const active = selected.has(m.userId);
        return (
          <button
            key={m.userId}
            type="button"
            className={`${styles.assigneePickerRow} ${active ? styles.assigneePickerRowActive : ""}`}
            onClick={() => onToggle(m)}
          >
            <span className={styles.assigneePip}>{initialsForAssignee(m)}</span>
            <span className={styles.assigneePickerName}>{nameForAssignee(m)}</span>
            <span className={styles.assigneePickerMark} aria-hidden>
              {active ? "✓" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
