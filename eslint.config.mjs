import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["flexi-day/", "flexi-day-be/", "flexi-day-emails/", "todo/", "node_modules/"],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
