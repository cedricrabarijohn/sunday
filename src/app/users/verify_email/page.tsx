import { Suspense } from "react";
import VerifyEmailClient from "@/components/organisms/auth-forms/VerifyEmailClient";
import styles from "@/components/organisms/auth-forms/AuthForm.module.scss";

export default function VerifyEmail() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.card}>Loading…</div>}>
        <VerifyEmailClient />
      </Suspense>
    </div>
  );
}
