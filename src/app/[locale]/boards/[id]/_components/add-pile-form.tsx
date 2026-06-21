"use client";

import { useState } from "react";
import kStyles from "../_styles/Kanban.module.scss";

export function AddPileForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  return (
    <form
      className={kStyles.addPileFormWrap}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onCreate(title);
        setTitle("");
      }}
    >
      <input
        className={kStyles.addPileInput}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Pile name"
        autoFocus
        maxLength={60}
      />
      <div className={kStyles.addPileActions}>
        <button type="button" className={kStyles.btnGhost} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={kStyles.btnPrimary} disabled={!title.trim()}>
          Create
        </button>
      </div>
    </form>
  );
}
