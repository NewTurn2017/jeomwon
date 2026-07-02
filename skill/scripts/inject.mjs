#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const RESOURCE_KINDS = new Set(["person", "seat", "room", "unit"]);
const SLOT_UNITS = new Set(["minutes:30", "hour", "day"]);
const ADMIN_WIDGETS = new Set(["calendar", "seatGrid"]);
const LOCALES = new Set(["ko-KR", "en-US"]);
const WEEKDAYS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
];
const TOP_LEVEL_KEYS = [
	"domainKey",
	"storeName",
	"storeTimezone",
	"locale",
	"resources",
	"services",
	"businessHours",
	"blackouts",
	"policies",
	"adminWidget",
	"notificationEmail",
	"features",
	"copy",
];
const COPY_KEYS = [
	"chatTitle",
	"chatGreeting",
	"chatPlaceholder",
	"relevanceRefusal",
	"confirmationRequired",
	"privacyRefusal",
	"availabilityIntro",
	"holdCreated",
	"confirmed",
	"rescheduled",
	"cancelled",
	"cancelEscalated",
	"holdExpired",
	"schemaError",
	"guardrailBanner",
	"nextStepAvailability",
	"nextStepHold",
	"nextStepConfirmed",
	"policySummary",
];

function fail(message) {
	console.error(`ERROR: ${message}`);
	process.exit(1);
}

function usage() {
	fail("usage: bun skill/scripts/inject.mjs <target-dir> <domain-pack.json>");
}

const [targetArg, packArg] = process.argv.slice(2);
if (!targetArg || !packArg) {
	usage();
}

const targetDir = resolve(process.cwd(), targetArg);
const packPath = resolve(process.cwd(), packArg);

if (!existsSync(targetDir)) {
	fail(`missing target directory: ${targetDir}`);
}
if (!existsSync(packPath)) {
	fail(`missing domain pack JSON: ${packPath}`);
}

const pack = await readJson(packPath);
validateDomainPack(pack);

const domainConfigPath = join(targetDir, "packages/backend/domain.config.ts");
const seedPath = join(targetDir, "packages/backend/convex/jeomwonSeed.ts");
const emailSamplePath = join(
	targetDir,
	"packages/email/src/reservation-sample.ts",
);

await writeProjectFile(domainConfigPath, renderDomainConfig(pack));
await writeProjectFile(seedPath, renderSeedMutation());
if (existsSync(emailSamplePath)) {
	await writeProjectFile(emailSamplePath, renderReservationSample(pack));
}

formatGeneratedFiles(
	[domainConfigPath, seedPath, emailSamplePath].filter((path) =>
		existsSync(path),
	),
);

console.log(`Injected domain pack: ${pack.domainKey}`);
console.log(`Wrote ${domainConfigPath}`);
console.log(`Wrote ${seedPath}`);
if (existsSync(emailSamplePath)) {
	console.log(`Wrote ${emailSamplePath}`);
}

async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`invalid JSON in ${path}: ${detail}`);
	}
}

