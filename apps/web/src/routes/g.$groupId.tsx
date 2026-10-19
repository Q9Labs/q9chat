import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/g/$groupId")({
  validateSearch: (search: { m?: unknown }) => ({
    m:
      Number.isSafeInteger(Number(search.m)) && Number(search.m) > 0 ? Number(search.m) : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    redirect({
      throw: true,
      to: "/",
      search: { group: params.groupId, message: search.m, authError: undefined },
    });
  },
});
