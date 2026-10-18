declare namespace NodeJS {
  interface ProcessEnv {
    /** "1" makes a dev build walk the gallery and ask the host to take screenshots. */
    EXPO_PUBLIC_GALLERY_AUTO?: string;
  }
}
