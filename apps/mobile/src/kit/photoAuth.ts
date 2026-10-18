import { createContext } from "react";

/** Protected photos live on one origin; requests to it carry the account's access token. */
type ImageAuth = { origin: string; headers: Record<string, string> };

export const ImageAuthContext = createContext<ImageAuth | undefined>(undefined);
