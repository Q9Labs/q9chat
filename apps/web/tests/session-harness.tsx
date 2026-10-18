import { useState } from "react";
import { createRoot } from "react-dom/client";

import { EmailVerificationError, SessionProvider, useSession } from "../src/lib/session.js";

function Harness() {
  const [error, setError] = useState("");
  const { status, user, verifyEmail, signOut } = useSession();
  return (
    <>
      <output data-testid="session">
        {status}:{user?.id ?? "none"}
      </output>
      <output role="alert">{error}</output>
      <button
        onClick={() => {
          void verifyEmail("browser@example.net", "123456").catch((failure: unknown) => {
            setError(
              failure instanceof EmailVerificationError ? failure.message : "Sign-in failed",
            );
          });
        }}
      >
        Verify
      </button>
      <button
        onClick={() => {
          void signOut();
        }}
      >
        Sign out
      </button>
    </>
  );
}
const root = document.querySelector("#root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(
  <SessionProvider>
    <Harness />
  </SessionProvider>,
);
