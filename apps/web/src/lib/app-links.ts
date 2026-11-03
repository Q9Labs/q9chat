const appleTeamId = "5K9635LZ6F";
const bundleId = "ai.q9labs.chat";
// Google Play app signing certificate for ai.q9labs.chat, as reported by the Play Developer API.
const playSigningSha256 =
  "CF:DE:54:81:33:20:50:2D:12:47:33:5C:B2:57:73:2B:DF:39:5D:70:94:AF:6C:A0:F0:87:D2:A3:76:B9:C0:AF";

/** Invites and message links open the phone app; sign-in callbacks stay in the browser. */
export const appleAppSiteAssociation = {
  applinks: {
    details: [
      {
        appIDs: [`${appleTeamId}.${bundleId}`],
        components: [{ "/": "/join/*" }, { "/": "/g/*" }],
      },
    ],
  },
} as const;

export const assetLinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: bundleId,
      sha256_cert_fingerprints: [playSigningSha256],
    },
  },
] as const;

export function wellKnownResponse(body: object): Response {
  return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
}
