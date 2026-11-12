import { createContext } from 'react';

import type { sheetInfo } from './InfoPanel';

// How anything on the character sheet opens rules text in the panel beside it (CharacterSheet
// provides it; SheetTerm uses it).
export interface sheetInfoActions {
  // The id of what's open in the panel, if it's showing rules text.
  openInfo: string | null,
  // Open that text beside the sheet; null closes it.
  onInfo: (info: sheetInfo | null) => void,
}

export const SheetInfoContext = createContext<sheetInfoActions | null>(null);
