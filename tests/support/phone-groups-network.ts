import { createServer, type IncomingMessage } from "node:http";
import { request as secureRequest } from "node:https";
import type { Duplex } from "node:stream";
import { connect } from "node:tls";

const upstream = "quixotic-crab-23.convex.cloud";
let offline = false;
const sockets = new Set<Duplex>();
function headers(req: IncomingMessage) {
  return { ...req.headers, host: upstream };
}
/** A real transport fault at the native app's network boundary, not a replacement backend. */
const server = createServer((req, res) => {
  if (req.url === "/__fault") {
    offline = req.method === "POST";
    if (offline) for (const socket of sockets) socket.destroy();
    res.end("ok");
    return;
  }
  if (offline) {
    res.writeHead(503).end("Offline for native journey proof");
    return;
  }
  const target = secureRequest(
    { hostname: upstream, path: req.url, method: req.method, headers: headers(req) },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  target.on("error", () => res.writeHead(502).end());
  req.pipe(target);
});
server.on("upgrade", (req, socket, head) => {
  if (offline) {
    socket.destroy();
    return;
  }
  const target = connect(443, upstream, { servername: upstream }, () => {
    const lines = Object.entries(headers(req)).flatMap(([key, value]) =>
      value === undefined ? [] : [`${key}: ${Array.isArray(value) ? value.join(", ") : value}`],
    );
    target.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${lines.join("\r\n")}\r\n\r\n`,
    );
    if (head.length) target.write(head);
    target.pipe(socket);
    socket.pipe(target);
  });
  sockets.add(socket);
  socket.on("error", () => target.destroy());
  socket.on("close", () => {
    sockets.delete(socket);
    target.destroy();
  });
  target.on("error", () => socket.destroy());
  target.on("close", () => socket.destroy());
});
server.listen(8321, "127.0.0.1");
const shutdown = () => {
  for (const socket of sockets) socket.destroy();
  server.close();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
// A bounded lifetime protects against loss of the owning native harness.
setTimeout(shutdown, 20 * 60_000).unref();
