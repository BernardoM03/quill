import type { Campaign } from "./campaign";
import type { CharacterStatus } from "../api/characters";

// One of the user's characters, with the campaign it belongs to.
export interface UserCharacter {
  id: string,
  name: string,
  // The character the player is playing in that campaign, never true in the sandbox.
  isActive: boolean,
  status: CharacterStatus,
  // Both null for a Character Sandbox character.
  campaignId: string | null,
  campaignName: string | null,
  // Changes whenever the portrait does.
  portraitVersion: string | null,
  // True when it no longer fits its campaign's settings.
  needsChanges: boolean,
}

export interface User {
  name: string,
  isAdmin: boolean,
  campaigns: Campaign[],
  characters: UserCharacter[],
}
