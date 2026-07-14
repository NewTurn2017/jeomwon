import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import en from "../../../apps/app/src/locales/en";
import ko from "../../../apps/app/src/locales/ko";

const appRoot = fileURLToPath(
  new URL("../../../apps/app/src/app/", import.meta.url),
);
const dashboardRoot = `${appRoot}[locale]/(dashboard)`;

test("Korean and English expose matching admin navigation and metadata", () => {
  expect(ko.navigation.admin).toBe("관리자");
  expect(en.navigation.admin).toBe("Admin");
  expect(ko.admin.title.length >= 1).toBe(true);
  expect(ko.admin.description.length >= 1).toBe(true);
  expect(en.admin.title.length >= 1).toBe(true);
  expect(en.admin.description.length >= 1).toBe(true);
});

test("admin bypasses onboarding while root and settings retain their public URLs", async () => {
  const adminPage = `${dashboardRoot}/admin/page.tsx`;
  const adminSource = await readFile(adminPage, "utf8");
  const onboardedLayout = await readFile(
    `${dashboardRoot}/(onboarded)/layout.tsx`,
    "utf8",
  );
  await readFile(`${dashboardRoot}/(onboarded)/page.tsx`, "utf8");
  await readFile(
    `${dashboardRoot}/(onboarded)/settings/page.tsx`,
    "utf8",
  );

  expect(onboardedLayout).toMatch('redirect("/onboarding")');
  expect(adminSource).toMatch("viewerRole");
  expect(adminSource).toMatch("notFound()");
  expect(adminSource.includes("dashboardSnapshot")).toBe(false);
  expect(adminSource.includes("preloadQuery")).toBe(false);
});
