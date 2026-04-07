interface Runtime {
  cf: CfProperties;
  ctx?: {
    waitUntil(promise: Promise<unknown>): void;
  };
  env: {
    DB: D1Database;
    ADMIN_SECRET?: string;
    ASSETS: Fetcher;
  };
}

declare namespace App {
  interface Locals {
    runtime: Runtime;
  }
}
