import type { AuthConfig } from "convex/server";

// WorkOS AuthKit issues the access tokens; Convex verifies them against the
// WorkOS keys for this client. Set WORKOS_CLIENT_ID on every deployment.
const clientId = process.env["WORKOS_CLIENT_ID"];
if (clientId === undefined || clientId === "") {
  throw new Error("WORKOS_CLIENT_ID must be set on the Convex deployment");
}

const jwks = `https://api.workos.com/sso/jwks/${clientId}`;

export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      applicationID: clientId,
      jwks,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks,
    },
  ],
} satisfies AuthConfig;
