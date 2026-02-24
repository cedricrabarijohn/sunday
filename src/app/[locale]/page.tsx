import styles from "./page.module.scss";
import Hero from "@/components/organisms/hero/Hero";

export default function Home() {
  return (
    <div className={styles.page}>
      <Hero />
    </div>
  );
}
