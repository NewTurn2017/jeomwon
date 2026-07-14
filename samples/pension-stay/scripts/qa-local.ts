#!/usr/bin/env bun
// One-command local QA gate.
// Prepares the dev Convex deployment, boots the web app in mock runtime,
// runs the full scenario-gate suite, then tears everything back down.
// Safe by design: refuses to run against anything but a `dev:` deployment,
// forces email capture via JEOMWON_QA_RESET (never sends real mail), and
// always unsets the QA env + stops the server on exit.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const backendDir = join(root, "packages/backend");
const webDir = join(root, "apps/web");
const port = Number(process.env.JEOMWON_QA_PORT ?? "3999");
const baseUrl = `http://localhost:${port}`;
const holdMs = process.env.JEOMWON_TEST_HOLD_MS ?? "1500";
const QA_ENV = ["JEOMWON_QA_RESET", "JEOMWON_TEST_HOLD_MS"];

const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string, s: string) =>
  COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
const bold = (s: string) => paint("1", s);
const gray = (s: string) => paint("90", s);
const green = (s: string) => paint("32", s);
const red = (s: string) => paint("31", s);

const TOTAL = 4;
const step = (n: number, msg: string) =>
  console.log(`\n${paint("35", "▸")} ${bold(`${n}/${TOTAL}`)}  ${msg}`);
const ok = (msg: string) => console.log(`  ${green("✓")} ${msg}`);
function fail(msg: string): never {
  console.error(`  ${red("✗")} ${msg}`);
  process.exit(1);
}

function convex(args: string[], inherit = false) {
  return spawnSync("npx", ["convex", ...args], {
    cwd: backendDir,
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

let webChild: ChildProcess | undefined;
let tornDown = false;
function teardown() {
  if (tornDown) return;
  tornDown = true;
  if (webChild && !webChild.killed) {
    try {
      webChild.kill("SIGTERM");
    } catch {}
  }
  spawnSync(
    "bash",
    ["-lc", `lsof -ti tcp:${port} | xargs kill 2>/dev/null || true`],
    { stdio: "ignore" },
  );
  for (const name of QA_ENV) convex(["env", "remove", name]);
}
process.on("exit", teardown);
process.on("SIGINT", () => {
  teardown();
  process.exit(130);
});

async function waitForReady(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`웹 서버가 ${timeoutMs / 1000}s 안에 준비되지 않았습니다 (${url}).`);
}

function resolveDeployment(): string {
  const envLocal = join(backendDir, ".env.local");
  if (!existsSync(envLocal)) {
    fail("packages/backend/.env.local 없음 — 먼저 bun setup 을 실행하세요.");
  }
  const raw = readFileSync(envLocal, "utf8").match(/^CONVEX_DEPLOYMENT=(.+)$/m);
  const deployment = (raw?.[1] ?? "").split("#")[0]?.trim() ?? "";
  if (!deployment) fail("CONVEX_DEPLOYMENT 를 .env.local 에서 찾지 못했습니다.");
  if (!deployment.startsWith("dev:")) {
    fail(`안전 차단: QA는 dev 배포에서만 돕니다. 현재: ${deployment}`);
  }
  return deployment;
}

async function main(): Promise<number> {
  const deployment = resolveDeployment();
  console.log(`${bold("jeomwon")} QA ${gray(`· ${deployment} · mock+capture`)}`);

  step(1, "Convex 함수 배포 + QA env 설정");
  if (convex(["dev", "--once"], true).status !== 0) fail("convex dev --once 실패");
  if (convex(["env", "set", "--", "JEOMWON_QA_RESET", "1"]).status !== 0) {
    fail("JEOMWON_QA_RESET 설정 실패");
  }
  if (convex(["env", "set", "--", "JEOMWON_TEST_HOLD_MS", holdMs]).status !== 0) {
    fail("JEOMWON_TEST_HOLD_MS 설정 실패");
  }
  ok(`dev 배포 준비 완료 ${gray("(리셋+빠른 홀드 만료, 종료 시 해제)")}`);

  step(2, `웹 서버 기동 ${gray(`(mock 런타임 · ${baseUrl})`)}`);
  webChild = spawn("bun", ["next", "dev", "-p", String(port)], {
    cwd: webDir,
    env: { ...process.env, AGENT_RUNTIME: "mock" },
    stdio: "ignore",
  });
  webChild.on("exit", (code) => {
    if (!tornDown && code && code !== 0) fail(`웹 서버가 종료됨 (code ${code}).`);
  });
  await waitForReady(baseUrl, 90_000);
  ok(`웹 서버 준비 완료 ${gray(baseUrl)}`);

  step(3, "스모크 QA 게이트 실행");
  const qa = spawnSync("bun", ["run", "qa:run"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      JEOMWON_QA_BASE_URL: baseUrl,
      JEOMWON_TEST_HOLD_MS: holdMs,
    },
  });

  step(4, "정리 — 서버 종료 · QA env 해제");
  teardown();
  ok("정리 완료");

  const code = qa.status ?? 1;
  if (code === 0) {
    console.log(`\n  ${green("✓")} ${bold("QA 통과")} ${gray("— 모든 게이트")}`);
  } else {
    console.log(
      `\n  ${red("✗")} ${bold("QA 실패")} ${gray(`(exit ${code})`)} — 위 로그 확인`,
    );
  }
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
