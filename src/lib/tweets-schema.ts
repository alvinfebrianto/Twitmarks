const TWEETS_TABLE_INFO_SQL = "PRAGMA table_info(tweets)";
const ADD_SEARCH_TEXT_COLUMN_SQL =
  "ALTER TABLE tweets ADD COLUMN search_text TEXT";
const SEARCH_TEXT_COLUMN_NAME = "search_text";

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
  db: D1Database
): Promise<void> {
  const tableInfo = await db
    .prepare(TWEETS_TABLE_INFO_SQL)
    .all<{ name: string }>();
  const hasSearchTextColumn = (tableInfo.results ?? []).some(
    (column) => column.name === SEARCH_TEXT_COLUMN_NAME
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
