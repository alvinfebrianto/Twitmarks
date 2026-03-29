import { vi } from "vitest";

interface MockDbOptions {
  changes?: number;
  firstResult?: unknown;
  firstResults?: unknown[];
  lastRowId?: number;
  missingTables?: Array<"admin_sessions" | "rate_limits">;
  results?: unknown[];
}

interface SessionRow {
  createdAt: number;
  expiresAt: number;
}

interface RateLimitRow {
  count: number;
  createdAt: number;
}

type MockTableName = "admin_sessions" | "rate_limits";

function handleAdminSessionRun(
  args: unknown[],
  sessions: Map<string, SessionRow>
) {
  const [tokenHash, expiresAt, createdAt] = args as [string, number, number?];
  sessions.set(tokenHash, {
    createdAt: createdAt ?? Math.floor(Date.now() / 1000),
    expiresAt,
  });

  return { meta: { changes: 1, last_row_id: 0 } };
}

function handleRateLimitRun(
  args: unknown[],
  rateLimits: Map<string, RateLimitRow>
) {
  const [scope, keyHash, windowStart, createdAt] = args as [
    string,
    string,
    number,
    number?,
  ];
  const key = `${scope}:${keyHash}:${windowStart}`;
  const existing = rateLimits.get(key);
  rateLimits.set(key, {
    count: (existing?.count ?? 0) + 1,
    createdAt: createdAt ?? Math.floor(Date.now() / 1000),
  });

  return { meta: { changes: 1, last_row_id: 0 } };
}

function handleAdminSessionFirst(
  args: unknown[],
  sessions: Map<string, SessionRow>
) {
  const [tokenHash, now] = args as [string, number];
  const row = sessions.get(tokenHash);

  return row && row.expiresAt > now ? { token_hash: tokenHash } : null;
}

function handleRateLimitFirst(
  args: unknown[],
  rateLimits: Map<string, RateLimitRow>
) {
  const [scope, keyHash, windowStart] = args as [string, string, number];

  return rateLimits.get(`${scope}:${keyHash}:${windowStart}`)
    ? { count: rateLimits.get(`${scope}:${keyHash}:${windowStart}`)?.count }
    : null;
}

function handleAdminSessionDelete(
  args: unknown[],
  sessions: Map<string, SessionRow>
) {
  const [tokenHash] = args as [string];
  const deleted = sessions.delete(tokenHash);

  return { meta: { changes: deleted ? 1 : 0, last_row_id: 0 } };
}

function handleRateLimitDelete(
  args: unknown[],
  rateLimits: Map<string, RateLimitRow>
) {
  const [cutoff] = args as [number];

  for (const [key, row] of rateLimits.entries()) {
    if (row.createdAt < cutoff) {
      rateLimits.delete(key);
    }
  }

  return { meta: { changes: 0, last_row_id: 0 } };
}

function defaultRunResult(options: MockDbOptions) {
  return {
    meta: {
      last_row_id: options.lastRowId ?? 1,
      changes: options.changes ?? 1,
    },
  };
}

