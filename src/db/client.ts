import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

let pool: Pool | undefined;

// Un solo Pool por proceso — evita agotar las conexiones en dev (hot reload)
// y en los tests (cada archivo de test comparte el mismo cliente).
export function getDb() {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool, { schema });
}
