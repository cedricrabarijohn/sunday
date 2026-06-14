"use client";

import { ReactNode, useState } from "react";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import styles from "./Integrations.module.scss";

type Provider = "gitea" | "forgejo" | "github" | "gitlab" | "bitbucket";

type ProviderState = {
  provider: Provider;
  connected: boolean;
  baseUrl: string;
  enabled: boolean;
  secret: string;
  donePileName: string;
  webhookUrl: string;
};

const META: Record<
  Provider,
  { name: string; baseLabel: string; basePlaceholder: string; help: ReactNode }
> = {
  gitea: {
    name: "Gitea",
    baseLabel: "Gitea base URL",
    basePlaceholder: "https://gitea.yourdomain.com",
    help: (
      <>
        In Gitea: your repo → <strong>Settings → Webhooks → Add Webhook → Gitea</strong>. Paste the
        URL and secret above, set content type to <code>application/json</code>, and tick the
        <strong> Push</strong> and <strong> Pull Request</strong> events.
      </>
    ),
  },
  forgejo: {
    name: "Forgejo",
    baseLabel: "Forgejo base URL",
    basePlaceholder: "https://forgejo.yourdomain.com",
    help: (
      <>
        In Forgejo: your repo → <strong>Settings → Webhooks → Add Webhook → Forgejo</strong>. Paste
        the URL and secret above, set content type to <code>application/json</code>, and tick the
        <strong> Push</strong> and <strong> Pull Request</strong> events.
      </>
    ),
  },
  github: {
    name: "GitHub",
    baseLabel: "GitHub base URL (optional)",
    basePlaceholder: "https://github.com",
    help: (
      <>
        In GitHub: your repo → <strong>Settings → Webhooks → Add webhook</strong>. Set the{" "}
        <strong>Payload URL</strong> and <strong>Secret</strong> above, content type to{" "}
        <code>application/json</code>, choose <strong>Let me select individual events</strong>, and
        tick <strong>Pushes</strong> and <strong>Pull requests</strong>.
      </>
    ),
  },
  gitlab: {
    name: "GitLab",
    baseLabel: "GitLab base URL (optional)",
    basePlaceholder: "https://gitlab.com",
    help: (
      <>
        In GitLab: your project → <strong>Settings → Webhooks</strong>. Set the{" "}
        <strong>URL</strong> above, paste the secret into the <strong>Secret token</strong> field, and
        tick <strong>Push events</strong> and <strong>Merge request events</strong>.
      </>
    ),
  },
  bitbucket: {
    name: "Bitbucket",
    baseLabel: "Bitbucket base URL (optional)",
    basePlaceholder: "https://bitbucket.org",
    help: (
      <>
        In Bitbucket: your repo → <strong>Repository settings → Webhooks → Add webhook</strong>. Set
        the <strong>URL</strong> and <strong>Secret</strong> above, then under triggers select{" "}
        <strong>Repository push</strong> and the <strong>Pull request</strong> events (created,
        updated, merged).
      </>
    ),
  },
};

export default function IntegrationsClient({
  workspaceId,
  workspaceTitle,
  providers,
}: {
  workspaceId: number;
  workspaceTitle: string | null;
  providers: ProviderState[];
}) {
  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.subtitle}>{workspaceTitle} · connect external tools to this workspace.</p>
      </header>

      {providers.map((p) => (
        <ProviderCard key={p.provider} workspaceId={workspaceId} initial={p} />
      ))}
    </div>
  );
}

function ProviderCard({
  workspaceId,
  initial,
}: {
  workspaceId: number;
  initial: ProviderState;
}) {
  const toast = useToast();
  const meta = META[initial.provider];
  const [state, setState] = useState<ProviderState>(initial);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [donePileName, setDonePileName] = useState(initial.donePileName);
  const [saving, setSaving] = useState(false);

  const endpoint = `/api/workspaces/${workspaceId}/integrations/${initial.provider}`;

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
      setState({
        provider: initial.provider,
        connected: true,
        baseUrl: data.baseUrl ?? "",
        enabled: data.enabled,
        secret: data.secret ?? "",
        donePileName: data.donePileName ?? "",
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
      setState({
        provider: initial.provider,
        connected: false,
        baseUrl: "",
        enabled: true,
        secret: "",
        donePileName: "",
        webhookUrl: "",
      });
      setBaseUrl("");
      setDonePileName("");
      toast.success(`${meta.name} disconnected`);
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
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{meta.name}</h2>
          <p className={styles.cardDesc}>
            Link commits and pull requests to cards. Reference a card with
            <code> #cardId</code> in a commit message or PR.
          </p>
        </div>
        <span className={`${styles.badge} ${state.connected && state.enabled ? styles.badgeOn : ""}`}>
          {state.connected ? (state.enabled ? "Connected" : "Paused") : "Not connected"}
        </span>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`baseUrl-${initial.provider}`}>
          {meta.baseLabel}
        </label>
        <input
          id={`baseUrl-${initial.provider}`}
          className={styles.input}
          placeholder={meta.basePlaceholder}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>

      {!state.connected ? (
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={saving}
            onClick={() => save({ baseUrl }, `${meta.name} connected`)}
          >
            {saving ? "Connecting…" : "Connect"}
          </button>
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.label}>Webhook URL</label>
            <div className={styles.copyRow}>
              <code className={styles.code}>{state.webhookUrl}</code>
              <button className={styles.copyBtn} onClick={() => copy(state.webhookUrl)}>Copy</button>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Webhook secret</label>
            <div className={styles.copyRow}>
              <code className={styles.code}>{state.secret}</code>
              <button className={styles.copyBtn} onClick={() => copy(state.secret)}>Copy</button>
            </div>
          </div>

          <div className={styles.help}>{meta.help}</div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`donePile-${initial.provider}`}>
              Move card on merge (optional)
            </label>
            <input
              id={`donePile-${initial.provider}`}
              className={styles.input}
              placeholder="e.g. Done"
              value={donePileName}
              onChange={(e) => setDonePileName(e.target.value)}
              maxLength={60}
            />
            <span className={styles.hint}>
              When a merged PR references <code>#cardId</code>, that card moves to the pile with this
              exact name in its own board. Leave empty to disable.
            </span>
          </div>

          <div className={styles.actions}>
            <button className={styles.ghost} disabled={saving} onClick={() => save({ baseUrl, donePileName }, "Saved")}>
              Save changes
            </button>
            <button
              className={styles.ghost}
              disabled={saving}
              onClick={() =>
                save({ baseUrl, donePileName, enabled: !state.enabled }, state.enabled ? "Paused" : "Resumed")
              }
            >
              {state.enabled ? "Pause" : "Resume"}
            </button>
            <button
              className={styles.ghost}
              disabled={saving}
              onClick={() => save({ baseUrl, donePileName, regenerateSecret: true }, "Secret regenerated")}
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
  );
}
