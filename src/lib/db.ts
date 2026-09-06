import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolvePgConnection } from "@/lib/db/connection";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

/**
 * Bağlantı kurulamazsa serverless invocation'ı süresiz bekletmemek için üst
 * sınır. `/api/v1/ready` bunun altında kalıp hatayı sınıflandırabilmeli.
 */
const CONNECTION_TIMEOUT_MS = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 10_000);

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.startsWith("file:")) {
    throw new Error(
      "STORE_MODE=db için geçerli bir PostgreSQL DATABASE_URL gerekli (ör. postgresql://user:pass@host:5432/db)."
    );
  }

  const pool = new Pool({
    ...resolvePgConnection(databaseUrl),
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  const client = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error", "warn"],
  });

  globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
