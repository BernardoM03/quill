import type { campaign } from "./campaign";
export interface user {
  name: string,
  // False while acting as the admin without signing in.
  signedIn: boolean,
  campaigns: campaign[]
}
