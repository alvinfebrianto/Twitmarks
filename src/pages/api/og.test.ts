// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocals, createMockDB } from "../../test/mock-db";
import { GET } from "./og";

function createContext(query: string, db = createMockDB()) {
  const url = new URL(`http://localhost/api/og${query}`);
  return {
    url,
    request: new Request(url, {
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    }),
    locals: createLocals({ db }),
  };
}

function mockDnsAndFetch(options: {
  dns?: Record<string, string[]>;
  responses?: Record<string, Response>;
}) {
  const dns = options.dns ?? { "example.com": ["93.184.216.34"] };
  const responses = options.responses ?? {};

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const requestUrl =
        input instanceof URL ? input.toString() : String(input);

      if (requestUrl.startsWith("https://cloudflare-dns.com/dns-query")) {
        const dnsUrl = new URL(requestUrl);
        const hostname = dnsUrl.searchParams.get("name") ?? "";
        const answers = (dns[hostname] ?? []).map((data) => ({ data }));
        return Response.json({ Answer: answers });
      }

      const response = responses[requestUrl];
      if (!response) {
        throw new Error(`Unexpected fetch URL in test: ${requestUrl}`);
      }

      return response.clone();
    })
  );
}

function redirect(location: string, status = 302) {
  return new Response(null, { headers: { Location: location }, status });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/og", () => {
  it("rejects missing url param", async () => {
    const response = await GET(createContext("") as never);

    expect(response.status).toBe(400);
  });

  it("rejects localhost, IP literals, and credentialed URLs", async () => {
    await expect(
      GET(createContext("?url=http://localhost/secret") as never)
    ).resolves.toHaveProperty("status", 400);
    await expect(
      GET(createContext("?url=http://127.0.0.1/admin") as never)
    ).resolves.toHaveProperty("status", 400);
    await expect(
      GET(createContext("?url=http://user:pass@example.com") as never)
    ).resolves.toHaveProperty("status", 400);
  });

  it("rejects hostnames that resolve to private IP ranges", async () => {
    mockDnsAndFetch({ dns: { "example.com": ["10.0.0.12"] } });

    const response = await GET(
      createContext("?url=https://example.com/article") as never
    );

    expect(response.status).toBe(400);
  });

  it("fetches OG metadata for a public hostname", async () => {
    mockDnsAndFetch({
      responses: {
        "https://example.com/page": new Response(
          '<meta property="og:title" content="Test"><meta property="og:image" content="/cover.png">',
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }
        ),
      },
    });

    const response = await GET(
      createContext("?url=https://example.com/page") as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      domain: "example.com",
      image: "https://example.com/cover.png",
      title: "Test",
    });
  });

  it("uses manual redirect handling and follows safe redirects", async () => {
    mockDnsAndFetch({
      dns: {
        "example.com": ["93.184.216.34"],
        "www.example.com": ["93.184.216.35"],
      },
      responses: {
        "https://example.com/start": redirect("https://www.example.com/final"),
        "https://www.example.com/final": new Response(
          '<meta property="og:title" content="Redirected">',
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }
        ),
      },
    });

    const response = await GET(
      createContext("?url=https://example.com/start") as never
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirect: "manual" })
    );
    await expect(response.json()).resolves.toMatchObject({
      title: "Redirected",
    });
  });

  it("blocks redirects to hostnames that resolve to private IPs", async () => {
    mockDnsAndFetch({
      dns: {
        "example.com": ["93.184.216.34"],
        "internal.example.com": ["192.168.0.10"],
      },
      responses: {
        "https://example.com/start": redirect(
          "https://internal.example.com/private"
        ),
      },
    });

    const response = await GET(
      createContext("?url=https://example.com/start") as never
    );

    expect(response.status).toBe(400);
  });

  it("rejects non-HTML upstream responses", async () => {
    mockDnsAndFetch({
      responses: {
        "https://example.com/api": new Response('{"ok":true}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const response = await GET(
      createContext("?url=https://example.com/api") as never
    );

    expect(response.status).toBe(502);
  });

  it("rate limits repeated OG requests from the same IP", async () => {
    mockDnsAndFetch({
      responses: {
        "https://example.com/page": new Response(
          '<meta property="og:title" content="Test">',
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }
        ),
      },
    });

    const db = createMockDB();

    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await GET(
        createContext("?url=https://example.com/page", db) as never
      );
      expect(response.status).toBe(200);
    }

    const limited = await GET(
      createContext("?url=https://example.com/page", db) as never
    );

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});
