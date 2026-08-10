import {
	ADMIN_WIDGETS,
	COPY_KEYS,
	DOMAIN_PACK_SCHEMA_VERSION,
	LEGACY_TOP_LEVEL_KEYS,
	LOCALES,
	TOP_LEVEL_KEYS,
	WEEKDAYS,
} from "./domain-pack-constants.mjs";
import {
	assertRecord,
	requireEmail,
	requireEnum,
	requireExactKeys,
	requireNonEmptyString,
	requireSlug,
} from "./domain-pack-primitives.mjs";
import {
	validateBlackouts,
	validateBusinessHours,
	validateCopy,
	validateFeatures,
	validatePolicies,
	validateResources,
	validateServices,
} from "./domain-pack-validation.mjs";
import { InjectError } from "./inject-errors.mjs";

export function normalizeDomainPack(value) {
	assertRecord(value, "domain pack");
	const migrated = Object.hasOwn(value, "schemaVersion")
		? structuredClone(value)
		: migrateLegacyDomainPack(value);
	if (migrated.schemaVersion !== DOMAIN_PACK_SCHEMA_VERSION) {
		throw new InjectError(
			"pack_schema_unsupported",
			`schemaVersion must be ${DOMAIN_PACK_SCHEMA_VERSION}`,
		);
	}
	validateDomainPack(migrated);
	return canonicalizeDomainPack(migrated);
}

function migrateLegacyDomainPack(value) {
	return {
		schemaVersion: DOMAIN_PACK_SCHEMA_VERSION,
		...structuredClone(value),
	};
}

function validateDomainPack(value) {
	assertRecord(value, "domain pack");
	requireExactKeys(value, TOP_LEVEL_KEYS, "domain pack");
	if (value.schemaVersion !== DOMAIN_PACK_SCHEMA_VERSION) {
		throw new InjectError(
			"pack_schema_unsupported",
			`schemaVersion must be ${DOMAIN_PACK_SCHEMA_VERSION}`,
		);
	}
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
	validateFeatures(value.features, value.adminWidget);
	validateCopy(value.copy, value.features.noShow);
}

function canonicalizeDomainPack(value) {
	return {
		schemaVersion: DOMAIN_PACK_SCHEMA_VERSION,
		domainKey: value.domainKey,
		storeName: value.storeName,
		storeTimezone: value.storeTimezone,
		locale: value.locale,
		resources: value.resources.map((resource) => ({
			key: resource.key,
			label: resource.label,
			kind: resource.kind,
		})),
		services: value.services.map((service) => ({
			key: service.key,
			label: service.label,
			...(service.durationMinutes === undefined
				? {}
				: { durationMinutes: service.durationMinutes }),
			...(service.slotUnit === undefined ? {} : { slotUnit: service.slotUnit }),
			...(service.dayUnit === undefined
				? {}
				: {
						dayUnit: {
							checkInTime: service.dayUnit.checkInTime,
							checkOutTime: service.dayUnit.checkOutTime,
							checkInLabel: service.dayUnit.checkInLabel,
							checkOutLabel: service.dayUnit.checkOutLabel,
						},
					}),
			...(service.price === undefined ? {} : { price: service.price }),
			resourceKind: service.resourceKind,
		})),
		businessHours: Object.fromEntries(
			WEEKDAYS.map((weekday) => {
				const window = value.businessHours[weekday];
				return [
					weekday,
					window.closed === true
						? { closed: true }
						: { open: window.open, close: window.close },
				];
			}),
		),
		blackouts: value.blackouts.map((blackout) => ({
			startIso: blackout.startIso,
			endIso: blackout.endIso,
			...(blackout.reason === undefined ? {} : { reason: blackout.reason }),
		})),
		policies: {
			cancelWindowHours: value.policies.cancelWindowHours,
			holdMinutes: value.policies.holdMinutes,
			confirmationRequired: true,
		},
		adminWidget: value.adminWidget,
		notificationEmail: value.notificationEmail,
		features: {
			email: value.features.email,
			polar: value.features.polar,
			customerAccounts: true,
			waitlist: value.features.waitlist ?? false,
			operatorCalendarCrud: value.features.operatorCalendarCrud ?? false,
			noShow: value.features.noShow ?? false,
		},
		copy: {
			...Object.fromEntries(COPY_KEYS.map((key) => [key, value.copy[key]])),
			noShow: value.features.noShow ? value.copy.noShow : null,
		},
	};
}

export function withoutSchemaVersion(pack) {
	return Object.fromEntries(
		LEGACY_TOP_LEVEL_KEYS.map((key) => [key, pack[key]]),
	);
}
