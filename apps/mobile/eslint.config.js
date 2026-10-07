// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Three rules that exist for the React Compiler, which this project does
    // not use (app.config.ts leaves `experiments.reactCompiler` off).
    //
    // They are off rather than obeyed because half of this app is the web
    // app's own code — the data hooks and both academy providers are synced
    // copies, and the screens port the web pages' logic line for line — and the
    // web lints with oxlint, which has none of the three. Rewriting a pattern
    // here that the web keeps would make the copies stop being copies.
    // `rules-of-hooks` and `exhaustive-deps` stay on.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
