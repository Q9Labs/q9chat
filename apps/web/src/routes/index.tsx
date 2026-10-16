import { Button } from "@q9labsai/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";

export const Route = createFileRoute("/")({ component: HomePage });

// Placeholder until the groups list exists: proves sign-in reaches Convex.
function HomePage() {
  const { user, signIn, signOut } = useAuth();
  const { isLoading, isAuthenticated } = useConvexAuth();

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Q9 Chat</h1>
      {isLoading ? null : isAuthenticated && user !== null ? (
        <>
          <p className="text-muted-foreground">Signed in as {user.email}</p>
          <Button type="button" variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </>
      ) : (
        <Button type="button" onClick={() => void signIn()}>
          Sign in
        </Button>
      )}
    </main>
  );
}
