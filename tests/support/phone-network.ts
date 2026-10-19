import {
  request as plainRequest,
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { request as secureRequest } from "node:https";
import type { Duplex } from "node:stream";
import { connect } from "node:tls";

const upstream = "quixotic-crab-23.convex.cloud";
const mediaUpstream = "quixotic-crab-23.convex.site";
let offline = false;
let uploadFailed = false;
const sockets = new Set<Duplex>();
function headers(req: IncomingMessage, host = upstream) {
  return { ...req.headers, host };
}
function fault(req: IncomingMessage, res: ServerResponse) {
  if (req.url === "/__uploadFault") {
    uploadFailed = req.method === "POST";
    res.end("ok");
    return true;
  }
  if (req.url === "/__fault") {
    offline = req.method === "POST";
    if (offline) for (const socket of sockets) socket.destroy();
    res.end("ok");
    return true;
  }
  return false;
}
function forwardAuth(req: IncomingMessage, res: ServerResponse) {
  if (!req.url?.startsWith("/api/auth/")) return false;
  {
    const target = plainRequest(
      {
        hostname: "localhost",
        port: 3174,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    target.on("error", () => res.writeHead(502).end());
    req.pipe(target);
    return true;
  }
}
function forwardChat(req: IncomingMessage, res: ServerResponse) {
  const host = req.url === "/upload" || req.url?.startsWith("/files/") ? mediaUpstream : upstream;
  const target = secureRequest(
    { hostname: host, path: req.url, method: req.method, headers: headers(req, host) },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  target.on("error", () => res.writeHead(502).end());
  req.pipe(target);
}
/** A real transport fault at the native app's network boundary, not a replacement backend. */
const server = createServer((req, res) => {
  if (fault(req, res)) return;
  if (offline) {
    res.writeHead(503).end("Offline for native journey proof");
    return;
  }
  if (uploadFailed && req.url === "/upload") {
    res.writeHead(503).end("Upload failed for native journey proof");
    return;
  }
  if (forwardAuth(req, res)) return;
  forwardChat(req, res);
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
