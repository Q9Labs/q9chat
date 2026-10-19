declare namespace NodeJS {
  // nosemgrep: q9.typescript.no-optional-field-soup -- intentional: Node declares process.env values as optional strings, so each setting is one
  interface ProcessEnv {
    /** "1" makes a dev build walk the gallery and ask the host to take screenshots. */
    EXPO_PUBLIC_GALLERY_AUTO?: string;
    /** The Convex cloud URL, for example https://quixotic-crab-23.convex.cloud. */
    EXPO_PUBLIC_CONVEX_URL?: string;
    /** The Convex HTTP-action origin for uploads and photos; derived from the cloud URL when unset. */
    EXPO_PUBLIC_CONVEX_SITE_URL?: string;
    /** The web Worker that serves /api/auth/* and /auth/phone-callback. */
    EXPO_PUBLIC_AUTH_ORIGIN?: string;
    /** The WorkOS client id of the environment the Convex deployment trusts. */
    EXPO_PUBLIC_WORKOS_CLIENT_ID?: string;
  }
}

/** Hermes provides base64 encoding; the build's `types: []` does not know it. */
declare function btoa(data: string): string;
