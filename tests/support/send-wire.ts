import type { surfaceOf } from "@e2e-dev/web";
import { Schema } from "effect";

type Page = ReturnType<NonNullable<ReturnType<typeof surfaceOf>>["page"]>;
const Mutation = Schema.Struct({
  type: Schema.Literal("Mutation"),
  requestId: Schema.Number,
  udfPath: Schema.String,
  args: Schema.Array(Schema.Unknown),
});
const Send = Schema.Struct({
  groupId: Schema.String,
  clientKey: Schema.String,
  body: Schema.String,
});
const Response = Schema.Struct({
  type: Schema.Literal("MutationResponse"),
  requestId: Schema.Number,
});
const Ping = Schema.Struct({ type: Schema.Literal("Ping") });

type Mode =
  | "normal"
  | "hold"
  | "fail-before"
  | "fail-committed"
  | "await-retry"
  | "retry-committed";

const noRelease = () => {};
const holdingResponses = (mode: Mode) =>
  mode === "fail-committed" || mode === "await-retry" || mode === "retry-committed";

/** Faults are on the real Convex socket, never a replacement app/backend implementation. */
export async function sendWire(page: Page) {
  let mode: Mode = "normal";
  let requestId = -1;
  const starts: number[] = [];
  const sends: (typeof Send.Type)[] = [];
  let release = noRelease;
  await page.routeWebSocket("wss://quixotic-crab-23.convex.cloud/**", (socket) => {
    const server = socket.connectToServer();
    const heldRequests: (string | Buffer)[] = [];
    const heldResponses: (string | Buffer)[] = [];
    const failure = (id: number) =>
      socket.send(
        JSON.stringify({
          type: "MutationResponse",
          requestId: id,
          success: false,
          result: "Forced send failure",
          logLines: [],
        }),
      );
    release = () => {
      mode = "normal";
      for (const request of heldRequests.splice(0)) server.send(request);
      for (const response of heldResponses.splice(0)) socket.send(response);
    };
    function handleSend(request: typeof Mutation.Type, message: string | Buffer) {
      sends.push(Schema.decodeUnknownSync(Send)(request.args[0]));
      requestId = request.requestId;
      if (mode === "fail-before") {
        mode = "normal";
        failure(requestId);
        return;
      }
      if (mode === "hold") {
        heldRequests.push(message);
        return;
      }
      if (mode === "await-retry") mode = "retry-committed";
      server.send(message);
    }
    socket.onMessage((message) => {
      const parsed: unknown = JSON.parse(message.toString());
      if (Schema.is(Mutation)(parsed) && parsed.udfPath === "typing:start") starts.push(Date.now());
      if (Schema.is(Mutation)(parsed) && parsed.udfPath === "messages:send")
        handleSend(parsed, message);
      else server.send(message);
    });
    function consumeResponse(parsed: unknown, message: string | Buffer) {
      if (!Schema.is(Response)(parsed) || parsed.requestId !== requestId) return false;
      if (mode === "fail-committed") {
        mode = "await-retry";
        failure(requestId);
        return true;
      }
      if (mode === "retry-committed") {
        socket.send(message);
        release();
        return true;
      }
      return false;
    }
    server.onMessage((message) => {
      const parsed: unknown = JSON.parse(message.toString());
      if (Schema.is(Ping)(parsed)) socket.send(message);
      else if (!consumeResponse(parsed, message)) {
        if (holdingResponses(mode)) heldResponses.push(message);
        else socket.send(message);
      }
    });
  });
  return {
    sends,
    starts,
    set: (next: Mode) => {
      mode = next;
    },
    release: () => release(),
  };
}
