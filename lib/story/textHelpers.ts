/**
 * Small text helpers shared by every story template (pronoun/noun agreement for
 * the child's gender). Extracted so `dreamBigTemplate.ts`, `greatAdventureTemplate.ts`,
 * and `theGreatDetectiveTemplate.ts` don't each keep their own copy.
 */

import type { Gender } from "./types";

export interface Pronouns {
  subj: string; // he / she / they
  obj: string; // him / her / them
  poss: string; // his / her / their
}

export function pronouns(gender: Gender): Pronouns {
  switch (gender) {
    case "boy":
      return { subj: "he", obj: "him", poss: "his" };
    case "girl":
      return { subj: "she", obj: "her", poss: "her" };
    default:
      return { subj: "they", obj: "them", poss: "their" };
  }
}

export function childNoun(gender: Gender): string {
  if (gender === "boy") return "boy";
  if (gender === "girl") return "girl";
  return "child";
}

/** Capitalize the first letter — for a pronoun at the start of a sentence. */
export const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);
