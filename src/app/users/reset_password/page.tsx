import { Suspense } from "react";
import ResetPasswordForm from "@/components/organisms/auth-forms/ResetPasswordForm";
import styles from "@/components/organisms/auth-forms/AuthForm.module.scss";

export default function ResetPassword() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.card}>Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
