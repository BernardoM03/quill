import type { campaign } from "./campaign";
import type { characterStatus } from "../api/characters";

// One of the user's characters, with the campaign it belongs to.
export interface userCharacter {
  id: string,
  name: string,
  // The one character the player is playing in that campaign. Never true in the sandbox.
  isActive: boolean,
  status: characterStatus,
  // Both null for a Character Sandbox character.
  campaignId: string | null,
  campaignName: string | null,
  // Changes whenever the portrait does; null when there isn't one.
  portraitVersion: string | null,
  // It no longer fits its campaign's settings and needs editing.
  needsChanges: boolean,
}

export interface user {
  name: string,
  isAdmin: boolean,
  campaigns: campaign[],
  characters: userCharacter[],
}
