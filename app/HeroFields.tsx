"use client";

import { HEROES } from "@/lib/hero/registry";
import styles from "./page.module.css";

export default function HeroFields({
  heroId,
  setHeroId,
  language,
  setLanguage,
}: {
  heroId: string;
  setHeroId: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
}) {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="hero-select">
          Original hero
        </label>
        <select
          id="hero-select"
          className={styles.select}
          value={heroId}
          onChange={(e) => setHeroId(e.target.value)}
        >
          {HEROES.map((hero) => (
            <option key={hero.id} value={hero.id}>
              {hero.name} — {hero.tagline}
            </option>
          ))}
        </select>
        <p className={styles.note}>
          Every option is an original hero concept with its own suit, emblem,
          palette, powers, and transformation system.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="story-language">
          Story language
        </label>
        <select
          id="story-language"
          className={styles.select}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="English">English</option>
          <option value="Bangla">Bangla</option>
        </select>
      </div>
    </>
  );
}
