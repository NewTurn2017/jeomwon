import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	accessSync,
	constants,
	cpSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	bootstrapPath,
	cleanupFixtures,
	copyRecord,
	createInjectFixture,
	featureRecord,
	inject,
	injectPath,
	localTemplateEnvironment,
	readExamplePack,
	repoRoot,
	templateSeedPath,
	temporaryRoots,
} from "./generator-test-helpers";

afterEach(cleanupFixtures, 30_000);

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

	test("Given customerAccounts is false When injected Then pack validation fails", () => {
		const pack = readExamplePack();
		featureRecord(pack).customerAccounts = false;

		const { result, output } = inject(pack);

		expect(result.status).toBe(1);
		expect(output).toContain("ERROR [pack_invalid]");
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

	test("Given legacy no-show fields are omitted When injected Then fixed defaults are emitted", () => {
		const pack = readExamplePack();
		delete featureRecord(pack).noShow;
		delete copyRecord(pack).noShow;

		const { fixture, result } = inject(pack);
		const generated = readFileSync(fixture.configPath, "utf8");

		expect(result.status).toBe(0);
		expect(generated).toContain('"noShow": false');
		expect(generated).toContain('"noShow": null');
		expect(generated).toContain("noShow: boolean;");
		expect(generated).toContain("noShow: string | null;");
	});

	for (const [locale, publicCopy] of [
		["ko-KR", "예약 불이행 처리되었습니다. 매장에 문의해 주세요."],
		[
			"en-US",
			"This reservation was marked no-show. Contact the store for help.",
		],
	] as const) {
		test(`Given no-show is enabled for ${locale} When injected Then public next-step copy is required and preserved`, () => {
			const pack = readExamplePack();
			pack.locale = locale;
			featureRecord(pack).noShow = true;
			copyRecord(pack).noShow = publicCopy;

			const { fixture, result } = inject(pack);
			const generated = readFileSync(fixture.configPath, "utf8");

			expect(result.status).toBe(0);
			expect(generated).toContain('"noShow": true');
			expect(generated).toContain(JSON.stringify(publicCopy));
			expect(generated).not.toMatch(
				/operatorMemo|privateDecision|riskSignals|costBasisCents/,
			);
		});
	}

	test("Given no-show is enabled without copy When injected Then validation fails closed", () => {
		const pack = readExamplePack();
		featureRecord(pack).noShow = true;
		delete copyRecord(pack).noShow;

		const { result, output } = inject(pack);

		expect(result.status).toBe(1);
		expect(output).toContain("copy missing required keys: noShow");
	});

	test("Given no-show is disabled with non-null copy When injected Then output remains null", () => {
		const pack = readExamplePack();
		featureRecord(pack).noShow = false;
		copyRecord(pack).noShow = "must not leak while disabled";

		const { fixture, result } = inject(pack);

		expect(result.status).toBe(0);
		expect(readFileSync(fixture.configPath, "utf8")).toContain(
			'"noShow": null',
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
				env: localTemplateEnvironment({
					...(writableCache === undefined
						? {}
						: { BUN_INSTALL_CACHE_DIR: writableCache }),
					JEOMWON_QA_BASE_URL: "http://127.0.0.1:9",
				}),
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
