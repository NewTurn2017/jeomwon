import { describe, expect, test } from "bun:test";
import {
  adminLoginRedirectUrl,
  authenticatedLoginRedirectUrl,
  loadViewerRole,
  normalizeReturnTo,
  returnToFromUrl,
} from "../../../apps/app/src/lib/admin-routing";

type RootDashboardSurfacePolicy = (
  viewerRole: "operator" | "customer",
  customerAccountsEnabled: boolean,
) => "operator" | "customer" | "customer-disabled";

function isRootDashboardSurfacePolicy(
  value: unknown,
): value is RootDashboardSurfacePolicy {
  return typeof value === "function";
}

describe("normalizeReturnTo", () => {
  test("allows only the two literal targets", () => {
    const cases: ReadonlyArray<readonly [unknown, "/" | "/admin"]> = [
      ["/", "/"],
      ["/admin", "/admin"],
      ["https://attacker.example/admin", "/"],
      ["//attacker.example/admin", "/"],
      ["/settings", "/"],
      ["/admin?tab=users", "/"],
      ["%2Fadmin", "/"],
      ["%252Fadmin", "/"],
      [" /admin", "/"],
      ["/admin ", "/"],
      [["/admin"], "/"],
      [["/admin", "/"], "/"],
      [undefined, "/"],
      [null, "/"],
    ];

    for (const [input, expected] of cases) {
      expect(normalizeReturnTo(input)).toBe(expected);
    }
  });

  test("accepts one URL-decoded literal admin target", () => {
    expect(
      returnToFromUrl(
        new URL("https://app.example/login?returnTo=%2Fadmin"),
      ),
    ).toBe("/admin");
  });

  test("rejects repeated returnTo parameters as an array-equivalent input", () => {
    expect(
      returnToFromUrl(
        new URL(
          "https://app.example/login?returnTo=%2Fadmin&returnTo=%2F",
        ),
      ),
    ).toBe("/");
  });
});

test("admin login redirect clears the incoming query and serializes exact returnTo", () => {
  const redirect = adminLoginRedirectUrl(
    new URL("https://app.example/admin?untrusted=1"),
  );

  expect(`${redirect.pathname}${redirect.search}`).toBe(
    "/login?returnTo=%2Fadmin",
  );
  expect(redirect.origin).toBe("https://app.example");
});

test("authenticated login redirects to the validated target without login query", () => {
  const adminRedirect = authenticatedLoginRedirectUrl(
    new URL("https://app.example/login?returnTo=%2Fadmin&noise=1"),
  );
  const unsafeRedirect = authenticatedLoginRedirectUrl(
    new URL(
      "https://app.example/login?returnTo=https%3A%2F%2Fattacker.example",
    ),
  );

  expect(`${adminRedirect.pathname}${adminRedirect.search}`).toBe("/admin");
  expect(`${unsafeRedirect.pathname}${unsafeRedirect.search}`).toBe("/");
});

describe("loadViewerRole", () => {
  test("allows only the exact operator role", async () => {
    const cases: ReadonlyArray<
      readonly [unknown, "operator" | "customer"]
    > = [
      ["operator", "operator"],
      ["customer", "customer"],
      [undefined, "customer"],
      [null, "customer"],
      ["unknown", "customer"],
    ];

    for (const [role, expected] of cases) {
      expect(await loadViewerRole(async () => role)).toBe(expected);
    }
  });

  test("fails closed when the role query throws", async () => {
    expect(
      await loadViewerRole(async () => {
        throw new Error("role query failed");
      }),
    ).toBe("customer");
  });
});

test("customer root does not select the operator surface when customer accounts are disabled", async () => {
  // Given
  const routing = await import(
    "../../../apps/app/src/lib/admin-routing"
  );
  const candidate =
    "rootDashboardSurface" in routing
      ? routing.rootDashboardSurface
      : undefined;
  expect(isRootDashboardSurfacePolicy(candidate)).toBe(true);
  if (!isRootDashboardSurfacePolicy(candidate)) {
    throw new Error("root_dashboard_surface_policy_missing");
  }

  // When
  const surface = candidate("customer", false);

  // Then
  expect(surface).toBe("customer-disabled");
});
