export const RESOURCE_KINDS = new Set(["person", "seat", "room", "unit"]);
export const SLOT_UNITS = new Set(["minutes:30", "hour", "day"]);
export const ADMIN_WIDGETS = new Set(["calendar", "seatGrid"]);
export const LOCALES = new Set(["ko-KR", "en-US"]);
export const DOMAIN_PACK_SCHEMA_VERSION = 1;
export const WEEKDAYS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
];
export const LEGACY_TOP_LEVEL_KEYS = [
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
export const TOP_LEVEL_KEYS = ["schemaVersion", ...LEGACY_TOP_LEVEL_KEYS];
export const OPTIONAL_FEATURE_KEYS = [
	"waitlist",
	"operatorCalendarCrud",
	"noShow",
];
export const COPY_KEYS = [
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
