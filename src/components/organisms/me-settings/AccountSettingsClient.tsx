"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import styles from "./Settings.module.scss";

type Initial = {
  firstname: string;
  lastname: string;
  email: string;
  emailVerified: boolean;
};

export default function AccountSettingsClient({
  initial,
  children,
}: {
  initial: Initial;
  children?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();

  // Profile
  const [firstname, setFirstname] = useState(initial.firstname);
  const [lastname, setLastname] = useState(initial.lastname);
  const [email, setEmail] = useState(initial.email);
  const [verified, setVerified] = useState(initial.emailVerified);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const profileDirty =
    firstname !== initial.firstname ||
    lastname !== initial.lastname ||
    email !== initial.email;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstname, lastname, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not save your profile");
        return;
      }
      if (email !== initial.email) setVerified(false);
      toast.success("Profile updated");
      router.refresh();
    } catch {
      toast.error("Network error.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not change your password");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch {
      toast.error("Network error.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function resendVerification() {
    try {
      const res = await fetch("/api/auth/send-verification", { method: "POST" });
      if (res.ok) toast.success("Confirmation email sent");
      else toast.error("Could not send the email");
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Account settings</h1>
        <p className={styles.subtitle}>Manage your profile and password.</p>
      </header>

      <form className={styles.card} onSubmit={saveProfile}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Profile</h2>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="firstname">First name</label>
            <input
              id="firstname"
              className={styles.input}
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
              maxLength={30}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="lastname">Last name</label>
            <input
              id="lastname"
              className={styles.input}
              value={lastname}
              onChange={(e) => setLastname(e.target.value)}
              maxLength={30}
              required
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">Email</label>
          <input
            id="email"
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={30}
            required
          />
          <div className={styles.hint}>
            {verified ? (
              <span className={styles.verified}>● Verified</span>
            ) : (
              <span className={styles.unverified}>
                ● Not verified
                <button type="button" className={styles.linkBtn} onClick={resendVerification}>
                  Resend confirmation
                </button>
              </span>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primary}
            disabled={savingProfile || !profileDirty}
          >
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <form className={styles.card} onSubmit={changePassword}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Password</h2>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="current">Current password</label>
          <input
            id="current"
            className={styles.input}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="new">New password</label>
            <input
              id="new"
              className={styles.input}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primary}
            disabled={savingPassword || !currentPassword || !newPassword}
          >
            {savingPassword ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>

      {children}
    </div>
  );
}
