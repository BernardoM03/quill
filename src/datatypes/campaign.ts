export interface campaign {
  name: string,
  id: string,
  // The current user's role; missing on a campaign just created.
  role?: 'gm' | 'player'
}