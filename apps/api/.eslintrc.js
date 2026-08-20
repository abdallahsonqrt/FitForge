/**
 * ESLint 8 (eslintrc format — this is the version the repo pins, and it does not
 * read `eslint.config.js`).
 *
 * The `lint` script, the plugins and the shareable configs were all already in
 * package.json; only this file was missing, so `npm run lint` failed with
 * "couldn't find a configuration file" rather than linting anything.
 */
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  /**
   * `prettier` (the config) rather than `plugin:prettier/recommended` (the
   * rule): the former switches off formatting rules that would fight Prettier,
   * the latter reports every formatting difference as a lint error.
   *
   * This source tree has never been Prettier-formatted — turning the rule on
   * reports ~5,300 whitespace errors and drowns real findings. Formatting stays
   * available on demand through `npm run format`; lint is for code problems.
   */
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  root: true,
  env: {
    node: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules', 'src/metadata.ts'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    /**
     * `any` is load-bearing in this codebase: controllers type `@Req() req: any`
     * and Drizzle's inferred row types are frequently too wide to name. Warn so
     * new occurrences are visible without failing the build on existing ones.
     */
    '@typescript-eslint/no-explicit-any': 'warn',
    /**
     * `ignoreRestSiblings` keeps the omit idiom clean: services strip secrets
     * with `const { passwordHash, ...safe } = user`, where the named binding is
     * meant to be discarded.
     */
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
  },
};
