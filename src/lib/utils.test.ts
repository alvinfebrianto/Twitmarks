import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins multiple class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("filters out falsy values", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar");
  });

  it("handles a single string", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("returns empty string when all values are falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("returns empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("handles ternary patterns used in components", () => {
    const isActive = true;
    expect(cn("base-class", isActive ? "active-class" : "inactive-class")).toBe(
      "base-class active-class"
    );
  });

  it("handles conditional && patterns", () => {
    const isFirst = true;
    expect(
      cn("flex items-center", isFirst && "pointer-events-none opacity-30")
    ).toBe("flex items-center pointer-events-none opacity-30");
  });
});
