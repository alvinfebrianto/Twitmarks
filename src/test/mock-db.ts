import { vi } from "vitest";

interface MockDbOptions {
  changes?: number;
  firstResult?: unknown;
  firstResults?: unknown[];
  lastRowId?: number;
  missingTables?: Array<
    "admin_secret_config" | "admin_sessions" | "rate_limits"
  >;
  results?: unknown[];
}

interface AdminSecretRow {
  secretHash: string;
  updatedAt: number;
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
type MockConfigTableName = "admin_secret_config";

interface MockStatement {
  __args: unknown[];
  __sql: string;
  all: ReturnType<typeof vi.fn>;
  bind: (...boundArgs: unknown[]) => MockStatement;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

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

function handleAdminSecretRun(args: unknown[]) {
  const [, secretHash, updatedAt] = args as [number, string, number?];

  return {
    secret: {
      secretHash,
      updatedAt: updatedAt ?? Math.floor(Date.now() / 1000),
    },
    result: { meta: { changes: 1, last_row_id: 1 } },
  };
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
  let hasTweetJsonColumn = true;
  let hasAdminSecretConfigTable = !(options.missingTables ?? []).includes(
    "admin_secret_config"
  );
  let hasAdminSessionsTable = !(options.missingTables ?? []).includes(
    "admin_sessions"
  );
  let hasRateLimitsTable = !(options.missingTables ?? []).includes(
    "rate_limits"
  );
  let adminSecret: AdminSecretRow | null = null;
  const sessions = new Map<string, SessionRow>();
  const rateLimits = new Map<string, RateLimitRow>();

  function throwMissingTable(
    tableName: MockConfigTableName | MockTableName
  ): never {
    throw new Error(`no such table: ${tableName}`);
  }

  function emptyRunResult() {
    return { meta: { changes: 0, last_row_id: 0 } };
  }

  function requireTable(tableName: MockConfigTableName | MockTableName) {
    if (tableName === "admin_secret_config") {
      if (!hasAdminSecretConfigTable) {
        throwMissingTable(tableName);
      }

      return;
    }

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
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS admin_secret_config")) {
      hasAdminSecretConfigTable = true;
      return emptyRunResult();
    }

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

    if (sql === "ALTER TABLE tweets ADD COLUMN tweet_json TEXT") {
      hasTweetJsonColumn = true;
      return emptyRunResult();
    }

    return null;
  }

  function handleAdminSecretMutation(sql: string, args: unknown[]) {
    if (sql.includes("INSERT OR REPLACE INTO admin_secret_config")) {
      requireTable("admin_secret_config");
      const { result, secret } = handleAdminSecretRun(args);
      adminSecret = secret;
      return result;
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

  function statement(sql: string, args: unknown[] = []): MockStatement {
    return {
      __args: args,
      __sql: sql,
      bind: (...boundArgs: unknown[]) => statement(sql, boundArgs),
      run: vi.fn(() => Promise.resolve(handleRun(sql, args))),
      first: vi.fn(() => Promise.resolve(handleFirst(sql, args))),
      all: vi.fn(() => Promise.resolve(handleAll(sql))),
    };
  }

  function handleBatch(statements: MockStatement[]) {
    return statements.map((stmt) => {
      if (stmt.__sql === "PRAGMA table_info(tweets)") {
        return {
          meta: { changes: 0, last_row_id: 0 },
          results: handleAll(stmt.__sql).results,
        };
      }

      if (stmt.__sql.startsWith("SELECT ")) {
        const row = handleFirst(stmt.__sql, stmt.__args);
        return {
          meta: { changes: 0, last_row_id: 0 },
          results: row ? [row] : [],
        };
      }

      return {
        ...handleRun(stmt.__sql, stmt.__args),
        results: [],
      };
    });
  }

  function handleRun(sql: string, args: unknown[]) {
    const schemaRun = handleSchemaRun(sql);
    if (schemaRun) {
      return schemaRun;
    }

    const adminSecretMutation = handleAdminSecretMutation(sql, args);
    if (adminSecretMutation) {
      return adminSecretMutation;
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
    if (sql.includes("FROM admin_secret_config")) {
      requireTable("admin_secret_config");

      return adminSecret ? { secret_hash: adminSecret.secretHash } : null;
    }

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
        results: [
          { name: "id" },
          { name: "embed_html" },
          ...(hasSearchTextColumn ? [{ name: "search_text" }] : []),
          ...(hasTweetJsonColumn ? [{ name: "tweet_json" }] : []),
        ],
      };
    }

    return { results: options.results ?? [] };
  }

  return {
    prepare: vi.fn((sql: string) => statement(sql)),
    batch: vi.fn((statements: MockStatement[]) =>
      Promise.resolve(handleBatch(statements))
    ),
    state: {
      sessions,
      rateLimits,
      setHasSearchTextColumn(value: boolean) {
        hasSearchTextColumn = value;
      },
      setHasTweetJsonColumn(value: boolean) {
        hasTweetJsonColumn = value;
      },
      setAdminSecretHash(value: string | null) {
        adminSecret = value
          ? {
              secretHash: value,
              updatedAt: Math.floor(Date.now() / 1000),
            }
          : null;
      },
      setHasAdminSecretConfigTable(value: boolean) {
        hasAdminSecretConfigTable = value;
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
  overrides: {
    adminSecret?: string;
    db?: unknown;
    ctx?: { waitUntil(promise: Promise<unknown>): void };
  } = {}
) {
  return {
    runtime: {
      ctx: overrides.ctx,
      env: {
        ADMIN_SECRET: overrides.adminSecret ?? "test-secret",
        ASSETS: {},
        DB: overrides.db ?? createMockDB(),
      },
    },
  } as unknown as App.Locals;
}
