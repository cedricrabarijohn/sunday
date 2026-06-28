import { Suspense } from "react";
import SignInForm from "@/components/organisms/auth-forms/SignInForm";
import styles from "@/components/organisms/auth-forms/AuthForm.module.scss";

export default function SignIn() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.card}>Loading…</div>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
