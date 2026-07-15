import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoBanner } from "./demo-banner";

describe("DemoBanner", () => {
  test("renders an accessible hourly-reset status when enabled", () => {
    // Given / When
    const markup = renderToStaticMarkup(<DemoBanner enabled />);

    // Then
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-demo-banner="hourly-reset"');
  });

  test("renders nothing when disabled", () => {
    // Given / When
    const markup = renderToStaticMarkup(<DemoBanner enabled={false} />);

    // Then
    expect(markup).toBe("");
  });
});
