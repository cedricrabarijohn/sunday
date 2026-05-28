"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./SearchBar.module.scss";

type Result = {
  id: number;
  title: string | null;
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
};

const DEBOUNCE_MS = 250;

export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);

  // Debounced fetch on query change.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      const myId = ++reqIdRef.current;
      try {
        const res = await fetch(
          `/api/search/cards?q=${encodeURIComponent(trimmed)}`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          if (myId === reqIdRef.current) {
            setResults([]);
            setOpen(true);
            setLoading(false);
          }
          return;
        }
        const data: { results: Result[] } = await res.json();
        if (myId === reqIdRef.current) {
          setResults(data.results ?? []);
          setOpen(true);
          setHighlight(0);
          setLoading(false);
        }
      } catch {
        if (myId === reqIdRef.current) {
          setResults([]);
          setOpen(true);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(r: Result) {
    setOpen(false);
    setQuery("");
    setResults([]);
    inputRef.current?.blur();
    router.push(`/boards/${r.boardId}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlight] ?? results[0];
      if (r) go(r);
    }
  }

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length > 0;

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.inputWrap}>
        <span className={styles.icon} aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="Search cards"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (trimmed) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          aria-label="Search cards across workspaces"
          autoComplete="off"
        />
      </div>

      {showDropdown && (
        <div className={styles.dropdown} role="listbox">
          {loading && results.length === 0 ? (
            <div className={styles.status}>Searching…</div>
          ) : results.length === 0 ? (
            <div className={styles.status}>No cards match “{trimmed}”.</div>
          ) : (
            <ul className={styles.list}>
              {results.map((r, idx) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${
                      idx === highlight ? styles.itemActive : ""
                    }`}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => go(r)}
                    role="option"
                    aria-selected={idx === highlight}
                  >
                    <span className={styles.itemTitle}>
                      {r.title?.trim() ? r.title : "Untitled"}
                    </span>
                    <span className={styles.itemSub}>
                      {r.workspaceTitle || "workspace"} ·{" "}
                      <span className={styles.itemBoard}>
                        {r.boardTitle || "board"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
