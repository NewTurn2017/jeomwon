import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import en from "../../../apps/app/src/locales/en";
import ko from "../../../apps/app/src/locales/ko";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = `${templateRoot}apps/app/src`;

test("Google remains the primary localized login provider", async () => {
  const source = await readFile(
    `${appRoot}/components/google-signin.tsx`,
    "utf8",
  );

  expect(source).toMatch('signInWithProvider("google")');
  expect(source).toMatch('t("signInError")');
  expect(ko.login.google).toBe("Google로 로그인");
  expect(en.login.google).toBe("Sign in with Google");
});

test("a Google user without a username still enters onboarding", async () => {
  const layout = await readFile(
    `${appRoot}/app/[locale]/(dashboard)/(onboarded)/layout.tsx`,
    "utf8",
  );
  const onboarding = await readFile(
    `${appRoot}/app/[locale]/onboarding/page.tsx`,
    "utf8",
  );

  expect(layout).toMatch("needsOnboarding");
  expect(layout).toMatch('redirect("/onboarding")');
  expect(onboarding).toMatch("updateUsername");
});

test("setup keeps Google OAuth and the required operator allowlist", async () => {
  const setup = await readFile(`${templateRoot}scripts/setup/index.ts`, "utf8");
  const google = setup.indexOf("await configureGoogleOAuth(ctx, deployment)");
  const allowlist = setup.indexOf("await configureAdminEmails(ctx)");

  expect(google >= 0).toBe(true);
  expect(allowlist > google).toBe(true);
  expect(setup).toMatch("JEOMWON_ADMIN_EMAILS is required.");
});
