import BoardAcceptClient from "@/components/organisms/board-invite/BoardAcceptClient";
import styles from "@/components/organisms/invite/Invite.module.scss";

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
