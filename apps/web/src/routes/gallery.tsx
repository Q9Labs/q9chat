import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";

interface GallerySearch {
  readonly state: string | undefined;
  readonly theme: "light" | "dark";
}

function parseSearch(search: Record<string, unknown>): GallerySearch {
  return {
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    theme: search["theme"] === "dark" ? "dark" : "light",
  };
}

function NotInProduction(): never {
  // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() is a throwable sentinel, not an Error.
  throw notFound();
}

// The gallery module is imported only when `import.meta.env.DEV` is true, so a
// production build drops it and its fixtures; the route itself answers 404.
export const Route = createFileRoute("/gallery")({
  validateSearch: parseSearch,
  component: import.meta.env.DEV
    ? lazyRouteComponent(() => import("../gallery/gallery.js"), "Gallery")
    : NotInProduction,
});
