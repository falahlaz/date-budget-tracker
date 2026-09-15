import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Lint config for the server half (the client has its own toolchain).
 *
 * Deliberately configured to match the code as it is written rather than to demand a
 * repo-wide reformat: a lint gate that fails on its first run teaches everyone to skip it.
 * `eslint-config-prettier` is last so nothing here argues with the formatter about layout —
 * this config is about correctness, not whitespace.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'client/**', 'coverage/**', 'prisma/**', 'snapshots/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // The engines lean on non-null assertions where an invariant has already been
      // asserted a line above; the assertion IS the documentation there.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Prisma's generated types make some casts unavoidable at the boundary.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      // Test fixtures reach into response bodies, which are `any` by nature.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettier,
);
