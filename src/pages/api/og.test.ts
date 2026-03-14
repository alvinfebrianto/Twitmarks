// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { GET } from "./og";

function createRequest(query: string): { url: URL } {
  return { url: new URL(`http://localhost/api/og${query}`) };
}

function mockFetchHtml(html: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    )
  );
}

describe("GET /api/og", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("URL validation (SSRF prevention)", () => {
    it("rejects missing url param", async () => {
      const res = await GET(createRequest("") as never);
      expect(res.status).toBe(400);
    });

    it("rejects non-http(s) protocols", async () => {
      const res = await GET(createRequest("?url=ftp://example.com") as never);
      expect(res.status).toBe(400);
    });

    it("rejects localhost", async () => {
      const res = await GET(
        createRequest("?url=http://localhost/secret") as never
      );
      expect(res.status).toBe(400);
    });

    it("rejects IPv4 literals", async () => {
      const res = await GET(
        createRequest("?url=http://127.0.0.1/admin") as never
      );
      expect(res.status).toBe(400);
    });

    it("rejects private IPv4 ranges", async () => {
      const res = await GET(
        createRequest("?url=http://192.168.1.1/admin") as never
      );
      expect(res.status).toBe(400);
    });

    it("rejects cloud metadata IP", async () => {
      const res = await GET(
        createRequest("?url=http://169.254.169.254/latest/meta-data/") as never
      );
      expect(res.status).toBe(400);
    });

    it("rejects IPv6 literals", async () => {
      const res = await GET(createRequest("?url=http://[::1]/secret") as never);
      expect(res.status).toBe(400);
    });

    it("rejects .local domains", async () => {
      const res = await GET(
        createRequest("?url=http://internal.local/secret") as never
      );
      expect(res.status).toBe(400);
    });

    it("rejects URLs with credentials", async () => {
      const res = await GET(
        createRequest("?url=http://user:pass@example.com") as never
      );
      expect(res.status).toBe(400);
    });

    it("accepts valid https URL", async () => {
      mockFetchHtml('<meta property="og:title" content="Test">');
      const res = await GET(
        createRequest("?url=https://example.com/page") as never
      );
      expect(res.status).toBe(200);
    });
  });

  describe("extractMeta (apostrophe handling)", () => {
    it("handles apostrophes in double-quoted content", async () => {
      mockFetchHtml('<meta property="og:title" content="It\'s complicated">');
      const res = await GET(createRequest("?url=https://example.com") as never);
      const data = await res.json();
      expect(data.title).toBe("It's complicated");
    });

    it("handles double quotes in single-quoted content", async () => {
      mockFetchHtml("<meta property='og:title' content='He said \"hello\"'>");
      const res = await GET(createRequest("?url=https://example.com") as never);
      const data = await res.json();
      expect(data.title).toBe('He said "hello"');
    });

    it("extracts content when attribute order is reversed", async () => {
      mockFetchHtml('<meta content="Reversed Title" property="og:title">');
      const res = await GET(createRequest("?url=https://example.com") as never);
      const data = await res.json();
      expect(data.title).toBe("Reversed Title");
    });

    it("falls back to twitter meta tags", async () => {
      mockFetchHtml('<meta name="twitter:title" content="Twitter Title">');
      const res = await GET(createRequest("?url=https://example.com") as never);
      const data = await res.json();
      expect(data.title).toBe("Twitter Title");
    });

    it("decodes HTML entities in content", async () => {
      mockFetchHtml('<meta property="og:title" content="A &amp; B &lt;3">');
      const res = await GET(createRequest("?url=https://example.com") as never);
      const data = await res.json();
      expect(data.title).toBe("A & B <3");
    });

    it("extracts domain without www prefix", async () => {
      mockFetchHtml('<meta property="og:title" content="Test">');
      const res = await GET(
        createRequest("?url=https://www.example.com/page") as never
      );
      const data = await res.json();
      expect(data.domain).toBe("example.com");
    });
  });
});
