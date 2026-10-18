import { Button } from "@q9labsai/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";

import { useSession } from "../lib/session.js";

export const Route = createFileRoute("/")({ component: HomePage });

// Placeholder until the groups list exists: proves sign-in reaches Convex.
function HomePage() {
  const { user, signOut } = useSession();
  const { isLoading, isAuthenticated } = useConvexAuth();

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Q9 Chat</h1>
      {isLoading ? null : isAuthenticated && user !== null ? (
        <>
          <p className="text-muted-foreground">Signed in as {user.email}</p>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      ) : (
        <Button
          type="button"
          onClick={() => window.location.assign("/api/auth/oauth/google?client=web")}
        >
          Sign in
        </Button>
      )}
    </main>
  );
}
