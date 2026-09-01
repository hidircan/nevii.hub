import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // .claude/worktrees altındaki agent kopyaları lint kapsamına girmesin.
    ".claude/**",
    // Projenin herhangi bir alt dizinindeki generated .next çıktıları lint kapsamına girmesin.
    "**/.next/**",
  ]),
]);

export default eslintConfig;
