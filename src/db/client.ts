import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pool?: mysql.Pool;
};

const pool =
  globalForDb.pool ??
  mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "sunday",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "sunday_db",
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
