module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"], // For .ts files in src/
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built JavaScript files
    "/generated/**/*",
    "node_modules", // Good to explicitly ignore node_modules here too
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0, // Often needed for Firebase structure
    "indent": ["error", 2, { "SwitchCase": 1 }], // Enforce 2 spaces for indent, 1 for switch cases
    "max-len": ["warn", { "code": 1900, "ignoreUrls": true, "ignoreComments": true, "ignoreStrings": true, "ignoreTemplateLiterals": true }], // Warn at 120 chars, with ignores
    "object-curly-spacing": ["error", "always"], // Enforce spaces inside curly braces: { foo: bar }
    "eol-last": ["error", "always"], // Require newline at end of files
    "require-jsdoc": "off", // Turning off for now, can be very verbose for functions
    "valid-jsdoc": "off", // Turning off for now
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }], // Warn on unused vars, allow underscore prefix
    "operator-linebreak": ["error", "after"], // Prefer linebreak after operator
    "comma-dangle": ["error", "always-multiline"], // Require trailing commas for multiline objects/arrays
  },

  overrides: [
    {
      files: ["*.js"], // Target .js files in the root of the functions directory (like .eslintrc.js)
      parserOptions: {
        project: null, // Do NOT use tsconfig.json for these JS files
      },
      rules: {
        "@typescript-eslint/no-var-requires": "off", // Allow require() in JS config files
        "no-undef": "off", // .eslintrc.js uses 'module' which can be seen as undefined
      },
    },
  ],
};
