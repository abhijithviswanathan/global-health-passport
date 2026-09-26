/** Shared workflow modules must remain independent of UI frameworks and platform adapters. */
import parser from "../../apps/web/node_modules/@typescript-eslint/parser/dist/index.js";
import typescript from "../../apps/web/node_modules/@typescript-eslint/eslint-plugin/dist/index.js";

export default [
  {
    files: ["apps/shared/**/*.ts"],
    languageOptions: {
      parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": typescript },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-duplicate-imports": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-native",
                "expo*",
                "**/web/**",
                "**/mobile/**",
              ],
              message:
                "Shared models must not depend on a client. Inject platform behavior through an adapter.",
            },
          ],
        },
      ],
    },
  },
];
