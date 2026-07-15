import { describe, expect, test } from "bun:test";
import { classifyQaManualRouteResponse } from "../packages/backend/src/qa-browser-contract";

describe("QA manual redirect contract", () => {
  test("Given browser Fetch reports opaqueredirect status zero, When classified, Then redirect denial is explicit", () => {
    expect(
      classifyQaManualRouteResponse({ status: 0, type: "opaqueredirect" }),
    ).toEqual({ kind: "redirect" });
  });

  test("Given ordinary status zero without opaqueredirect, When classified, Then it is not fabricated as a redirect", () => {
    expect(classifyQaManualRouteResponse({ status: 0, type: "basic" })).toEqual(
      { kind: "response", status: 0 },
    );
  });

  test("Given an observable 3xx manual response, When classified, Then redirect denial remains explicit", () => {
    expect(
      classifyQaManualRouteResponse({ status: 302, type: "basic" }),
    ).toEqual({ kind: "redirect" });
  });
});
