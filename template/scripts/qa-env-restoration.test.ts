import { expect, test } from "bun:test";
import { configureTemporaryConvexEnvironment } from "./qa-convex-env-lifecycle";
import { restoreConvexEnvironment } from "./qa-runtime-contract";

test("temporary Convex environment restoration preserves exact prior bytes", () => {
  const writes: string[][] = [];
  const configured = configureTemporaryConvexEnvironment(
    ["JEOMWON_QA_RESET"],
    { JEOMWON_QA_RESET: "1" },
    (args) => {
      if (args[0] === "get") return { status: 0, stdout: "  prior value  \n" };
      return { status: 0 };
    },
  );

  const failures = restoreConvexEnvironment(
    configured.configuredNames,
    configured.previousValues,
    (args) => {
      writes.push([...args]);
      return { status: 0 };
    },
  );

  expect(failures).toEqual([]);
  expect(writes).toEqual([
    ["set", "--", "JEOMWON_QA_RESET", "  prior value  "],
  ]);
});
