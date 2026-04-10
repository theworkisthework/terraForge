import tsParser from "@typescript-eslint/parser";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

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
      "react-hooks": reactHooksPlugin,
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
    // Test files often use large describe/it callback bodies for scenario
    // readability; do not enforce function-length limits there.
    files: ["tests/**/*.test.{ts,tsx}", "tests/**/*.spec.{ts,tsx}"],
    rules: {
      "max-lines-per-function": "off",
    },
  },
  {
    // Stricter guardrails for extracted engine stages where we expect small,
    // single-purpose modules.
    files: ["src/workers/gcodeEngine/stages/**/*.ts"],
    rules: {
      complexity: ["warn", 20],
      "max-lines": [
        "warn",
        {
          max: 260,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "warn",
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
