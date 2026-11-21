import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import typed from "eslint-config-next/typescript";

export default defineConfig([...next, ...typed, globalIgnores([".next/**", "storage/**", "next-env.d.ts"])]);
