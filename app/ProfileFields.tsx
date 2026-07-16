"use client";

import styles from "./page.module.css";

export type Gender = "boy" | "girl" | "neutral";

interface Props {
  name: string;
  setName: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  gender: Gender;
  setGender: (v: Gender) => void;
}

/** Shared name / age / gender inputs used by both the auto and manual flows. */
export default function ProfileFields({
  name,
  setName,
  age,
  setAge,
  gender,
  setGender,
}: Props) {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">
          Child&apos;s name
        </label>
        <input
          id="name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          maxLength={40}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="age">
            Age <span className={styles.hint}>(their real age — shapes how old they look)</span>
          </label>
          <input
            id="age"
            className={styles.input}
            type="number"
            min={0}
            max={18}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="gender">
            Gender
          </label>
          <select
            id="gender"
            className={styles.select}
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
          >
            <option value="boy">Boy</option>
            <option value="girl">Girl</option>
            <option value="neutral">Prefer not to say</option>
          </select>
        </div>
      </div>
    </>
  );
}
