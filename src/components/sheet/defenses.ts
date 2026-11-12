import type { sheetStats } from '../../api/characters';

// One resistance (R) or immunity (I) as the sheet lists it. condition: the feature that has to
// be active for it (Rage), or null when it always applies.
export interface defenseRow { name: string, condition: string | null, kind: 'R' | 'I', label: string }

// Resistances then immunities.
export function defenseRows(defenses: sheetStats['defenses'] | null): defenseRow[] {
  return [
    ...(defenses?.resistances ?? []).map(d => ({ ...d, kind: 'R' as const, label: 'Resistance' })),
    ...(defenses?.immunities ?? []).map(d => ({ ...d, kind: 'I' as const, label: 'Immunity' })),
  ];
}
