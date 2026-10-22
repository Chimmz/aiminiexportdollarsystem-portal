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
    // Vendored component sources (shadcn/ui + AI Elements registries) —
    // used as-is, not hand-edited, so our lint rules don't apply to them.
    "src/components/ui/**",
    "src/components/ai-elements/**",
    "src/hooks/use-mobile.ts",
  ]),
]);

export default eslintConfig;
