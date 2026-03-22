/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["eslint:recommended"],
  env: { node: true, es2020: true },
  parserOptions: { ecmaVersion: 2020 },
  rules: {
    "no-console": "warn",
  },
};
