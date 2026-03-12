import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadTwitterWidgets (browser)", () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let createdScripts: HTMLScriptElement[];

  beforeEach(() => {
    vi.resetModules();
    createdScripts = [];
    (window as Record<string, unknown>).twttr = undefined;

    appendChildSpy = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation((node) => {
        createdScripts.push(node as HTMLScriptElement);
        return node;
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function getLoader() {
    const mod = await import("./load-twitter-widgets");
    return mod.loadTwitterWidgets;
  }

  it("resolves immediately when window.twttr.widgets.load exists", async () => {
    (window as Record<string, unknown>).twttr = {
      widgets: { load: vi.fn() },
    };
    const loadTwitterWidgets = await getLoader();
    await expect(loadTwitterWidgets()).resolves.toBeUndefined();
    expect(appendChildSpy).not.toHaveBeenCalled();
  });

  it("appends a script tag and resolves on load", async () => {
    const loadTwitterWidgets = await getLoader();
    const promise = loadTwitterWidgets();

    expect(createdScripts).toHaveLength(1);
    const script = createdScripts[0];
    expect(script?.src).toContain("platform.twitter.com/widgets.js");
    expect(script?.async).toBe(true);

    script?.onload?.(new Event("load"));
    await expect(promise).resolves.toBeUndefined();
  });

  it("deduplicates concurrent calls", async () => {
    const loadTwitterWidgets = await getLoader();
    const p1 = loadTwitterWidgets();
    const p2 = loadTwitterWidgets();

    expect(createdScripts).toHaveLength(1);
    createdScripts[0]?.onload?.(new Event("load"));

    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
  });

  it("rejects on script error and allows retry", async () => {
    const loadTwitterWidgets = await getLoader();
    const p1 = loadTwitterWidgets();

    createdScripts[0]?.onerror?.("error");
    await expect(p1).rejects.toThrow("Failed to load widgets.js");

    const p2 = loadTwitterWidgets();
    expect(createdScripts).toHaveLength(2);

    createdScripts[1]?.onload?.(new Event("load"));
    await expect(p2).resolves.toBeUndefined();
  });
});
