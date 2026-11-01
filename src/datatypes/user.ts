import type { campaign } from "./campaign";

// One of the user's characters, with the campaign it belongs to.
export interface userCharacter {
  id: string,
  name: string,
  // The one character the player is playing in that campaign. Never true in the sandbox.
  isActive: boolean,
  // Both null for a Character Sandbox character.
  campaignId: string | null,
  campaignName: string | null,
  // Changes whenever the portrait does; null when there isn't one.
  portraitVersion: string | null,
}

export interface user {
  name: string,
  isAdmin: boolean,
  campaigns: campaign[],
  characters: userCharacter[],
}
