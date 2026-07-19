// ESLint flat config for cloud-worker
// Minimal rules: catch syntax errors and common mistakes without being pedantic.
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Cloudflare Worker globals
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        btoa: "readonly",
        atob: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        AbortSignal: "readonly",
        AbortController: "readonly",
        Headers: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        ReadableStream: "readonly",
        WritableStream: "readonly",
        TransformStream: "readonly",
        caches: "readonly",
        // Node.js test globals
        process: "readonly",
        Buffer: "readonly",
        globalThis: "readonly",
      },
    },
    rules: {
      // No unused variables (catch dead code from refactoring)
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // No undefined variables (catch typos)
      "no-undef": "error",
      // No redeclaration (catch accidental duplicate declarations)
      "no-redeclare": "error",
      // No constant conditions (catch while(true) without break)
      "no-constant-condition": "warn",
      // No duplicate keys in objects
      "no-dupe-keys": "error",
      // No unreachable code
      "no-unreachable": "error",
      // No console.log in production code (allow console.log/error/warn — Worker uses for logging)
      "no-console": "off",
      // Prefer const
      "prefer-const": "warn",
      // No var (use let/const)
      "no-var": "error",
      // Equate null/undefined with == not ===
      "eqeqeq": ["warn", "smart"],
    },
    ignores: [
      "node_modules/**",
      "dist/**",
      "test/**", // Tests use mock globals, don't lint them strictly
    ],
  },
];
