export const holdMs = process.env.JEOMWON_TEST_HOLD_MS ?? "30000";

export const TEMP_CONVEX_ENV_NAMES = [
  "AUTH_ANONYMOUS_LOGIN",
  "JEOMWON_ADMIN_EMAILS",
  "JEOMWON_QA_RESET",
  "JEOMWON_TEST_HOLD_MS",
] as const;

export function temporaryConvexEnv() {
  return {
    AUTH_ANONYMOUS_LOGIN: "1",
    JEOMWON_ADMIN_EMAILS: "jeomwon-qa-nonoperator@reserved.invalid",
    JEOMWON_QA_RESET: "1",
    JEOMWON_TEST_HOLD_MS: holdMs,
  } as const;
}