async function writeProjectFile(path, content) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${content.trim()}\n`, "utf8");
}

// Generated TS is emitted one-property-per-line; biome's formatter (project
// config, enforced by the email package `lint`) rewraps any line over its print
// width, so long copy strings would otherwise fail `bun run lint` on a fresh
// project. Run the project formatter here so injected files are lint-clean at
// rest. cwd = targetDir so biome resolves the project biome.json (2-space).
function formatGeneratedFiles(paths) {
	if (paths.length === 0) {
		return;
	}
	const localBiome = join(targetDir, "node_modules/.bin/biome");
	// `bunx biome` resolves the unrelated npm package named `biome`, not the
	// formatter, so the fallback must name the scoped package explicitly.
	const attempts = existsSync(localBiome)
		? [[localBiome, ["format", "--write", ...paths]]]
		: [
				["bunx", ["--offline", "@biomejs/biome", "format", "--write", ...paths]],
				["bunx", ["@biomejs/biome", "format", "--write", ...paths]],
			];
	for (const [command, args] of attempts) {
		const result = spawnSync(command, args, { cwd: targetDir, stdio: "ignore" });
		if (result.status === 0) {
			return;
		}
	}
	console.warn(
		"WARN: could not run biome to format generated files. Run `bun run format` in the project after `bun setup`.",
	);
}

function validateDomainPack(value) {
	assertRecord(value, "domain pack");
	requireExactKeys(value, TOP_LEVEL_KEYS, "domain pack");
	requireSlug(value.domainKey, "domainKey");
	requireNonEmptyString(value.storeName, "storeName");
	requireNonEmptyString(value.storeTimezone, "storeTimezone");
	requireEnum(value.locale, LOCALES, "locale");
	requireEnum(value.adminWidget, ADMIN_WIDGETS, "adminWidget");
	requireEmail(value.notificationEmail, "notificationEmail");
	validateResources(value.resources);
	validateServices(value.services, value.resources);
	validateBusinessHours(value.businessHours);
	validateBlackouts(value.blackouts);
	validatePolicies(value.policies);
	validateFeatures(value.features);
	validateCopy(value.copy);
}

function validateResources(resources) {
	if (!Array.isArray(resources) || resources.length === 0) {
		fail("resources must be a non-empty array");
	}

	const seen = new Set();
	for (const [index, resource] of resources.entries()) {
		const label = `resources[${index}]`;
		assertRecord(resource, label);
		requireExactKeys(resource, ["key", "label", "kind"], label);
		requireSlug(resource.key, `${label}.key`);
		requireNonEmptyString(resource.label, `${label}.label`);
		requireEnum(resource.kind, RESOURCE_KINDS, `${label}.kind`);
		requireUnique(seen, resource.key, `${label}.key`);
	}
}

function validateServices(services, resources) {
	if (!Array.isArray(services) || services.length === 0) {
		fail("services must be a non-empty array");
	}

	const resourceKinds = new Set(resources.map((resource) => resource.kind));
	const seen = new Set();
	for (const [index, service] of services.entries()) {
		const label = `services[${index}]`;
		assertRecord(service, label);
		requireAllowedKeys(
			service,
			[
				"key",
				"label",
				"durationMinutes",
				"slotUnit",
				"dayUnit",
				"price",
				"resourceKind",
			],
			label,
		);
		requireSlug(service.key, `${label}.key`);
		requireUnique(seen, service.key, `${label}.key`);
		requireNonEmptyString(service.label, `${label}.label`);
		requireEnum(service.resourceKind, RESOURCE_KINDS, `${label}.resourceKind`);
		if (!resourceKinds.has(service.resourceKind)) {
			fail(`${label}.resourceKind has no matching resource`);
		}
		if (service.slotUnit !== undefined) {
			requireEnum(service.slotUnit, SLOT_UNITS, `${label}.slotUnit`);
		}
		if (service.durationMinutes !== undefined) {
			requirePositiveInteger(
				service.durationMinutes,
				`${label}.durationMinutes`,
			);
		}
		if (service.price !== undefined) {
			requireNonEmptyString(service.price, `${label}.price`);
		}
		if (service.slotUnit === "day") {
			validateDayUnit(service.dayUnit, `${label}.dayUnit`);
		} else if (service.dayUnit !== undefined) {
			fail(`${label}.dayUnit is only allowed when slotUnit is "day"`);
		}
	}
}

function validateDayUnit(dayUnit, label) {
	assertRecord(dayUnit, label);
	requireExactKeys(
		dayUnit,
		["checkInTime", "checkOutTime", "checkInLabel", "checkOutLabel"],
		label,
	);
	requireClock(dayUnit.checkInTime, `${label}.checkInTime`);
	requireClock(dayUnit.checkOutTime, `${label}.checkOutTime`);
	requireHalfHourClock(dayUnit.checkInTime, `${label}.checkInTime`);
	requireHalfHourClock(dayUnit.checkOutTime, `${label}.checkOutTime`);
	requireNonEmptyString(dayUnit.checkInLabel, `${label}.checkInLabel`);
	requireNonEmptyString(dayUnit.checkOutLabel, `${label}.checkOutLabel`);
}

function validateBusinessHours(businessHours) {
	assertRecord(businessHours, "businessHours");
	requireExactKeys(businessHours, WEEKDAYS, "businessHours");
	for (const weekday of WEEKDAYS) {
		const window = businessHours[weekday];
		assertRecord(window, `businessHours.${weekday}`);
		if (window.closed === true) {
			requireExactKeys(window, ["closed"], `businessHours.${weekday}`);
			continue;
		}
		requireExactKeys(window, ["open", "close"], `businessHours.${weekday}`);
		requireClock(window.open, `businessHours.${weekday}.open`);
		requireClock(window.close, `businessHours.${weekday}.close`);
		if (clockMinutes(window.open) >= clockMinutes(window.close)) {
			fail(`businessHours.${weekday}.open must be before close`);
		}
	}
}

function validateBlackouts(blackouts) {
	if (!Array.isArray(blackouts)) {
		fail("blackouts must be an array");
	}

	for (const [index, blackout] of blackouts.entries()) {
		const label = `blackouts[${index}]`;
		assertRecord(blackout, label);
		requireAllowedKeys(blackout, ["startIso", "endIso", "reason"], label);
		requireNonEmptyString(blackout.startIso, `${label}.startIso`);
		requireNonEmptyString(blackout.endIso, `${label}.endIso`);
		const startMs = Date.parse(blackout.startIso);
		const endMs = Date.parse(blackout.endIso);
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
			fail(`${label} must use parseable ISO timestamps`);
		}
		if (startMs >= endMs) {
			fail(`${label}.startIso must be before endIso`);
		}
		if (blackout.reason !== undefined) {
			requireNonEmptyString(blackout.reason, `${label}.reason`);
		}
	}
}

function validatePolicies(policies) {
	assertRecord(policies, "policies");
	requireExactKeys(
		policies,
		["cancelWindowHours", "holdMinutes", "confirmationRequired"],
		"policies",
	);
	requirePositiveInteger(
		policies.cancelWindowHours,
		"policies.cancelWindowHours",
	);
	requirePositiveInteger(policies.holdMinutes, "policies.holdMinutes");
	if (policies.confirmationRequired !== true) {
		fail("policies.confirmationRequired must be true");
	}
}

function validateFeatures(features) {
	assertRecord(features, "features");
	requireExactKeys(features, ["email", "polar"], "features");
	if (typeof features.email !== "boolean") {
		fail("features.email must be boolean");
	}
	if (typeof features.polar !== "boolean") {
		fail("features.polar must be boolean");
	}
}

function validateCopy(copy) {
	assertRecord(copy, "copy");
	requireExactKeys(copy, COPY_KEYS, "copy");
	for (const key of COPY_KEYS) {
		requireNonEmptyString(copy[key], `copy.${key}`);
	}
}

function renderDomainConfig(pack) {
	return `export type ResourceKind = "person" | "seat" | "room" | "unit";

