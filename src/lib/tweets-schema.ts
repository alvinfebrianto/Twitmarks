import type { Database } from "./db";

const TWEETS_TABLE_INFO_SQL = "PRAGMA table_info(tweets)";
const ADD_SEARCH_TEXT_COLUMN_SQL =
  "ALTER TABLE tweets ADD COLUMN search_text TEXT";
const ADD_TWEET_JSON_COLUMN_SQL =
  "ALTER TABLE tweets ADD COLUMN tweet_json TEXT";
const SEARCH_TEXT_COLUMN_NAME = "search_text";
const TWEET_JSON_COLUMN_NAME = "tweet_json";
const CREATE_ADMIN_SESSIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`;
const CREATE_ADMIN_SESSIONS_EXPIRES_AT_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
  ON admin_sessions(expires_at)`;
const CREATE_RATE_LIMITS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
)`;
const CREATE_RATE_LIMITS_CREATED_AT_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at
  ON rate_limits(created_at)`;

const tweetsSearchTextEnsures = new WeakMap<Database, Promise<void>>();
const adminSessionSchemaEnsures = new WeakMap<Database, Promise<void>>();
const rateLimitSchemaEnsures = new WeakMap<Database, Promise<void>>();

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "";
}

export async function ensureTweetsSearchTextColumn(
  db: Database
): Promise<void> {
  const pendingEnsure = tweetsSearchTextEnsures.get(db);
  if (pendingEnsure) {
    await pendingEnsure;
    return;
  }

  const ensurePromise = (async () => {
    const tableInfo = await db
      .prepare(TWEETS_TABLE_INFO_SQL)
      .all<{ name: string }>();
    const columns = tableInfo.results ?? [];
    const hasSearchTextColumn = columns.some(
      (column: { name: string }) => column.name === SEARCH_TEXT_COLUMN_NAME
    );
    const hasTweetJsonColumn = columns.some(
      (column: { name: string }) => column.name === TWEET_JSON_COLUMN_NAME
    );

    if (!hasSearchTextColumn) {
      try {
        await db.prepare(ADD_SEARCH_TEXT_COLUMN_SQL).run();
      } catch (error) {
        const message = getErrorMessage(error).toLowerCase();
        if (!message.includes("duplicate column name: search_text")) {
          throw error;
        }
      }
    }

    if (!hasTweetJsonColumn) {
      try {
        await db.prepare(ADD_TWEET_JSON_COLUMN_SQL).run();
      } catch (error) {
        const message = getErrorMessage(error).toLowerCase();
        if (!message.includes("duplicate column name: tweet_json")) {
          throw error;
        }
      }
    }
  })().catch((error) => {
    tweetsSearchTextEnsures.delete(db);
    throw error;
  });

  tweetsSearchTextEnsures.set(db, ensurePromise);
  await ensurePromise;
}

export async function ensureAdminSessionsSchema(db: Database): Promise<void> {
  const pendingEnsure = adminSessionSchemaEnsures.get(db);
  if (pendingEnsure) {
    await pendingEnsure;
    return;
  }

  const ensurePromise = (async () => {
    await db.prepare(CREATE_ADMIN_SESSIONS_TABLE_SQL).run();
    await db.prepare(CREATE_ADMIN_SESSIONS_EXPIRES_AT_INDEX_SQL).run();
  })().catch((error) => {
    adminSessionSchemaEnsures.delete(db);
    throw error;
  });

  adminSessionSchemaEnsures.set(db, ensurePromise);
  await ensurePromise;
}

export async function ensureRateLimitsSchema(db: Database): Promise<void> {
  const pendingEnsure = rateLimitSchemaEnsures.get(db);
  if (pendingEnsure) {
    await pendingEnsure;
    return;
  }

  const ensurePromise = (async () => {
    await db.prepare(CREATE_RATE_LIMITS_TABLE_SQL).run();
    await db.prepare(CREATE_RATE_LIMITS_CREATED_AT_INDEX_SQL).run();
  })().catch((error) => {
    rateLimitSchemaEnsures.delete(db);
    throw error;
  });

  rateLimitSchemaEnsures.set(db, ensurePromise);
  await ensurePromise;
}

export async function ensureDatabaseSchema(db: Database): Promise<void> {
  await ensureAdminSessionsSchema(db);
  await ensureRateLimitsSchema(db);
  await ensureTweetsSearchTextColumn(db);
}
