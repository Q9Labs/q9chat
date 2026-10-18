import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/error")({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (new URL(request.url).searchParams.get("reason") === "phone_failed") {
          return new Response(
            '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sign-in not completed — Q9 Chat</title><h1>Sign-in wasn’t completed</h1><p>Close this page to return to your phone, or try signing in again on the web.</p><a href="/">Return to Q9 Chat</a></html>',
            {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
              },
            },
          );
        }
        return new Response(null, {
          status: 302,
          headers: { Location: "/?authError=1", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
