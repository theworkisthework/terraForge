import tsParser from "@typescript-eslint/parser";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "out/**",
      "release/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "node_modules/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsEslintPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Non-blocking baseline guidance for broader codebase complexity.
      complexity: ["warn", 25],
      "max-lines-per-function": [
        "warn",
        {
          max: 180,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
    },
  },
  {
    // Stricter guardrails for extracted engine stages where we expect small,
    // single-purpose modules.
    files: ["src/workers/gcodeEngine/stages/**/*.ts"],
    rules: {
      complexity: ["error", 20],
      "max-lines": [
        "error",
        {
          max: 260,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "error",
        {
          max: 160,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
    },
  },
];
