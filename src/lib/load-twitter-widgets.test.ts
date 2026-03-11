// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("loadTwitterWidgets", () => {
  it("exports a function", async () => {
    const { loadTwitterWidgets } = await import("./load-twitter-widgets");
    expect(typeof loadTwitterWidgets).toBe("function");
  });

  it("resolves immediately in non-browser environment", async () => {
    const { loadTwitterWidgets } = await import("./load-twitter-widgets");
    await expect(loadTwitterWidgets()).resolves.toBeUndefined();
  });
});
