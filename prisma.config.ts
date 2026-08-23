import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 requires this file for the CLI (`prisma migrate` / `validate`) to
 * resolve a datasource URL — the schema's own `datasource db` block
 * deliberately has no `url` because the RUNTIME client (`src/lib/db.ts`)
 * connects via an explicit driver adapter (`@prisma/adapter-pg`, over a `pg`
 * `Pool`), not a schema-level URL. This file only feeds the CLI; it does not
 * change how the app itself connects.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