export type SlotUnit = "minutes:30" | "hour" | "day";

export type AdminWidget = "calendar" | "seatGrid";

export type LocaleCode = "ko-KR" | "en-US";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type BusinessHoursWindow =
  | {
      open: string;
      close: string;
    }
  | {
      closed: true;
    };

export type DomainResource = {
  key: string;
  label: string;
  kind: ResourceKind;
};

export type DomainDayUnit = {
  checkInTime: string;
  checkOutTime: string;
  checkInLabel: string;
  checkOutLabel: string;
};

export type DomainService = {
  key: string;
  label: string;
  durationMinutes?: number;
  slotUnit?: SlotUnit;
  dayUnit?: DomainDayUnit;
  price?: string;
  resourceKind: ResourceKind;
};

export type DomainBlackout = {
  startIso: string;
  endIso: string;
  reason?: string;
};

export type DomainPolicies = {
  cancelWindowHours: number;
  holdMinutes: number;
  confirmationRequired: true;
};

export type DomainCopy = {
  chatTitle: string;
  chatGreeting: string;
  chatPlaceholder: string;
  relevanceRefusal: string;
  confirmationRequired: string;
  privacyRefusal: string;
  availabilityIntro: string;
  holdCreated: string;
  confirmed: string;
  rescheduled: string;
  cancelled: string;
  cancelEscalated: string;
  holdExpired: string;
  schemaError: string;
  guardrailBanner: string;
  nextStepAvailability: string;
  nextStepHold: string;
  nextStepConfirmed: string;
  policySummary: string;
};

export type DomainConfig = {
  domainKey: string;
  storeName: string;
  storeTimezone: string;
  locale: LocaleCode;
  resources: DomainResource[];
  services: DomainService[];
  businessHours: Record<Weekday, BusinessHoursWindow>;
  blackouts: DomainBlackout[];
  policies: DomainPolicies;
  adminWidget: AdminWidget;
  notificationEmail: string;
  features: {
    email: boolean;
    polar: boolean;
  };
  copy: DomainCopy;
};

export const domainConfig: DomainConfig = ${JSON.stringify(pack, null, 2)};

export function getHoldDurationMs() {
  const overrideMs = Number.parseInt(
    process.env.JEOMWON_TEST_HOLD_MS ?? "",
    10,
  );

  if (Number.isFinite(overrideMs) && overrideMs > 0) {
    return overrideMs;
  }

  return domainConfig.policies.holdMinutes * 60 * 1000;
}

export function getServiceDurationMinutes(service: DomainService) {
  if (typeof service.durationMinutes === "number") {
    return service.durationMinutes;
  }

  if (service.slotUnit === "hour") {
    return 60;
  }

  if (service.slotUnit === "day") {
    const dayUnit = service.dayUnit;
    if (dayUnit) {
      const checkIn = parseClockMinutes(dayUnit.checkInTime);
      const checkOut = parseClockMinutes(dayUnit.checkOutTime);
      return checkOut > checkIn
        ? checkOut - checkIn
        : 24 * 60 - checkIn + checkOut;
    }
    return 24 * 60;
  }

  return 30;
}

