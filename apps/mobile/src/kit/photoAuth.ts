import { createContext } from "react";

/** Protected photos live on one origin; requests to it carry the account's access token. */
type ImageAuth = {
  origin: string;
  headers: { Authorization: string };
  /** Whether the live Convex connection is up; a photo that failed is tried once more when this or the token changes. */
  connected: boolean;
};

export const ImageAuthContext = createContext<ImageAuth | undefined>(undefined);
