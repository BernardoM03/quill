import { createContext } from 'react';

import type { SheetInfo } from './InfoPanel';

// Lets anything on the sheet open rules text in the side panel, provided by CharacterSheet.
export interface SheetInfoActions {
  // The id of the rules text open in the panel.
  openInfo: string | null,
  // Opens that text beside the sheet, or closes it when given null.
  onInfo: (info: SheetInfo | null) => void,
}

export const SheetInfoContext = createContext<SheetInfoActions | null>(null);
