interface Runtime {
  cf: CfProperties;
  env: {
    DB: D1Database;
    ADMIN_SECRET: string;
    ASSETS: Fetcher;
  };
}

declare namespace App {
  interface Locals extends Runtime {}
}
