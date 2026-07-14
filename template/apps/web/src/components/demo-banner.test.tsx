import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoBanner } from "./demo-banner";

describe("DemoBanner", () => {
  test("renders the accessible hourly reset notice when enabled", () => {
    // Given / When
    const markup = renderToStaticMarkup(<DemoBanner enabled />);

    // Then
    expect(markup).toMatch('role="status"');
    expect(markup).toMatch('aria-label="데모 안내"');
    expect(markup).toMatch(
      "체험용 데모입니다 · 데이터는 매시간 초기화됩니다",
    );
  });

  test("renders nothing when disabled", () => {
    // Given / When
    const markup = renderToStaticMarkup(<DemoBanner enabled={false} />);

    // Then
    expect(markup).toBe("");
  });
});
