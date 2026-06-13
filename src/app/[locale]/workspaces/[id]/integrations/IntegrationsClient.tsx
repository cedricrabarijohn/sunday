"use client";

import { useState } from "react";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import styles from "./Integrations.module.scss";

type Gitea = {
  connected: boolean;
  baseUrl: string;
  enabled: boolean;
  secret: string;
  webhookUrl: string;
};

export default function IntegrationsClient({
  workspaceId,
  workspaceTitle,
  gitea: initial,
}: {
  workspaceId: number;
  workspaceTitle: string | null;
  gitea: Gitea;
}) {
  const toast = useToast();
  const [gitea, setGitea] = useState<Gitea>(initial);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [saving, setSaving] = useState(false);

  const endpoint = `/api/workspaces/${workspaceId}/integrations/gitea`;

  async function save(body: Record<string, unknown>, msg?: string) {
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not save");
        return;
      }
      setGitea({
        connected: true,
        baseUrl: data.baseUrl ?? "",
        enabled: data.enabled,
        secret: data.secret ?? "",
        webhookUrl: data.webhookUrl ?? "",
      });
      if (msg) toast.success(msg);
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not disconnect");
        return;
      }
      setGitea({ connected: false, baseUrl: "", enabled: true, secret: "", webhookUrl: "" });
      setBaseUrl("");
      toast.success("Gitea disconnected");
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.subtitle}>{workspaceTitle} · connect external tools to this workspace.</p>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2 className={styles.cardTitle}>Gitea</h2>
            <p className={styles.cardDesc}>
              Link commits and pull requests to cards. Reference a card with
              <code> #cardId</code> in a commit message or PR.
            </p>
          </div>
          <span className={`${styles.badge} ${gitea.connected && gitea.enabled ? styles.badgeOn : ""}`}>
            {gitea.connected ? (gitea.enabled ? "Connected" : "Paused") : "Not connected"}
          </span>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="baseUrl">Gitea base URL</label>
          <input
            id="baseUrl"
            className={styles.input}
            placeholder="https://gitea.yourdomain.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        {!gitea.connected ? (
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={saving || !baseUrl.trim()}
              onClick={() => save({ baseUrl }, "Gitea connected")}
            >
              {saving ? "Connecting…" : "Connect"}
            </button>
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Webhook URL</label>
              <div className={styles.copyRow}>
                <code className={styles.code}>{gitea.webhookUrl}</code>
                <button className={styles.copyBtn} onClick={() => copy(gitea.webhookUrl)}>Copy</button>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Webhook secret</label>
              <div className={styles.copyRow}>
                <code className={styles.code}>{gitea.secret}</code>
                <button className={styles.copyBtn} onClick={() => copy(gitea.secret)}>Copy</button>
              </div>
            </div>

            <div className={styles.help}>
              In Gitea: your repo → <strong>Settings → Webhooks → Add Webhook → Gitea</strong>. Paste
              the URL and secret above, set content type to <code>application/json</code>, and tick the
              <strong> Push</strong> and <strong> Pull Request</strong> events.
            </div>

            <div className={styles.actions}>
              <button className={styles.ghost} disabled={saving} onClick={() => save({ baseUrl }, "Saved")}>
                Save URL
              </button>
              <button
                className={styles.ghost}
                disabled={saving}
                onClick={() => save({ baseUrl, enabled: !gitea.enabled }, gitea.enabled ? "Paused" : "Resumed")}
              >
                {gitea.enabled ? "Pause" : "Resume"}
              </button>
              <button
                className={styles.ghost}
                disabled={saving}
                onClick={() => save({ baseUrl, regenerateSecret: true }, "Secret regenerated")}
              >
                Regenerate secret
              </button>
              <button className={styles.danger} disabled={saving} onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
