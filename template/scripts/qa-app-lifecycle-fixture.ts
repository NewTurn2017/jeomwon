#!/usr/bin/env bun
import { createServer } from "node:net";

const mode = process.argv[2];
const port = Number(process.argv[3]);
const nonce = process.argv[4] ?? "nonce";
if (mode === "early-exit") process.exit(23);

const server = createServer((socket) => {
  socket.end(
    `HTTP/1.1 200 OK\r\nx-jeomwon-qa-ready: ${nonce}\r\nContent-Length: 16\r\n\r\njeomwon-qa-ready`,
  );
});
let listening = false;
if (mode !== "signal") {
  const shutdown = () => {
    if (!listening) process.exit(0);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
server.listen({ port, host: "::", ipv6Only: false, exclusive: true }, () => {
  listening = true;
  process.stdout.write("JEOMWON_QA_FIXTURE_BOUND\n");
  if (mode === "success") process.stdout.write("JEOMWON_QA_APP_READY\n");
});
