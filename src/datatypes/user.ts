import type { campaign } from "./campaign";

// One of the user's characters, with the campaign it belongs to.
export interface userCharacter {
  id: string,
  name: string,
  // The one character the player is playing in that campaign.
  isActive: boolean,
  campaignId: string,
  campaignName: string,
}

export interface user {
  name: string,
  isAdmin: boolean,
  campaigns: campaign[],
  characters: userCharacter[],
}
