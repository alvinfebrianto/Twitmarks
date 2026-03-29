import { errors } from "./evlog";

export type Database = App.Locals["runtime"]["env"]["DB"];

export function getDbOrThrow(locals: App.Locals): Database {
  const db = locals.runtime.env.DB;
  if (!db) {
    throw errors.database("check database connection");
  }
  return db;
}
