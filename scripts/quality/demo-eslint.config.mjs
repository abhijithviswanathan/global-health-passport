/** Keep public-demo modules free of implicit globals and abandoned dependencies. */
export default [
  {
    files: ["docs/demo/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: Object.fromEntries(
        [
          "document",
          "structuredClone",
          "setTimeout",
          "clearTimeout",
          "AbortController",
          "FormData",
        ].map((name) => [name, "readonly"]),
      ),
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
    },
  },
];
