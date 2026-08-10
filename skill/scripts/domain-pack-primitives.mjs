import { InjectError } from "./inject-errors.mjs";

function fail(message) {
	throw new InjectError("pack_invalid", message);
}

export function assertRecord(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		fail(`${label} must be an object`);
	}
}

export function requireExactKeys(record, keys, label) {
	requireAllowedKeys(record, keys, label);
	const missing = keys.filter((key) => record[key] === undefined);
	if (missing.length > 0) {
		fail(`${label} missing required keys: ${missing.join(", ")}`);
	}
}

export function requireAllowedKeys(record, keys, label) {
	const allowed = new Set(keys);
	const unknown = Object.keys(record).filter((key) => !allowed.has(key));
	if (unknown.length > 0) {
		fail(`${label} has unknown keys: ${unknown.join(", ")}`);
	}
}

export function requireSlug(value, label) {
	requireNonEmptyString(value, label);
	if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
		fail(`${label} must be a lowercase slug`);
	}
}

export function requireNonEmptyString(value, label) {
	if (typeof value !== "string" || value.trim() === "") {
		fail(`${label} must be a non-empty string`);
	}
}

export function requireEnum(value, allowed, label) {
	requireNonEmptyString(value, label);
	if (!allowed.has(value)) {
		fail(`${label} must be one of: ${[...allowed].join(", ")}`);
	}
}

export function requirePositiveInteger(value, label) {
	if (!Number.isInteger(value) || value <= 0) {
		fail(`${label} must be a positive integer`);
	}
}

export function requireUnique(seen, value, label) {
	if (seen.has(value)) {
		fail(`${label} must be unique: ${value}`);
	}
	seen.add(value);
}

export function requireEmail(value, label) {
	requireNonEmptyString(value, label);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
		fail(`${label} must look like an email address`);
	}
}

export function requireClock(value, label) {
	requireNonEmptyString(value, label);
	if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
		fail(`${label} must use HH:MM 24-hour time`);
	}
}

export function requireHalfHourClock(value, label) {
	const minutes = clockMinutes(value) % 60;
	if (minutes !== 0 && minutes !== 30) {
		fail(`${label} must align to a 30-minute boundary`);
	}
}

export function clockMinutes(clock) {
	const [hour, minute] = clock
		.split(":")
		.map((part) => Number.parseInt(part, 10));
	return hour * 60 + minute;
}
