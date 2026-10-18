import { createRoot } from "react-dom/client";

import { SessionProvider, useSession } from "../src/lib/session.js";

function Harness() {
  const { status, user, verifyEmail, signOut } = useSession();
  return (
    <>
      <output data-testid="session">
        {status}:{user?.id ?? "none"}
      </output>
      <button
        onClick={() => {
          void verifyEmail("browser@example.net", "123456");
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
