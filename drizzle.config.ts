import { defineConfig } from "drizzle-kit";

/**
 * `generate` works offline (schema -> SQL). `migrate`/`push`/`studio` need a
 * reachable DB: when run from the host use DB_HOST=localhost (the compose
 * publishes 3306); inside the app network it's `db`.
 */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "sunday",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "sunday_db",
  },
});
