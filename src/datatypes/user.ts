import type { campaign } from "./campaign";
export interface user {
  name: string,
  isAdmin: boolean,
  campaigns: campaign[]
}
