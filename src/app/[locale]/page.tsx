import Navbar from "@/components/organisms/navbar/Navbar";
import styles from "./page.module.scss";
import Hero from "@/components/organisms/hero/Hero";

export default function Home() {
  return (
    <div className={styles.page}>
      <Navbar />
      <Hero />
    </div>
  );
}
