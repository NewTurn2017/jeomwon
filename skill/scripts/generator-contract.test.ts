import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const injectPath = join(repoRoot, "skill/scripts/inject.mjs");
const bootstrapPath = join(repoRoot, "skill/scripts/bootstrap.mjs");
const skillSource = readFileSync(join(repoRoot, "skill/SKILL.md"), "utf8");
const verifySource = readFileSync(
  join(repoRoot, "skill/scripts/verify.mjs"),
  "utf8",
);
const qaSource = readFileSync(join(repoRoot, "template/scripts/qa.ts"), "utf8");
const templateSeedPath = join(
  repoRoot,
  "template/packages/backend/convex/jeomwonSeed.ts",
);
const temporaryRoots: string[] = [];

describe("authenticated app operator guidance", () => {
  test("Given the live QA guidance When an operator follows it Then every target is apps/app on port 3000", () => {
    expect(skillSource).toContain(
      "the command verifies one canonical dev deployment and starts the authenticated app itself",
    );
    expect(skillSource).toContain(
      "running generated authenticated app (`apps/app`)",
    );
    expect(skillSource).not.toContain("Convex/web");
    expect(skillSource).not.toContain("generated web app");
    expect(verifySource).toContain(
      "JEOMWON_QA_BASE_URL=http://localhost:3000 after Convex and the authenticated app are running",
    );
    expect(verifySource).not.toContain(
      "JEOMWON_QA_BASE_URL=http://localhost:3001",
    );
    expect(qaSource).toContain(
      'process.env.JEOMWON_QA_BASE_URL ?? "http://localhost:3000"',
    );
    expect(qaSource).not.toContain(
      'process.env.JEOMWON_QA_BASE_URL ?? "http://localhost:3001"',
    );
  });
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function readExamplePack(): Record<string, unknown> {
  const examples = readFileSync(join(repoRoot, "skill/EXAMPLES.md"), "utf8");
  const jsonBlock = examples.match(/```json\n([\s\S]*?)\n```/);
  if (!jsonBlock?.[1]) {
    throw new Error("EXAMPLES.md must contain a JSON domain pack");
  }
  const pack: unknown = JSON.parse(jsonBlock[1]);
  assertRecord(pack, "example pack");
  return structuredClone(pack);
}

function featureRecord(pack: Record<string, unknown>): Record<string, unknown> {
  const features = pack.features;
  assertRecord(features, "features");
  return features;
}

function createInjectFixture(pack = readExamplePack()): {
  readonly root: string;
  readonly packPath: string;
  readonly seedPath: string;
  readonly configPath: string;
} {
  const root = mkdtempSync("/tmp/jeomwon-generator-contract-");
  temporaryRoots.push(root);
  const seedPath = join(root, "packages/backend/convex/jeomwonSeed.ts");
  mkdirSync(dirname(seedPath), { recursive: true });
  cpSync(templateSeedPath, seedPath);
  const biomePath = join(root, "node_modules/.bin/biome");
  mkdirSync(dirname(biomePath), { recursive: true });
  writeFileSync(biomePath, "#!/bin/sh\nexit 0\n");
  chmodSync(biomePath, 0o755);
  const packPath = join(root, "domain-pack.json");
  writeFileSync(packPath, JSON.stringify(pack));
  return {
    root,
    packPath,
    seedPath,
    configPath: join(root, "packages/backend/domain.config.ts"),
  };
}

function inject(pack = readExamplePack()) {
  const fixture = createInjectFixture(pack);
  const result = spawnSync(
    "bun",
    [injectPath, fixture.root, fixture.packPath],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  return { fixture, result, output: `${result.stdout}${result.stderr}` };
}

describe("generator retained contract", () => {
  test("Given the template seed When a valid pack is injected Then seed bytes remain compatible", () => {
    const fixture = createInjectFixture();
    const before = readFileSync(fixture.seedPath);

    const result = spawnSync(
      "bun",
      [injectPath, fixture.root, fixture.packPath],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 15_000,
      },
    );

    expect(result.status).toBe(0);
    expect(readFileSync(fixture.seedPath)).toEqual(before);
  });
});

describe("customer accounts baseline contract", () => {
  test("Given customerAccounts is omitted When injected Then the emitted value is true", () => {
    const pack = readExamplePack();
    delete featureRecord(pack).customerAccounts;

    const { fixture, result } = inject(pack);

    expect(result.status).toBe(0);
    expect(readFileSync(fixture.configPath, "utf8")).toContain(
      '"customerAccounts": true',
    );
  });

  test("Given customerAccounts is true When injected Then the pack is accepted", () => {
    const pack = readExamplePack();
    featureRecord(pack).customerAccounts = true;

    const { result } = inject(pack);

    expect(result.status).toBe(0);
  });

  test("Given customerAccounts is false When injected Then the exact compatibility error is returned", () => {
    const pack = readExamplePack();
    featureRecord(pack).customerAccounts = false;

    const { result, output } = inject(pack);

    expect(result.status).toBe(1);
    expect(output).toContain(
      "features.customerAccounts=false is no longer supported; omit it or set true",
    );
  });

  test("Given customerAccounts has the wrong type When injected Then validation fails", () => {
    const pack = readExamplePack();
    featureRecord(pack).customerAccounts = "true";

    const { result, output } = inject(pack);

    expect(result.status).toBe(1);
    expect(output).toContain("features.customerAccounts must be true");
  });

  test("Given an unknown feature When injected Then validation fails closed", () => {
    const pack = readExamplePack();
    featureRecord(pack).unknownFeature = true;

    const { result, output } = inject(pack);

    expect(result.status).toBe(1);
    expect(output).toContain("features has unknown keys: unknownFeature");
  });

  test("Given a valid pack When injected Then the emitted type is literal true", () => {
    const { fixture, result } = inject();

    expect(result.status).toBe(0);
    expect(readFileSync(fixture.configPath, "utf8")).toContain(
      "customerAccounts: true;",
    );
  });

  test("Given a stale seed When injected Then inject leaves the template-owned file untouched", () => {
    const fixture = createInjectFixture();
    const staleSeed = "export const staleSeedProbe = true;\n";
    writeFileSync(fixture.seedPath, staleSeed);

    const result = spawnSync(
      "bun",
      [injectPath, fixture.root, fixture.packPath],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 15_000,
      },
    );

    expect(result.status).toBe(0);
    expect(readFileSync(fixture.seedPath, "utf8")).toBe(staleSeed);
  });

  test("Given a fresh target When bootstrapped Then offline verification and seed parity pass", () => {
    const parent = mkdtempSync("/tmp/jeomwon-bootstrap-contract-");
    temporaryRoots.push(parent);
    const pack = readExamplePack();
    delete featureRecord(pack).customerAccounts;
    const packPath = join(parent, "domain-pack.json");
    const target = join(parent, "generated-app");
    const defaultCache = join(homedir(), ".bun/install/cache");
    let writableCache = process.env.BUN_INSTALL_CACHE_DIR;
    if (writableCache === undefined) {
      try {
        accessSync(defaultCache, constants.W_OK);
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        writableCache = join(parent, "bun-cache");
        cpSync(defaultCache, writableCache, {
          recursive: true,
          mode: constants.COPYFILE_FICLONE,
        });
      }
    }
    writeFileSync(packPath, JSON.stringify(pack));

    const result = spawnSync(
      "bun",
      [bootstrapPath, target, "Generator Contract", packPath],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 180_000,
        env: {
          ...process.env,
          ...(writableCache === undefined
            ? {}
            : { BUN_INSTALL_CACHE_DIR: writableCache }),
          JEOMWON_QA_BASE_URL: "http://127.0.0.1:9",
        },
      },
    );

    expect(`${result.stdout}\n${result.stderr}`).toContain("VERIFY PASS");
    expect(result.status).toBe(0);
    expect(
      readFileSync(join(target, "packages/backend/convex/jeomwonSeed.ts")),
    ).toEqual(readFileSync(templateSeedPath));
    expect(
      readFileSync(
        join(target, "packages/backend/convex/demoReset.ts"),
        "utf8",
      ),
    ).toContain('from "./jeomwonSeed"');
    expect(readFileSync(templateSeedPath, "utf8")).toContain(
      "export async function seedDomainResources",
    );
  }, 180_000);
});
