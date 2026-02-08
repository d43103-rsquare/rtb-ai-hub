import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // Global ignores
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/build/**', '**/coverage/**'],
  },

  // Base config for all TS files
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  // Shared settings for all TypeScript files
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Relax rules that are too strict for existing codebase
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Backend packages (Node.js globals)
  {
    files: [
      'packages/shared/src/**/*.ts',
      'packages/auth-service/src/**/*.ts',
      'packages/webhook-listener/src/**/*.ts',
      'packages/workflow-engine/src/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Dashboard (React + Browser globals)
  {
    files: ['packages/dashboard/src/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
      'react/prop-types': 'off', // Using TypeScript for prop types
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
