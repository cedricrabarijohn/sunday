"use client";

import { FormEvent, useState } from "react";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import styles from "./Settings.module.scss";

export type TokenSummary = {
  id: number;
  name: string;
  prefix: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default function ApiTokensClient({
  initialTokens,
  mcpUrl,
}: {
  initialTokens: TokenSummary[];
  mcpUrl: string;
}) {
  const toast = useToast();
  const [tokens, setTokens] = useState<TokenSummary[]>(initialTokens);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("0"); // days; 0 = never
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy");
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setFresh(null);
    try {
      const res = await fetch("/api/me/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          expiresInDays: expiry === "0" ? null : Number(expiry),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not create token");
        return;
      }
      const t = data.token as { id: number; name: string; token: string; prefix: string };
      setFresh(t.token);
      setTokens((prev) => [
        {
          id: t.id,
          name: t.name,
          prefix: t.prefix,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          expiresAt: null,
        },
        ...prev,
      ]);
      setName("");
      setExpiry("0");
    } catch {
      toast.error("Network error.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: number) {
    const prev = tokens;
    setTokens((t) => t.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/me/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setTokens(prev);
        toast.error("Could not revoke token");
      }
    } catch {
      setTokens(prev);
      toast.error("Network error.");
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>API tokens &amp; MCP</h2>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>MCP endpoint</label>
        <div className={styles.codeBox}>
          <code>{mcpUrl}</code>
          <button type="button" className={styles.copyBtn} onClick={() => copy(mcpUrl, "URL")}>
            Copy
          </button>
        </div>
        <div className={styles.hint} style={{ color: "var(--text-3)" }}>
          Add this as a remote MCP server with a Bearer token below, or bridge it to a
          local client with <code>npx mcp-remote {mcpUrl} --header &quot;Authorization: Bearer &lt;token&gt;&quot;</code>.
        </div>
      </div>

      {fresh && (
        <div className={styles.tokenReveal}>
          <div className={styles.tokenRevealHead}>Your new token — copy it now</div>
          <div className={styles.codeBox}>
            <code>{fresh}</code>
            <button type="button" className={styles.copyBtn} onClick={() => copy(fresh, "Token")}>
              Copy
            </button>
          </div>
          <div className={styles.tokenRevealWarn}>
            This is the only time the full token is shown. Store it somewhere safe.
          </div>
        </div>
      )}

      <form onSubmit={create}>
        <div className={styles.row}>
          <div className={styles.field} style={{ flex: 2 }}>
            <label className={styles.label} htmlFor="tokenName">Token name</label>
            <input
              id="tokenName"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Claude Desktop"
              maxLength={60}
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label} htmlFor="tokenExp">Expires</label>
            <select
              id="tokenExp"
              className={styles.input}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            >
              <option value="0">Never</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
        </div>
        <div className={styles.actions} style={{ marginTop: "0.4rem" }}>
          <button type="submit" className={styles.primary} disabled={!name.trim() || creating}>
            {creating ? "Generating…" : "Generate token"}
          </button>
        </div>
      </form>

      <div className={styles.field} style={{ marginTop: "0.5rem" }}>
        <label className={styles.label}>Active tokens</label>
        {tokens.length === 0 ? (
          <div className={styles.emptyTokens}>No tokens yet.</div>
        ) : (
          <div className={styles.tokenList}>
            {tokens.map((t) => (
              <div key={t.id} className={styles.tokenRow}>
                <div className={styles.tokenMain}>
                  <div className={styles.tokenName}>{t.name}</div>
                  <div className={styles.tokenMeta}>
                    {t.prefix}… · created {fmt(t.createdAt)} · last used {fmt(t.lastUsedAt)}
                    {t.expiresAt ? ` · expires ${fmt(t.expiresAt)}` : ""}
                  </div>
                </div>
                <button type="button" className={styles.revokeBtn} onClick={() => revoke(t.id)}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
