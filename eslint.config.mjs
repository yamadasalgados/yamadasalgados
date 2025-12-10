import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ✅ Overrides de regras (aqui é o ponto-chave)
  {
    rules: {
      // libera uso de `any` (senão trava o build)
      "@typescript-eslint/no-explicit-any": "off",

      // variáveis não usadas viram warning (não erro)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },

  // ✅ Ignorar pastas padrão
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
