import AcceptClient from "./_components/AcceptClient";
import styles from "./_styles/Invite.module.scss";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className={styles.page}>
      <AcceptClient token={token} />
    </div>
  );
}
