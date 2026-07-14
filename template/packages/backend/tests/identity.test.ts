import { describe, expect, test } from "bun:test";
import * as identity from "../convex/engine/identity";

type RoleSubject = {
  readonly email?: string;
  readonly isAnonymous?: boolean;
};

type OperatorRolePolicy = (
  subject: RoleSubject | null | undefined,
  allowlist: readonly string[],
) => boolean;

type ViewerRolePolicy = (
  subject: RoleSubject | null | undefined,
  allowlist: readonly string[],
) => "operator" | "customer";

type AllowlistNormalizer = (raw: string | undefined) => readonly string[];

function isOperatorRolePolicy(value: unknown): value is OperatorRolePolicy {
  return typeof value === "function";
}

function isViewerRolePolicy(value: unknown): value is ViewerRolePolicy {
  return typeof value === "function";
}

function isAllowlistNormalizer(value: unknown): value is AllowlistNormalizer {
  return typeof value === "function";
}

function loadOperatorRolePolicy(): OperatorRolePolicy {
  const candidate =
    "operatorRolePolicy" in identity ? identity.operatorRolePolicy : undefined;
  expect(isOperatorRolePolicy(candidate)).toBe(true);
  if (!isOperatorRolePolicy(candidate)) {
    throw new Error("operator_role_policy_missing");
  }
  return candidate;
}

function loadViewerRolePolicy(): ViewerRolePolicy {
  const candidate =
    "viewerRolePolicy" in identity ? identity.viewerRolePolicy : undefined;
  expect(isViewerRolePolicy(candidate)).toBe(true);
  if (!isViewerRolePolicy(candidate)) {
    throw new Error("viewer_role_policy_missing");
  }
  return candidate;
}

function loadAllowlistNormalizer(): AllowlistNormalizer {
  const candidate =
    "normalizeAdminEmailAllowlist" in identity
      ? identity.normalizeAdminEmailAllowlist
      : undefined;
  expect(isAllowlistNormalizer(candidate)).toBe(true);
  if (!isAllowlistNormalizer(candidate)) {
    throw new Error("admin_allowlist_normalizer_missing");
  }
  return candidate;
}

describe("normalizeAdminEmailAllowlist", () => {
  test("normalizes case and whitespace while removing empty and duplicate entries", () => {
    // Given
    const raw = " Owner@Example.COM, ,staff@example.com,owner@example.com ";

    // When
    const allowlist = loadAllowlistNormalizer()(raw);

    // Then
    expect(allowlist.join(",")).toBe("owner@example.com,staff@example.com");
  });
});

describe("operatorRolePolicy", () => {
  const cases: readonly {
    readonly name: string;
    readonly subject: RoleSubject | null | undefined;
    readonly rawAllowlist: string | undefined;
    readonly expected: boolean;
  }[] = [
    {
      name: "denies a missing identity",
      subject: undefined,
      rawAllowlist: "owner@example.com",
      expected: false,
    },
    {
      name: "denies a null identity",
      subject: null,
      rawAllowlist: "owner@example.com",
      expected: false,
    },
    {
      name: "denies an anonymous identity even when its email matches",
      subject: { email: "owner@example.com", isAnonymous: true },
      rawAllowlist: "owner@example.com",
      expected: false,
    },
    {
      name: "denies when the allowlist is missing",
      subject: { email: "owner@example.com" },
      rawAllowlist: undefined,
      expected: false,
    },
    {
      name: "denies when the allowlist contains only empty entries",
      subject: { email: "owner@example.com", isAnonymous: false },
      rawAllowlist: " ,  ",
      expected: false,
    },
    {
      name: "denies a non-matching email",
      subject: { email: "customer@example.com" },
      rawAllowlist: "owner@example.com",
      expected: false,
    },
    {
      name: "denies an identity without an email",
      subject: { isAnonymous: false },
      rawAllowlist: "owner@example.com",
      expected: false,
    },
    {
      name: "allows only a normalized exact non-anonymous match",
      subject: { email: " Owner@Example.COM ", isAnonymous: false },
      rawAllowlist: " staff@example.com, OWNER@example.com ",
      expected: true,
    },
    {
      name: "allows a matching Google identity when isAnonymous is omitted",
      subject: { email: "owner@example.com" },
      rawAllowlist: "owner@example.com",
      expected: true,
    },
  ];

  for (const scenario of cases) {
    test(scenario.name, () => {
      // Given
      const allowlist = loadAllowlistNormalizer()(scenario.rawAllowlist);

      // When
      const allowed = loadOperatorRolePolicy()(scenario.subject, allowlist);

      // Then
      expect(allowed).toBe(scenario.expected);
    });
  }
});

describe("viewerRolePolicy", () => {
  test("returns customer when the operator allowlist is empty", () => {
    // Given
    const subject = { email: "owner@example.com", isAnonymous: false };
    const allowlist = loadAllowlistNormalizer()(undefined);

    // When
    const role = loadViewerRolePolicy()(subject, allowlist);

    // Then
    expect(role).toBe("customer");
  });
});
