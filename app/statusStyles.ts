/** Shared status -> CSS class mapping, used by both IllustrationCard.tsx and
 *  BookReview.tsx so the badge styling can't drift between the two views. */

import type { IllustrationStatus } from "@/lib/manual/illustrationStatus";
import styles from "./page.module.css";

export function statusClassName(status: IllustrationStatus): string {
  switch (status) {
    case "missing":
      return styles.statusMissing;
    case "added":
      return styles.statusAdded;
    case "needs-regeneration":
      return styles.statusNeedsRegen;
    case "approved":
      return styles.statusApproved;
  }
}
