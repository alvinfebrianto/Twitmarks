import { describe, expect, it } from "vitest";
import { clearSelection, toggleSelectId } from "./tweet-selection";

describe("toggleSelectId", () => {
  it("adds id when not in set", () => {
    const result = toggleSelectId(new Set(), 1);
    expect(result.has(1)).toBe(true);
  });

  it("removes id when already in set", () => {
    const result = toggleSelectId(new Set([1]), 1);
    expect(result.has(1)).toBe(false);
  });

  it("does not mutate the original set", () => {
    const original = new Set([1]);
    toggleSelectId(original, 2);
    expect(original.has(2)).toBe(false);
  });

  it("preserves other ids when adding", () => {
    const result = toggleSelectId(new Set([1, 2]), 3);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.has(3)).toBe(true);
  });

  it("preserves other ids when removing", () => {
    const result = toggleSelectId(new Set([1, 2, 3]), 2);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(false);
    expect(result.has(3)).toBe(true);
  });
});

describe("clearSelection", () => {
  it("returns an empty set", () => {
    expect(clearSelection().size).toBe(0);
  });
});
