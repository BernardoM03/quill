import { createContext, useContext } from 'react';

// True on Campaign Information, the players' read-only view of the settings page. The
// settings components read it instead of each taking a prop: View/Edit switches and
// edit pencils disappear, and toggles, choices and dropdowns are disabled.
export const ReadOnlyContext = createContext(false);

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
