import { createContext, useContext } from 'react';

// True on Campaign Information, the players' read-only settings view.
// Settings components read this context to hide edit controls and disable inputs.
export const ReadOnlyContext = createContext(false);

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
