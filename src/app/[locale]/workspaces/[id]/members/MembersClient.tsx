"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import { colorForId } from "@/lib/palette";
import styles from "../../AppShell.module.scss";
import mStyles from "./Members.module.scss";
import { useToast } from "@/components/organisms/toast/ToastProvider";

type Member = {
  userId: number;
  workspaceRoleId: number | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

type Invite = {
  id: number;
  email: string | null;
  workspaceRoleId: number;
  token: string;
  status: string;
  createdAt: string | Date | null;
  expiresAt: string | Date | null;
};

const ROLE_LABELS: Record<number, string> = {
  1: "Admin",
  2: "Member",
};

function fullName(m: { firstname: string | null; lastname: string | null; email: string | null }) {
  const n = [m.firstname, m.lastname].filter(Boolean).join(" ");
  return n || m.email || "Unknown";
}

function initials(m: { firstname: string | null; lastname: string | null; email: string | null }) {
  const f = m.firstname?.[0] ?? "";
  const l = m.lastname?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return (m.email?.[0] ?? "?").toUpperCase();
}

export default function MembersClient({
  workspaceId,
  workspaceTitle,
  currentUserId,
  capabilities,
}: {
  workspaceId: number;
  workspaceTitle: string | null;
  currentUserId: number;
  capabilities: string[];
}) {
  const caps = new Set(capabilities);
  const canManageMembers = caps.has("manage_members");
  const { confirm } = useConfirm();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  // invite form state
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number>(2);
  const [sending, setSending] = useState(false);
  const [justCreated, setJustCreated] = useState<{ token: string; email: string | null } | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, i] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/members`).then((r) => r.json()),
          canManageMembers
            ? fetch(`/api/workspaces/${workspaceId}/invites`).then((r) => r.json())
            : Promise.resolve({ invites: [] }),
        ]);
        if (cancelled) return;
        setMembers(m.members ?? []);
        setInvites(i.invites ?? []);
      } catch {
        if (!cancelled) toast.error("Could not load members.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, canManageMembers]);

  const onCreateInvite = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || null, workspaceRoleId: roleId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not create invite");
        return;
      }
      setInvites((prev) => [
        ...prev,
        {
          id: data.invite.id,
          email: data.invite.email,
          workspaceRoleId: data.invite.workspaceRoleId,
          token: data.invite.token,
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: data.invite.expiresAt,
        },
      ]);
      setJustCreated({ token: data.invite.token, email: data.invite.email });
      setEmail("");
    } catch {
      toast.error("Network error.");
    } finally {
      setSending(false);
    }
  };

  const onRevoke = async (inv: Invite) => {
    const ok = await confirm({
      title: "Revoke this invite?",
      message: inv.email
        ? `${inv.email} won't be able to join with this link any more.`
        : "Anyone holding this link won't be able to join with it any more.",
      confirmLabel: "Revoke invite",
      danger: true,
    });
    if (!ok) return;
    const snapshot = invites;
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    try {
      const res = await fetch(`/api/invites/${inv.id}`, { method: "DELETE" });
      if (!res.ok) {
        setInvites(snapshot);
        toast.error("Could not revoke invite");
      }
    } catch {
      setInvites(snapshot);
      toast.error("Network error.");
    }
  };

  const onRemoveMember = async (m: Member, removingSelf: boolean) => {
    const ok = await confirm({
      title: removingSelf ? "Leave this workspace?" : `Remove ${fullName(m)}?`,
      message: removingSelf
        ? "You'll lose access to its boards and cards. An admin can invite you back."
        : "They'll lose access to this workspace's boards immediately.",
      confirmLabel: removingSelf ? "Leave" : "Remove",
      danger: true,
    });
    if (!ok) return;
    const snapshot = members;
    setMembers((prev) => prev.filter((x) => x.userId !== m.userId));
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${m.userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setMembers(snapshot);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not update membership");
      } else if (removingSelf) {
        // The user just left; bounce them to the workspaces list.
        window.location.href = "/workspaces";
      }
    } catch {
      setMembers(snapshot);
      toast.error("Network error.");
    }
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/invites/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1200);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  const wsColor = colorForId(workspaceId);
  const justCreatedUrl =
    justCreated && typeof window !== "undefined"
      ? `${window.location.origin}/invites/${justCreated.token}`
      : null;

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderText}>
          <span
            className={styles.pageBadge}
            style={{ background: wsColor.soft, color: wsColor.hue }}
          >
            {(workspaceTitle?.[0] || "W").toUpperCase()}
          </span>
          <div>
            <h1 className={styles.pageTitle}>{workspaceTitle || "Untitled"}</h1>
            <div className={styles.pageSubtitle}>
              <Link
                href={`/workspaces/${workspaceId}`}
                style={{ color: "var(--text-2)", borderBottom: "1px dotted var(--border-strong)" }}
              >
                Back to boards
              </Link>
            </div>
          </div>
        </div>
        <span className={styles.pageMeta}>
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      {canManageMembers && (
        <section className={mStyles.section}>
          <header className={mStyles.sectionHead}>
            <h2 className={mStyles.sectionTitle}>Invite people</h2>
            <p className={mStyles.sectionSub}>
              Generate a link. Share it through any channel you like.
            </p>
          </header>
          <form className={mStyles.inviteForm} onSubmit={onCreateInvite}>
            <input
              className={mStyles.inviteInput}
              type="email"
              placeholder="teammate@company.com (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
            />
            <select
              className={mStyles.inviteSelect}
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
            >
              <option value={2}>Member</option>
              <option value={1}>Admin</option>
            </select>
            <button type="submit" className={mStyles.invitePrimary} disabled={sending}>
              {sending ? "Generating…" : "Create invite link"}
            </button>
          </form>

          {justCreated && justCreatedUrl && (
            <div className={mStyles.linkCard}>
              <div className={mStyles.linkLabel}>Invite link</div>
              <div className={mStyles.linkRow}>
                <code className={mStyles.linkValue}>{justCreatedUrl}</code>
                <button
                  type="button"
                  className={mStyles.linkCopy}
                  onClick={() => copyInviteLink(justCreated.token)}
                >
                  {copyStatus === "copied" ? "Copied" : "Copy"}
                </button>
              </div>
              <div className={mStyles.linkHint}>
                {justCreated.email
                  ? `Anyone who opens this link can join as ${justCreated.email}. The link expires in 14 days.`
                  : "Anyone who opens this link can join. The link expires in 14 days."}
              </div>
            </div>
          )}
        </section>
      )}

      {canManageMembers && invites.length > 0 && (
        <section className={mStyles.section}>
          <header className={mStyles.sectionHead}>
            <h2 className={mStyles.sectionTitle}>Pending invites</h2>
          </header>
          <div className={mStyles.list}>
            {invites.map((inv) => (
              <div key={inv.id} className={mStyles.row}>
                <div className={mStyles.rowMain}>
                  <div className={mStyles.rowTitle}>{inv.email || "Open invite link"}</div>
                  <div className={mStyles.rowSub}>
                    {ROLE_LABELS[inv.workspaceRoleId]} ·{" "}
                    {inv.expiresAt
                      ? `expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                      : "no expiry"}
                  </div>
                </div>
                <div className={mStyles.rowActions}>
                  <button
                    type="button"
                    className={mStyles.rowBtn}
                    onClick={() => copyInviteLink(inv.token)}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className={`${mStyles.rowBtn} ${mStyles.rowBtnDanger}`}
                    onClick={() => onRevoke(inv)}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={mStyles.section}>
        <header className={mStyles.sectionHead}>
          <h2 className={mStyles.sectionTitle}>Members</h2>
        </header>
        {loading ? (
          <div className={mStyles.empty}>Loading…</div>
        ) : members.length === 0 ? (
          <div className={mStyles.empty}>Nobody here yet.</div>
        ) : (
          <div className={mStyles.list}>
            {members.map((m) => {
              const removingSelf = m.userId === currentUserId;
              const canRemove = canManageMembers || removingSelf;
              return (
                <div key={m.userId} className={mStyles.row}>
                  <span className={mStyles.avatar}>{initials(m)}</span>
                  <div className={mStyles.rowMain}>
                    <div className={mStyles.rowTitle}>
                      {fullName(m)}
                      {removingSelf && <span className={mStyles.youTag}>you</span>}
                    </div>
                    <div className={mStyles.rowSub}>
                      {m.email} · {ROLE_LABELS[m.workspaceRoleId ?? 2] ?? "Member"}
                    </div>
                  </div>
                  {canRemove && (
                    <div className={mStyles.rowActions}>
                      <button
                        type="button"
                        className={`${mStyles.rowBtn} ${mStyles.rowBtnDanger}`}
                        onClick={() => onRemoveMember(m, removingSelf)}
                      >
                        {removingSelf ? "Leave" : "Remove"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
