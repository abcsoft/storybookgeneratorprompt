import { listBooks } from "@/lib/story/registry";
import Studio from "./Studio";
import styles from "./page.module.css";

export default function Home() {
  const books = listBooks().map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    /** Illustrations to generate (one per page spec). */
    pages: b.pages.length,
    /** Physical pages once printed — spreads occupy two leaves. */
    printPages: b.pages.reduce((n, p) => n + (p.spread ? 2 : 1), 0),
  }));

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.sky} aria-hidden="true">
          <div className={styles.stars} />
          <div className={styles.stars2} />
          <span className={`${styles.dreamShape} ${styles.shapeA}`}>🚀</span>
          <span className={`${styles.dreamShape} ${styles.shapeB}`}>🗺️</span>
          <span className={`${styles.dreamShape} ${styles.shapeC}`}>🔍</span>
          <span className={`${styles.dreamShape} ${styles.shapeD}`}>⭐</span>
        </div>
        <span className={styles.kicker}>✦ Storybook Studio ✦</span>
        <h1 className={styles.title}>Your child, the hero of every story</h1>
        <p className={styles.subtitle}>
          A few photos become a personalized, print-ready picture book. Three
          adventures on the shelf — your little one stars in all of them.
        </p>
      </header>

      <Studio books={books} />
    </main>
  );
}
