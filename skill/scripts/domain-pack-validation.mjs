import {
	COPY_KEYS,
	OPTIONAL_FEATURE_KEYS,
	RESOURCE_KINDS,
	SLOT_UNITS,
	WEEKDAYS,
} from "./domain-pack-constants.mjs";
import {
	assertRecord,
	clockMinutes,
	requireAllowedKeys,
	requireClock,
	requireEnum,
	requireExactKeys,
	requireHalfHourClock,
	requireNonEmptyString,
	requirePositiveInteger,
	requireSlug,
	requireUnique,
} from "./domain-pack-primitives.mjs";
import { InjectError } from "./inject-errors.mjs";

function fail(message) {
	throw new InjectError("pack_invalid", message);
}

export function validateResources(resources) {
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

export function validateServices(services, resources) {
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

export function validateBusinessHours(businessHours) {
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

export function validateBlackouts(blackouts) {
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

export function validatePolicies(policies) {
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

export function validateFeatures(features, adminWidget) {
	assertRecord(features, "features");
	const keys = ["email", "polar"];
	if (features.customerAccounts !== undefined) {
		keys.push("customerAccounts");
	}
	for (const key of OPTIONAL_FEATURE_KEYS) {
		if (features[key] !== undefined) {
			keys.push(key);
		}
	}
	requireExactKeys(features, keys, "features");
	if (typeof features.email !== "boolean") {
		fail("features.email must be boolean");
	}
	if (typeof features.polar !== "boolean") {
		fail("features.polar must be boolean");
	}
	if (features.customerAccounts === undefined) {
		// Omission migrates to the baseline literal during canonicalization.
	} else if (features.customerAccounts === false) {
		fail(
			"features.customerAccounts=false is no longer supported; omit it or set true",
		);
	} else if (features.customerAccounts !== true) {
		fail("features.customerAccounts must be true");
	}
	for (const key of OPTIONAL_FEATURE_KEYS) {
		if (features[key] !== undefined && typeof features[key] !== "boolean") {
			fail(`features.${key} must be boolean`);
		}
	}
	// seatGrid has no operator CRUD surface; the pack must not ask for one.
	if (features.operatorCalendarCrud && adminWidget !== "calendar") {
		fail('operatorCalendarCrud requires adminWidget: "calendar"');
	}
}

export function validateCopy(copy, noShowEnabled) {
	assertRecord(copy, "copy");
	const requiredKeys = noShowEnabled ? [...COPY_KEYS, "noShow"] : COPY_KEYS;
	requireAllowedKeys(copy, [...COPY_KEYS, "noShow"], "copy");
	const missing = requiredKeys.filter((key) => copy[key] === undefined);
	if (missing.length > 0) {
		fail(`copy missing required keys: ${missing.join(", ")}`);
	}
	for (const key of COPY_KEYS) {
		requireNonEmptyString(copy[key], `copy.${key}`);
	}
	if (noShowEnabled) {
		requireNonEmptyString(copy.noShow, "copy.noShow");
	}
}
