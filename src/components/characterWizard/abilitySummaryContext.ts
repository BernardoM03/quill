import { createContext, useContext } from 'react';

import type { AbilitySummary } from '../../api/characters';

// The wizard's latest checked ability scores, so each ability increase field can show what the other picks add.
// Null until the server has checked the draft.
export const AbilitySummaryContext = createContext<Record<string, AbilitySummary> | null>(null);

export const useAbilitySummary = () => useContext(AbilitySummaryContext);