function parseClockMinutes(clock: string) {
  const [hour, minute] = clock
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  return hour! * 60 + minute!;
}`;
}

function renderSeedMutation() {
	return `import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import { mutation } from "./_generated/server";

export const seed = mutation({
  args: {},
  returns: v.object({
    resources: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let touched = 0;

    for (const resource of domainConfig.resources) {
      const existing = await ctx.db
        .query("resources")
        .withIndex("by_domain_key", (q) =>
          q.eq("domainKey", domainConfig.domainKey).eq("key", resource.key),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          label: resource.label,
          kind: resource.kind,
          active: true,
          updatedAtMs: now,
        });
      } else {
        await ctx.db.insert("resources", {
          domainKey: domainConfig.domainKey,
          key: resource.key,
          label: resource.label,
          kind: resource.kind,
          active: true,
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
      touched += 1;
    }

    return { resources: touched };
  },
});`;
}

function renderReservationSample(pack) {
	const service = pack.services[0];
	const resource =
		pack.resources.find((item) => item.kind === service.resourceKind) ??
		pack.resources[0];
	const timeWindow =
		service.slotUnit === "day" && service.dayUnit
			? `${service.dayUnit.checkInLabel} 7월 3일 금 ${service.dayUnit.checkInTime} - ${service.dayUnit.checkOutLabel} 7월 4일 토 ${service.dayUnit.checkOutTime}`
			: "7월 3일 금 10:00-10:30";

	return `import type { ReservationEmailContext } from "./reservation.js";

export const sampleReservationEmailContext = {
  storeName: ${JSON.stringify(pack.storeName)},
  displayName: null,
  reservationId: "demo-reservation",
  serviceLabel: ${JSON.stringify(service.label)},
  resourceLabel: ${JSON.stringify(resource.label)},
  timeWindow: ${JSON.stringify(timeWindow)},
  policySummary: ${JSON.stringify(pack.copy.policySummary)},
  nextStep: ${JSON.stringify(pack.copy.nextStepConfirmed)},
  copy: {
    confirmed: ${JSON.stringify(pack.copy.confirmed)},
    rescheduled: ${JSON.stringify(pack.copy.rescheduled)},
    cancelled: ${JSON.stringify(pack.copy.cancelled)},
    cancelEscalated: ${JSON.stringify(pack.copy.cancelEscalated)},
  },
} satisfies ReservationEmailContext;`;
}

function assertRecord(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		fail(`${label} must be an object`);
	}
}

function requireExactKeys(record, keys, label) {
	requireAllowedKeys(record, keys, label);
	const missing = keys.filter((key) => record[key] === undefined);
	if (missing.length > 0) {
		fail(`${label} missing required keys: ${missing.join(", ")}`);
	}
}

function requireAllowedKeys(record, keys, label) {
	const allowed = new Set(keys);
	const unknown = Object.keys(record).filter((key) => !allowed.has(key));
	if (unknown.length > 0) {
		fail(`${label} has unknown keys: ${unknown.join(", ")}`);
	}
}

function requireSlug(value, label) {
	requireNonEmptyString(value, label);
	if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
		fail(`${label} must be a lowercase slug`);
	}
}

function requireNonEmptyString(value, label) {
	if (typeof value !== "string" || value.trim() === "") {
		fail(`${label} must be a non-empty string`);
	}
}

function requireEnum(value, allowed, label) {
	requireNonEmptyString(value, label);
	if (!allowed.has(value)) {
		fail(`${label} must be one of: ${[...allowed].join(", ")}`);
	}
}

function requirePositiveInteger(value, label) {
	if (!Number.isInteger(value) || value <= 0) {
		fail(`${label} must be a positive integer`);
	}
}

function requireUnique(seen, value, label) {
	if (seen.has(value)) {
		fail(`${label} must be unique: ${value}`);
	}
	seen.add(value);
}

function requireEmail(value, label) {
	requireNonEmptyString(value, label);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
		fail(`${label} must look like an email address`);
	}
}

function requireClock(value, label) {
	requireNonEmptyString(value, label);
	if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
		fail(`${label} must use HH:MM 24-hour time`);
	}
}

function requireHalfHourClock(value, label) {
	const minutes = clockMinutes(value) % 60;
	if (minutes !== 0 && minutes !== 30) {
		fail(`${label} must align to a 30-minute boundary`);
	}
}

function clockMinutes(clock) {
	const [hour, minute] = clock
		.split(":")
		.map((part) => Number.parseInt(part, 10));
	return hour * 60 + minute;
}
