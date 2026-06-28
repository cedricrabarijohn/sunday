import ForgotPasswordForm from "@/components/organisms/auth-forms/ForgotPasswordForm";
import styles from "@/components/organisms/auth-forms/AuthForm.module.scss";

export default function ForgotPassword() {
  return (
    <div className={styles.page}>
      <ForgotPasswordForm />
    </div>
  );
}
