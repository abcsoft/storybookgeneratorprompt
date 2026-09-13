/**
 * Legacy Dream Big Content-Remap Recovery Logic.
 *
 * Resolves the known cyclic artwork shift in older Dream Big illustration packages:
 * - Page 02 Intro receives old source from 22-inventor (generic dream artwork)
 * - For destination N from 03 to 22, receives old source N - 1
 * - 01-cover, 23-closing, and 24-backcover remain unchanged.
 */

export interface LegacyRemapMappingEntry {
  destinationSlotId: string;
  destinationPageNumber: number;
  destinationRoleName: string;
  sourceSlotId: string;
  sourceOriginalRole: string;
  sourceFilename: string;
  isChanged: boolean;
}

export const DREAM_BIG_CANONICAL_SLOTS = [
  { page: 1, slotId: "01-cover", role: "Cover" },
  { page: 2, slotId: "02-intro", role: "Intro" },
  { page: 3, slotId: "03-pilot", role: "Pilot" },
  { page: 4, slotId: "04-race-car-driver", role: "Race-car Driver" },
  { page: 5, slotId: "05-astronaut", role: "Astronaut" },
  { page: 6, slotId: "06-doctor", role: "Doctor" },
  { page: 7, slotId: "07-firefighter", role: "Firefighter" },
  { page: 8, slotId: "08-scientist", role: "Scientist" },
  { page: 9, slotId: "09-army-officer", role: "Army Officer" },
  { page: 10, slotId: "10-soccer-player", role: "Soccer Player" },
  { page: 11, slotId: "11-karate-master", role: "Karate Master" },
  { page: 12, slotId: "12-detective", role: "Detective" },
  { page: 13, slotId: "13-magician", role: "Magician" },
  { page: 14, slotId: "14-chef", role: "Chef" },
  { page: 15, slotId: "15-rockstar", role: "Rockstar" },
  { page: 16, slotId: "16-artist", role: "Artist" },
  { page: 17, slotId: "17-teacher", role: "Teacher" },
  { page: 18, slotId: "18-explorer", role: "Explorer" },
  { page: 19, slotId: "19-photographer", role: "Photographer" },
  { page: 20, slotId: "20-deep-sea-diver", role: "Deep-sea Diver" },
  { page: 21, slotId: "21-veterinarian", role: "Veterinarian" },
  { page: 22, slotId: "22-inventor", role: "Inventor" },
  { page: 23, slotId: "23-closing", role: "Closing" },
  { page: 24, slotId: "24-backcover", role: "Back Cover" },
] as const;

/**
 * Calculates the complete source -> destination mapping preview for the legacy Dream Big recovery.
 *
 * @param currentFilesBySlot Map of slotId to current assigned file/filename
 */
export function calculateLegacyDreamBigRemap(
  currentFilesBySlot: Record<string, { filename: string; file?: File; [key: string]: any }> = {},
): {
  entries: LegacyRemapMappingEntry[];
  newFilesBySlot: Record<string, any>;
  hasShiftableAssets: boolean;
} {
  const entries: LegacyRemapMappingEntry[] = [];
  const newFilesBySlot: Record<string, any> = {};

  const slots = DREAM_BIG_CANONICAL_SLOTS;

  for (let i = 0; i < slots.length; i++) {
    const dest = slots[i];
    let sourceSlotId: string;
    let sourceRole: string;

    if (dest.page === 1) {
      // 01-cover stays unchanged
      sourceSlotId = dest.slotId;
      sourceRole = dest.role;
    } else if (dest.page === 2) {
      // 02-intro receives old source 22-inventor
      const sourceSlot = slots.find((s) => s.page === 22)!;
      sourceSlotId = sourceSlot.slotId;
      sourceRole = sourceSlot.role;
    } else if (dest.page >= 3 && dest.page <= 22) {
      // For destinations 03..22, receives old source N - 1
      const sourceSlot = slots.find((s) => s.page === dest.page - 1)!;
      sourceSlotId = sourceSlot.slotId;
      sourceRole = sourceSlot.role;
    } else {
      // 23-closing and 24-backcover stay unchanged
      sourceSlotId = dest.slotId;
      sourceRole = dest.role;
    }

    const sourceData = currentFilesBySlot[sourceSlotId];
    const sourceFilename = sourceData?.filename || `${sourceSlotId}.png`;
    const isChanged = sourceSlotId !== dest.slotId;

    entries.push({
      destinationSlotId: dest.slotId,
      destinationPageNumber: dest.page,
      destinationRoleName: dest.role,
      sourceSlotId,
      sourceOriginalRole: sourceRole,
      sourceFilename,
      isChanged,
    });

    if (sourceData) {
      newFilesBySlot[dest.slotId] = {
        ...sourceData,
        isLegacyRecovered: isChanged ? true : sourceData.isLegacyRecovered,
        originalSourceSlotId: isChanged ? sourceSlotId : sourceData.originalSourceSlotId,
        originalSourceFilename: isChanged ? sourceData.filename : sourceData.originalSourceFilename,
      };
    }
  }

  const hasShiftableAssets = entries.some((e) => e.isChanged && currentFilesBySlot[e.sourceSlotId]);

  return {
    entries,
    newFilesBySlot,
    hasShiftableAssets,
  };
}
