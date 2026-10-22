import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
    {
        ignores: ["dist/**", "coverage/**", "node_modules/**", "*.mjs"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier, // turns off rules that fight with Prettier
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "no-console": "error", // use the logger (Phase 2)
        },
    },
);
