import { Suspense } from "react";
import SignUpForm from "@/components/organisms/auth-forms/SignUpForm";
import styles from "@/components/organisms/auth-forms/AuthForm.module.scss";

export default function SignUp() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.card}>Loading…</div>}>
        <SignUpForm />
      </Suspense>
    </div>
  );
}
