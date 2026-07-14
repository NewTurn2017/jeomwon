import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  anonymousLoginAvailable,
  needsOnboarding,
} from "../../../apps/app/src/lib/anonymous-login";
import en from "../../../apps/app/src/locales/en";
import ko from "../../../apps/app/src/locales/ko";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = `${templateRoot}apps/app/src`;

test("the app exposes anonymous login only for the exact feature and app flag", () => {
  expect(anonymousLoginAvailable({ customerAccounts: true, appEnv: "1" })).toBe(
    true,
  );

  for (const customerAccounts of [false]) {
    expect(anonymousLoginAvailable({ customerAccounts, appEnv: "1" })).toBe(
      false,
    );
  }
  for (const appEnv of [undefined, "", "0", "true", " 1", "1 "]) {
    expect(anonymousLoginAvailable({ customerAccounts: true, appEnv })).toBe(
      false,
    );
  }
});

test("anonymous users bypass onboarding while Google users retain username onboarding", () => {
  expect(needsOnboarding(undefined)).toBe(true);
  expect(needsOnboarding({ isAnonymous: true })).toBe(false);
  expect(needsOnboarding({ isAnonymous: true, username: undefined })).toBe(
    false,
  );
  expect(needsOnboarding({ isAnonymous: false, username: undefined })).toBe(
    true,
  );
  expect(needsOnboarding({ isAnonymous: false, username: "owner" })).toBe(
    false,
  );
});

test("login UI uses product copy and a localized configuration failure", async () => {
  const page = await readFile(
    `${appRoot}/app/[locale]/(public)/login/page.tsx`,
    "utf8",
  );
  const component = await readFile(
    `${appRoot}/components/google-signin.tsx`,
    "utf8",
  );

  expect(page).toMatch("anonymousLoginAvailable");
  expect(page).toMatch("process.env.AUTH_ANONYMOUS_LOGIN");
  expect(page.includes("AUTH_DEV_ANONYMOUS")).toBe(false);
  expect(component).toMatch("anonymousLoginEnabled");
  expect(component).toMatch('t("anonymousConfigError")');

  expect(ko.login.anonymous).toBe("비회원으로 시작");
  expect(ko.login.anonymousContinuityWarning).toBe(
    "이 브라우저의 로그인 정보가 사라지면 이전 예약에 다시 접근할 수 없습니다. 계속 이용하려면 Google 로그인을 사용하세요.",
  );
  expect(en.login.anonymous).toBe("Continue as a guest");
  expect(en.login.anonymousContinuityWarning.length > 0).toBe(true);
  expect(ko.login.anonymousConfigError.length > 0).toBe(true);
  expect(en.login.anonymousConfigError.length > 0).toBe(true);
});

test("setup metadata and app docs use only the synchronized product flag", async () => {
  const setup = await readFile(`${templateRoot}scripts/setup/index.ts`, "utf8");
  const setupConfig = await readFile(
    `${templateRoot}setup-config.json`,
    "utf8",
  );
  const appEnv = await readFile(`${templateRoot}apps/app/.env.example`, "utf8");
  const appReadme = await readFile(`${templateRoot}apps/app/README.md`, "utf8");
  const productFiles = [setup, setupConfig, appEnv, appReadme];

  for (const source of productFiles) {
    expect(source.includes("AUTH_DEV_ANONYMOUS")).toBe(false);
  }
  expect(setupConfig).toMatch('"id": "anonymous-login"');
  expect(setupConfig).toMatch('"name": "AUTH_ANONYMOUS_LOGIN"');
  expect(appEnv).toMatch("AUTH_ANONYMOUS_LOGIN=");
  expect(appReadme).toMatch("AUTH_ANONYMOUS_LOGIN");

  expect(setupConfig.indexOf('"id": "admin-emails"')).toBeLessThan(
    setupConfig.indexOf('"id": "anonymous-login"'),
  );

  const allowlist = setup.indexOf("await configureAdminEmails(ctx)");
  const anonymous = setup.indexOf("await configureAnonymousLogin(");
  expect(allowlist >= 0).toBe(true);
  expect(anonymous > allowlist).toBe(true);
});
