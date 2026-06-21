import BoardAcceptClient from "./_components/BoardAcceptClient";
import styles from "../../invites/[token]/_styles/Invite.module.scss";

export default async function BoardInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className={styles.page}>
      <BoardAcceptClient token={token} />
    </div>
  );
}
