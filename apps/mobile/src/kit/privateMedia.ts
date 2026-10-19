import { Directory, Paths } from "expo-file-system";
import { createContext } from "react";

import { createMediaCache } from "./mediaCache";

export const privateMedia = createMediaCache({
  names: () => new Directory(Paths.cache).list().map((entry) => entry.name),
  remove: (name) => {
    const directory = new Directory(Paths.cache, name);
    if (directory.exists) directory.delete();
  },
});

export type MediaScope = ReturnType<typeof privateMedia.open>;
export const MediaScopeContext = createContext<MediaScope | null>(null);
