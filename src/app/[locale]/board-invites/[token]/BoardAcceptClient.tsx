"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../invites/[token]/Invite.module.scss";

type Invite = {
  id: number;
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  email: string | null;
  boardRoleId: number;
  status: string;
  invitedByEmail: string | null;
  invitedByFirstname: string | null;
  invitedByLastname: string | null;
  expired: boolean;
};

type Me = { id: number; email: string | null; firstname: string | null } | null;

function inviterName(invite: Invite): string {
  const n = [invite.invitedByFirstname, invite.invitedByLastname].filter(Boolean).join(" ");
  return n || invite.invitedByEmail || "Someone";
}

export default function BoardAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [iRes, mRes] = await Promise.all([
          fetch(`/api/board-invites/token/${encodeURIComponent(token)}`),
          fetch("/api/auth/me"),
        ]);
        const iJson = await iRes.json();
        if (!iRes.ok) {
          if (!cancelled) setError(iJson.error || "Invite not found");
          return;
        }
        const mJson = await mRes.json();
        if (cancelled) return;
        setInvite(iJson.invite as Invite);
        setMe(mJson.user ?? null);
      } catch {
        if (!cancelled) setError("Could not load invite.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/board-invites/token/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not accept invite");
        return;
      }
      router.push(`/boards/${data.boardId}`);
    } catch {
      setError("Network error.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.skeleton} style={{ width: 90, height: 12, marginBottom: 14 }} />
        <div className={styles.skeleton} style={{ width: "75%", height: 22 }} />
        <div className={styles.skeleton} style={{ width: "55%", height: 14, marginTop: 10 }} />
      </div>
    );
  }

  if (!invite) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>sunday</div>
        <h1 className={styles.title}>Invite not found</h1>
        <p className={styles.lede}>
          The invite link is invalid, or it was revoked. Ask the person who sent it for a new one.
        </p>
        <div className={styles.footer}>
          <Link href="/workspaces" className={styles.linkBtn}>Go to your workspaces</Link>
        </div>
      </div>
    );
  }

  const stale = invite.expired || invite.status !== "pending";
  if (stale) {
    const reason =
      invite.status === "accepted"
        ? "This invite has already been used."
        : invite.status === "revoked"
        ? "This invite was revoked."
        : "This invite has expired.";
    return (
      <div className={styles.card}>
        <div className={styles.brand}>sunday</div>
        <h1 className={styles.title}>Invite no longer valid</h1>
        <p className={styles.lede}>{reason} Ask {inviterName(invite)} to send a fresh link.</p>
        <div className={styles.footer}>
          <Link href="/workspaces" className={styles.linkBtn}>Go to your workspaces</Link>
        </div>
      </div>
    );
  }

  if (!me) {
    const dest = `/board-invites/${token}`;
    const signInHref = `/users/sign_in?redirect=${encodeURIComponent(dest)}`;
    const signUpHref = `/users/sign_up?redirect=${encodeURIComponent(dest)}`;
    return (
      <div className={styles.card}>
        <div className={styles.brand}>sunday</div>
        <h1 className={styles.title}>
          Join the board {invite.boardTitle || "this board"}
        </h1>
        <p className={styles.lede}>
          {inviterName(invite)} invited you{invite.email ? ` at ${invite.email}` : ""} to a board
          in <strong>{invite.workspaceTitle || "their workspace"}</strong>. Sign in or create an
          account to accept.
        </p>
        <div className={styles.actions}>
          <Link href={signInHref} className={styles.ghost}>Sign in</Link>
          <Link href={signUpHref} className={styles.primary}>Create account</Link>
        </div>
      </div>
    );
  }

  const wrongEmail =
    invite.email && me.email && invite.email.toLowerCase() !== me.email.toLowerCase();

  return (
    <div className={styles.card}>
      <div className={styles.brand}>sunday</div>
      <h1 className={styles.title}>
        Join the board {invite.boardTitle || "this board"}
      </h1>
      <p className={styles.lede}>
        {inviterName(invite)} invited you{invite.email ? ` at ${invite.email}` : ""} to a board in
        <strong> {invite.workspaceTitle || "their workspace"}</strong>. You're signed in as{" "}
        <strong>{me.email}</strong>.
      </p>
      {wrongEmail && (
        <div className={styles.warn}>
          The invite was addressed to {invite.email}, but you're signed in as {me.email}. You can
          still accept with this account.
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.actions}>
        <Link href="/workspaces" className={styles.ghost}>Not now</Link>
        <button
          type="button"
          className={styles.primary}
          onClick={onAccept}
          disabled={accepting}
        >
          {accepting ? "Joining…" : "Accept invite"}
        </button>
      </div>
    </div>
  );
}
