import type { Database } from "./db";

const TWEETS_TABLE_INFO_SQL = "PRAGMA table_info(tweets)";
const ADD_SEARCH_TEXT_COLUMN_SQL =
  "ALTER TABLE tweets ADD COLUMN search_text TEXT";
const SEARCH_TEXT_COLUMN_NAME = "search_text";
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

const schemaEnsures = new WeakMap<Database, Promise<void>>();

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
  const tableInfo = await db
    .prepare(TWEETS_TABLE_INFO_SQL)
    .all<{ name: string }>();
  const columns = tableInfo.results ?? [];
  const hasSearchTextColumn = columns.some(
    (column: { name: string }) => column.name === SEARCH_TEXT_COLUMN_NAME
  );

  if (hasSearchTextColumn) {
    return;
  }

  try {
    await db.prepare(ADD_SEARCH_TEXT_COLUMN_SQL).run();
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    if (message.includes("duplicate column name: search_text")) {
      return;
    }

    throw error;
  }
}

async function ensureTablesAndIndexes(db: Database): Promise<void> {
  await db.prepare(CREATE_ADMIN_SESSIONS_TABLE_SQL).run();
  await db.prepare(CREATE_ADMIN_SESSIONS_EXPIRES_AT_INDEX_SQL).run();
  await db.prepare(CREATE_RATE_LIMITS_TABLE_SQL).run();
  await db.prepare(CREATE_RATE_LIMITS_CREATED_AT_INDEX_SQL).run();
}

export async function ensureDatabaseSchema(db: Database): Promise<void> {
  const pendingEnsure = schemaEnsures.get(db);
  if (pendingEnsure) {
    await pendingEnsure;
    return;
  }

  const ensurePromise = (async () => {
    await ensureTablesAndIndexes(db);
    await ensureTweetsSearchTextColumn(db);
  })().catch((error) => {
    schemaEnsures.delete(db);
    throw error;
  });

  schemaEnsures.set(db, ensurePromise);
  await ensurePromise;
}
