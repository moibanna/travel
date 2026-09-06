import path from "node:path";
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 configuration. The connection URL lives here (rather than in
 * schema.prisma) and is used by the migrate/introspect CLI commands. The
 * application itself connects through a driver adapter — see src/lib/db.ts.
 *
 * Prisma 7 no longer loads .env automatically, hence the explicit import above.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
