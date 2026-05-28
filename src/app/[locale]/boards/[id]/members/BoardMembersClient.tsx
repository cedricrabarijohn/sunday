"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import { colorForId } from "@/lib/palette";
import styles from "../../../workspaces/AppShell.module.scss";
import mStyles from "../../../workspaces/[id]/members/Members.module.scss";

type Member = {
  userId: number;
  boardRoleId: number | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

type Invite = {
  id: number;
  email: string | null;
  boardRoleId: number;
  token: string;
  status: string;
  createdAt: string | Date | null;
  expiresAt: string | Date | null;
};

const ROLE_LABELS: Record<number, string> = {
  1: "Board admin",
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

export default function BoardMembersClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  currentUserId,
  capabilities,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  currentUserId: number;
  capabilities: string[];
}) {
  const caps = new Set(capabilities);
  const canManage = caps.has("manage_board_members");
  const { confirm } = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          fetch(`/api/boards/${boardId}/members`).then((r) => r.json()),
          canManage
            ? fetch(`/api/boards/${boardId}/invites`).then((r) => r.json())
            : Promise.resolve({ invites: [] }),
        ]);
        if (cancelled) return;
        setMembers(m.members ?? []);
        setInvites(i.invites ?? []);
      } catch {
        if (!cancelled) setError("Could not load members.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, canManage]);

  const onCreateInvite = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || null, boardRoleId: roleId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create invite");
        return;
      }
      setInvites((prev) => [
        ...prev,
        {
          id: data.invite.id,
          email: data.invite.email,
          boardRoleId: data.invite.boardRoleId,
          token: data.invite.token,
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: data.invite.expiresAt,
        },
      ]);
      setJustCreated({ token: data.invite.token, email: data.invite.email });
      setEmail("");
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  };

  const onRevoke = async (inv: Invite) => {
    const ok = await confirm({
      title: "Revoke this invite?",
      message: inv.email
        ? `${inv.email} won't be able to join this board with this link any more.`
        : "Anyone holding this link won't be able to join this board with it any more.",
      confirmLabel: "Revoke invite",
      danger: true,
    });
    if (!ok) return;
    const snapshot = invites;
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    try {
      const res = await fetch(`/api/board-invites/${inv.id}`, { method: "DELETE" });
      if (!res.ok) {
        setInvites(snapshot);
        setError("Could not revoke invite");
      }
    } catch {
      setInvites(snapshot);
      setError("Network error.");
    }
  };

  const onRemoveMember = async (m: Member, removingSelf: boolean) => {
    const ok = await confirm({
      title: removingSelf ? `Leave "${boardTitle || "this board"}"?` : `Remove ${fullName(m)}?`,
      message: removingSelf
        ? "You'll lose access to this board immediately. A board admin can re-invite you."
        : "They'll lose access to this board immediately.",
      confirmLabel: removingSelf ? "Leave board" : "Remove",
      danger: true,
    });
    if (!ok) return;
    const snapshot = members;
    setMembers((prev) => prev.filter((x) => x.userId !== m.userId));
    try {
      const res = await fetch(`/api/boards/${boardId}/members/${m.userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setMembers(snapshot);
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not update membership");
      } else if (removingSelf) {
        window.location.href = `/workspaces/${workspaceId}`;
      }
    } catch {
      setMembers(snapshot);
      setError("Network error.");
    }
  };

  const onChangeRole = async (m: Member, newRoleId: number) => {
    const prevRoleId = m.boardRoleId ?? 2;
    if (prevRoleId === newRoleId) return;
    const snapshot = members;
    setMembers((prev) =>
      prev.map((x) => (x.userId === m.userId ? { ...x, boardRoleId: newRoleId } : x)),
    );
    try {
      const res = await fetch(`/api/boards/${boardId}/members/${m.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardRoleId: newRoleId }),
      });
      if (!res.ok) {
        setMembers(snapshot);
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not update role");
      }
    } catch {
      setMembers(snapshot);
      setError("Network error.");
    }
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/board-invites/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1200);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
    }
  };

  const bdColor = colorForId(boardId);
  const justCreatedUrl =
    justCreated && typeof window !== "undefined"
      ? `${window.location.origin}/board-invites/${justCreated.token}`
      : null;

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderText}>
          <span
            className={styles.pageBadge}
            style={{ background: bdColor.soft, color: bdColor.hue }}
          >
            {(boardTitle?.[0] || "B").toUpperCase()}
          </span>
          <div>
            <h1 className={styles.pageTitle}>{boardTitle || "Untitled board"}</h1>
            <div className={styles.pageSubtitle}>
              <Link
                href={`/boards/${boardId}`}
                style={{ color: "var(--text-2)", borderBottom: "1px dotted var(--border-strong)" }}
              >
                Back to the board
              </Link>
              {" "}
              · in <Link
                href={`/workspaces/${workspaceId}`}
                style={{ color: "var(--text-2)", borderBottom: "1px dotted var(--border-strong)" }}
              >{workspaceTitle || "workspace"}</Link>
            </div>
          </div>
        </div>
        <span className={styles.pageMeta}>
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {canManage && (
        <section className={mStyles.section}>
          <header className={mStyles.sectionHead}>
            <h2 className={mStyles.sectionTitle}>Invite people to this board</h2>
            <p className={mStyles.sectionSub}>
              Members of the workspace are not on this board by default. Generate a link and share it through any channel.
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
              <option value={1}>Board admin</option>
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
                  ? `Anyone who opens this link can join the board as ${justCreated.email}. The link expires in 14 days.`
                  : "Anyone who opens this link can join the board. The link expires in 14 days."}
              </div>
            </div>
          )}
        </section>
      )}

      {canManage && invites.length > 0 && (
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
                    {ROLE_LABELS[inv.boardRoleId]} ·{" "}
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
              const canRemove = canManage || removingSelf;
              return (
                <div key={m.userId} className={mStyles.row}>
                  <span className={mStyles.avatar}>{initials(m)}</span>
                  <div className={mStyles.rowMain}>
                    <div className={mStyles.rowTitle}>
                      {fullName(m)}
                      {removingSelf && <span className={mStyles.youTag}>you</span>}
                    </div>
                    <div className={mStyles.rowSub}>
                      {m.email}
                      {!canManage && ` · ${ROLE_LABELS[m.boardRoleId ?? 2] ?? "Member"}`}
                    </div>
                  </div>
                  <div className={mStyles.rowActions}>
                    {canManage ? (
                      <select
                        className={mStyles.inviteSelect}
                        value={m.boardRoleId ?? 2}
                        onChange={(e) => onChangeRole(m, Number(e.target.value))}
                      >
                        <option value={2}>Member</option>
                        <option value={1}>Board admin</option>
                      </select>
                    ) : null}
                    {canRemove && (
                      <button
                        type="button"
                        className={`${mStyles.rowBtn} ${mStyles.rowBtnDanger}`}
                        onClick={() => onRemoveMember(m, removingSelf)}
                      >
                        {removingSelf ? "Leave" : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
