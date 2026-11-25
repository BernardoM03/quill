import type { SheetStats } from '../../api/characters';

// One resistance (R) or immunity (I), where condition names a required active feature (Rage) or is null.
export interface DefenseEntry { name: string, condition: string | null, kind: 'R' | 'I', label: string }

// Resistances then immunities.
export function defenseRows(defenses: SheetStats['defenses'] | null): DefenseEntry[] {
  return [
    ...(defenses?.resistances ?? []).map(d => ({ ...d, kind: 'R' as const, label: 'Resistance' })),
    ...(defenses?.immunities ?? []).map(d => ({ ...d, kind: 'I' as const, label: 'Immunity' })),
  ];
}