export function createMockDB(options: MockDbOptions = {}) {
  const firstResults = [...(options.firstResults ?? [])];
  let hasSearchTextColumn = true;
  let hasAdminSessionsTable = !(options.missingTables ?? []).includes(
    "admin_sessions"
  );
  let hasRateLimitsTable = !(options.missingTables ?? []).includes(
    "rate_limits"
  );
  const sessions = new Map<string, SessionRow>();
  const rateLimits = new Map<string, RateLimitRow>();

  function throwMissingTable(tableName: MockTableName): never {
    throw new Error(`no such table: ${tableName}`);
  }

  function emptyRunResult() {
    return { meta: { changes: 0, last_row_id: 0 } };
  }

  function requireTable(tableName: MockTableName) {
    if (tableName === "admin_sessions") {
      if (!hasAdminSessionsTable) {
        throwMissingTable(tableName);
      }

      return;
    }

    if (!hasRateLimitsTable) {
      throwMissingTable(tableName);
    }
  }

  function handleSchemaRun(sql: string) {
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS admin_sessions")) {
      hasAdminSessionsTable = true;
      return emptyRunResult();
    }

    if (sql.startsWith("CREATE TABLE IF NOT EXISTS rate_limits")) {
      hasRateLimitsTable = true;
      return emptyRunResult();
    }

    if (sql.startsWith("CREATE INDEX IF NOT EXISTS idx_admin_sessions")) {
      requireTable("admin_sessions");
      return emptyRunResult();
    }

    if (sql.startsWith("CREATE INDEX IF NOT EXISTS idx_rate_limits")) {
      requireTable("rate_limits");
      return emptyRunResult();
    }

    if (sql === "ALTER TABLE tweets ADD COLUMN search_text TEXT") {
      hasSearchTextColumn = true;
      return emptyRunResult();
    }

    return null;
  }

  function handleAdminSessionMutation(sql: string, args: unknown[]) {
    if (
      sql.includes("INSERT INTO admin_sessions") ||
      sql.includes("INSERT OR REPLACE INTO admin_sessions")
    ) {
      requireTable("admin_sessions");
      return handleAdminSessionRun(args, sessions);
    }

    if (sql.includes("DELETE FROM admin_sessions")) {
      requireTable("admin_sessions");
      return handleAdminSessionDelete(args, sessions);
    }

    return null;
  }

  function handleRateLimitMutation(sql: string, args: unknown[]) {
    if (sql.includes("DELETE FROM rate_limits")) {
      requireTable("rate_limits");
      return handleRateLimitDelete(args, rateLimits);
    }

    if (sql.includes("INSERT INTO rate_limits")) {
      requireTable("rate_limits");
      return handleRateLimitRun(args, rateLimits);
    }

    return null;
  }

  function statement(sql: string, args: unknown[] = []) {
    return {
      bind: (...boundArgs: unknown[]) => statement(sql, boundArgs),
      run: vi.fn(() => Promise.resolve(handleRun(sql, args))),
      first: vi.fn(() => Promise.resolve(handleFirst(sql, args))),
      all: vi.fn(() => Promise.resolve(handleAll(sql))),
    };
  }

  function handleRun(sql: string, args: unknown[]) {
    const schemaRun = handleSchemaRun(sql);
    if (schemaRun) {
      return schemaRun;
    }

    const adminSessionMutation = handleAdminSessionMutation(sql, args);
    if (adminSessionMutation) {
      return adminSessionMutation;
    }

    const rateLimitMutation = handleRateLimitMutation(sql, args);
    if (rateLimitMutation) {
      return rateLimitMutation;
    }

    return defaultRunResult(options);
  }

  function handleFirst(sql: string, args: unknown[]) {
    if (sql.includes("FROM admin_sessions")) {
      if (!hasAdminSessionsTable) {
        throwMissingTable("admin_sessions");
      }

      return handleAdminSessionFirst(args, sessions);
    }

    if (sql.includes("FROM rate_limits")) {
      if (!hasRateLimitsTable) {
        throwMissingTable("rate_limits");
      }

      return handleRateLimitFirst(args, rateLimits);
    }

    return firstResults.length > 0
      ? (firstResults.shift() ?? null)
      : (options.firstResult ?? null);
  }

  function handleAll(sql: string) {
    if (sql === "PRAGMA table_info(tweets)") {
      return {
        results: hasSearchTextColumn
          ? [{ name: "id" }, { name: "embed_html" }, { name: "search_text" }]
          : [{ name: "id" }, { name: "embed_html" }],
      };
    }

    return { results: options.results ?? [] };
  }

  return {
    prepare: vi.fn((sql: string) => statement(sql)),
    batch: vi.fn().mockResolvedValue([]),
    state: {
      sessions,
      rateLimits,
      setHasSearchTextColumn(value: boolean) {
        hasSearchTextColumn = value;
      },
      setHasAdminSessionsTable(value: boolean) {
        hasAdminSessionsTable = value;
      },
      setHasRateLimitsTable(value: boolean) {
        hasRateLimitsTable = value;
      },
    },
  };
}

export function createLocals(
  overrides: { adminSecret?: string; db?: unknown } = {}
) {
  return {
    runtime: {
      env: {
        ADMIN_SECRET: overrides.adminSecret ?? "test-secret",
        ASSETS: {},
        DB: overrides.db ?? createMockDB(),
      },
    },
  } as unknown as App.Locals;
}
