"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FilterIcon,
  PlugIcon,
  SettingsIcon,
  TableIcon,
  UsersIcon,
} from "@/components/Icons";
import { colorForName } from "@/lib/palette";
import kStyles from "./Kanban.module.scss";
import {
  fieldFilterCount,
  type BoardColumn,
  type BoardFilterState,
  type CardAssignee,
  type Pile,
  type WorkspaceLabel,
} from "./board-types";
import { nameFor } from "./card-format";

export function BoardActionsMenu({
  boardId,
  workspaceId,
  canManageMembers,
}: {
  boardId: number;
  workspaceId: number;
  canManageMembers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: {
    href: string;
    label: string;
    sub: string;
    icon: ReactNode;
    show: boolean;
  }[] = [
    {
      href: `/boards/${boardId}/settings`,
      label: "Board settings",
      sub: "Rename or delete this board",
      icon: <SettingsIcon size={16} />,
      show: true,
    },
    {
      href: `/boards/${boardId}/fields`,
      label: "Custom fields",
      sub: "Add and configure card fields",
      icon: <TableIcon size={16} />,
      show: true,
    },
    {
      href: `/boards/${boardId}/members`,
      label: "Members",
      sub: "Who can see this board",
      icon: <UsersIcon size={16} />,
      show: true,
    },
    {
      href: `/workspaces/${workspaceId}/integrations`,
      label: "Integrations",
      sub: "Connect Gitea & more",
      icon: <PlugIcon size={16} />,
      show: canManageMembers,
    },
  ];

  return (
    <div className={kStyles.filterWrap} ref={wrapRef}>
      <button
        type="button"
        className={kStyles.filterBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SettingsIcon size={14} />
        <span>Manage</span>
      </button>
      {open && (
        <div className={kStyles.actionsMenu} role="menu">
          {items
            .filter((it) => it.show)
            .map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={kStyles.actionItem}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className={kStyles.actionIcon}>{it.icon}</span>
                <span className={kStyles.actionText}>
                  <span className={kStyles.actionLabel}>{it.label}</span>
                  <span className={kStyles.actionSub}>{it.sub}</span>
                </span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}

export function BoardFilter({
  filter,
  setFilter,
  allAssignees,
  allLabels,
  columns,
  currentUserId,
}: {
  filter: BoardFilterState;
  setFilter: (next: BoardFilterState) => void;
  allAssignees: CardAssignee[];
  allLabels: WorkspaceLabel[];
  columns: BoardColumn[];
  currentUserId: number;
}) {
  // Only select / multi_select fields with options are filterable.
  const filterableFields = columns.filter(
    (c) =>
      (c.type === "select" || c.type === "multi_select") &&
      (c.config?.options?.length ?? 0) > 0,
  );
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count =
    (filter.query.trim() ? 1 : 0) +
    filter.assigneeIds.size +
    filter.labelIds.size +
    (filter.due === "any" ? 0 : 1) +
    fieldFilterCount(filter.fields);

  const toggleAssignee = (uid: number) => {
    const next = new Set(filter.assigneeIds);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setFilter({ ...filter, assigneeIds: next });
  };
  const toggleLabel = (lid: number) => {
    const next = new Set(filter.labelIds);
    if (next.has(lid)) next.delete(lid);
    else next.add(lid);
    setFilter({ ...filter, labelIds: next });
  };
  const toggleFieldOption = (colId: number, optId: string) => {
    const fields = new Map(filter.fields);
    const next = new Set(fields.get(colId));
    if (next.has(optId)) next.delete(optId);
    else next.add(optId);
    if (next.size === 0) fields.delete(colId);
    else fields.set(colId, next);
    setFilter({ ...filter, fields });
  };
  const clearField = (colId: number) => {
    const fields = new Map(filter.fields);
    fields.delete(colId);
    setFilter({ ...filter, fields });
  };
  const reset = () =>
    setFilter({
      query: "",
      assigneeIds: new Set(),
      labelIds: new Set(),
      due: "any",
      fields: new Map(),
    });

  return (
    <div className={kStyles.filterWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${kStyles.filterBtn} ${count > 0 ? kStyles.filterBtnActive : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `Filters (${count} active)` : "Filters"}
      >
        <FilterIcon size={14} />
        <span>Filter{count > 0 ? ` · ${count}` : ""}</span>
      </button>
      {open && (
        <div className={kStyles.filterMenu} role="dialog">
          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Search</span>
              {filter.query && (
                <button
                  type="button"
                  className={kStyles.filterClear}
                  onClick={() => setFilter({ ...filter, query: "" })}
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="search"
              className={kStyles.filterSearch}
              placeholder="Filter by card title…"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
              autoFocus
            />
          </div>

          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Assignees</span>
              {filter.assigneeIds.size > 0 && (
                <button
                  type="button"
                  className={kStyles.filterClear}
                  onClick={() => setFilter({ ...filter, assigneeIds: new Set() })}
                >
                  Clear
                </button>
              )}
            </div>
            {allAssignees.length === 0 ? (
              <div className={kStyles.filterEmpty}>No assignees on this board yet.</div>
            ) : (
              <div className={kStyles.filterChips}>
                {allAssignees.some((a) => a.userId === currentUserId) && (
                  <button
                    type="button"
                    className={`${kStyles.filterChip} ${
                      filter.assigneeIds.has(currentUserId) ? kStyles.filterChipActive : ""
                    }`}
                    onClick={() => toggleAssignee(currentUserId)}
                  >
                    Me
                  </button>
                )}
                {allAssignees
                  .filter((a) => a.userId !== currentUserId)
                  .map((a) => (
                    <button
                      key={a.userId}
                      type="button"
                      className={`${kStyles.filterChip} ${
                        filter.assigneeIds.has(a.userId) ? kStyles.filterChipActive : ""
                      }`}
                      onClick={() => toggleAssignee(a.userId)}
                    >
                      {nameFor(a)}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Labels</span>
              {filter.labelIds.size > 0 && (
                <button
                  type="button"
                  className={kStyles.filterClear}
                  onClick={() => setFilter({ ...filter, labelIds: new Set() })}
                >
                  Clear
                </button>
              )}
            </div>
            {allLabels.length === 0 ? (
              <div className={kStyles.filterEmpty}>No labels in this workspace.</div>
            ) : (
              <div className={kStyles.filterChips}>
                {allLabels.map((l) => {
                  const c = colorForName(l.color);
                  const active = filter.labelIds.has(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`${kStyles.filterChip} ${active ? kStyles.filterChipActive : ""}`}
                      style={active ? { background: c.soft, color: c.hue, borderColor: c.soft } : undefined}
                      onClick={() => toggleLabel(l.id)}
                    >
                      <span
                        className={kStyles.cardChipDot}
                        style={{ background: c.hue, marginRight: 6 }}
                        aria-hidden
                      />
                      {l.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {filterableFields.map((col) => {
            const selected = filter.fields.get(col.id) ?? new Set<string>();
            return (
              <div className={kStyles.filterSection} key={col.id}>
                <div className={kStyles.filterHead}>
                  <span>{col.label || "Field"}</span>
                  {selected.size > 0 && (
                    <button
                      type="button"
                      className={kStyles.filterClear}
                      onClick={() => clearField(col.id)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className={kStyles.filterChips}>
                  {(col.config?.options ?? []).map((opt) => {
                    const active = selected.has(opt.id);
                    const c = opt.color ? colorForName(opt.color) : null;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`${kStyles.filterChip} ${active ? kStyles.filterChipActive : ""}`}
                        style={
                          active && c
                            ? { background: c.soft, color: c.hue, borderColor: c.soft }
                            : undefined
                        }
                        onClick={() => toggleFieldOption(col.id, opt.id)}
                      >
                        {c && (
                          <span
                            className={kStyles.cardChipDot}
                            style={{ background: c.hue, marginRight: 6 }}
                            aria-hidden
                          />
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Due date</span>
            </div>
            <div className={kStyles.filterChips}>
              {(["any", "withDue", "overdue"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`${kStyles.filterChip} ${
                    filter.due === opt ? kStyles.filterChipActive : ""
                  }`}
                  onClick={() => setFilter({ ...filter, due: opt })}
                >
                  {opt === "any" ? "Any" : opt === "withDue" ? "Has a due date" : "Overdue"}
                </button>
              ))}
            </div>
          </div>

          {count > 0 && (
            <div className={kStyles.filterFoot}>
              <button type="button" className={kStyles.filterReset} onClick={reset}>
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
