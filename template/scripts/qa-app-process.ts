#!/usr/bin/env bun
import { spawn } from "node:child_process";

const port = process.argv[2];
if (!port || !/^\d+$/.test(port)) {
  console.error("qa_app_port_invalid");
  process.exit(1);
}

const child = spawn("bun", ["next", "dev", "-p", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
let ready = false;
let output = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk: string) => {
  output = `${output}${chunk}`.slice(-4096);
  if (!ready && /(?:^|\n).*Ready in [^\n]+/.test(output)) {
    ready = true;
    process.stdout.write("JEOMWON_QA_APP_READY\n");
  }
});
child.stderr.resume();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  });
}
child.once("error", () => {
  console.error("qa_app_child_spawn_failed");
  process.exit(1);
});
child.once("close", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGTERM" ? 143 : 1);
});
