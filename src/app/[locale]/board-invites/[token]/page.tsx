import BoardAcceptClient from "./BoardAcceptClient";
import styles from "../../invites/[token]/Invite.module.scss";

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
