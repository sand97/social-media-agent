import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importPlugin from 'eslint-plugin-import'
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

export default [
  // Apply recommended configurations
  js.configs.recommended,

  // Global settings
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },

  // TypeScript configuration
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      'no-relative-import-paths': noRelativeImportPaths,
      prettier: prettier,
    },
    rules: {
      // Disable conflicting rules with Prettier
      ...prettierConfig.rules,

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Import rules
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-relative-parent-imports': 'warn',
      'import/no-relative-packages': 'error',
      // Warn about relative imports (manual fix required in monorepos)
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: [
                './*.css',
                './*.scss',
                './*.less',
                '../*.css',
                '../*.scss',
                '../*.less',
              ],
              message:
                'Prefer absolute imports using ~ alias for stylesheets over relative imports.',
            },
            {
              group: [
                './*.svg',
                './*.png',
                './*.jpg',
                './*.jpeg',
                './*.gif',
                './*.webp',
                '../*.svg',
                '../*.png',
                '../*.jpg',
                '../*.jpeg',
                '../*.gif',
                '../*.webp',
              ],
              message:
                'Prefer absolute imports using ~ alias for assets over relative imports.',
            },
            {
              group: [
                './*.js',
                './*.ts',
                './*.jsx',
                './*.tsx',
                '../*.js',
                '../*.ts',
                '../*.jsx',
                '../*.tsx',
              ],
              message:
                'Prefer absolute imports using ~ alias for modules over relative imports.',
            },
          ],
        },
      ],

      // General rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unused-vars': 'off', // Use TypeScript version
      'no-undef': 'off', // TypeScript handles identifier resolution and DOM types
      'prefer-const': 'error',
      'no-var': 'error',

      // Prettier integration
      'prettier/prettier': 'error',
    },
  },

  // React configuration for frontend app
  {
    files: ['apps/frontend/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        React: 'readonly',
        JSX: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        ResizeObserver: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
      },
    },
    plugins: {
      react: react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React specific rules
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/prop-types': 'off', // Using TypeScript
      'react/jsx-uses-react': 'off', // Not needed in React 17+
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/no-unescaped-entities': 'warn',
      'react/display-name': 'off',

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React Refresh (for development)
      'react-refresh/only-export-components': 'warn',

      // Accessibility
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },

  // NestJS/Backend configuration
  {
    files: ['apps/backend/**/*.{ts,js}'],
    ignores: ['**/*.{test,spec,e2e-spec}.{ts,js}', '**/__tests__/**'],
    languageOptions: {
      parser: tsparser,
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        jest: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
      },
      parserOptions: {
        project: './apps/backend/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-console': 'off', // Allow console in server code
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },

  // WhatsApp Agent configuration
  {
    files: ['apps/whatsapp-agent/**/*.{ts,js}'],
    languageOptions: {
      parser: tsparser,
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        jest: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // WhatsApp Connector configuration
  {
    files: ['apps/whatsapp-connector/**/*.{ts,js}'],
    languageOptions: {
      parser: tsparser,
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        jest: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Test files configuration
  {
    files: [
      '**/*.{test,spec}.{ts,tsx,js,jsx}',
      '**/*.e2e-spec.{ts,tsx,js,jsx}',
      '**/__tests__/**/*.{ts,tsx,js,jsx}',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
      },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        vi: 'readonly',
        vitest: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Configuration files
  {
    files: ['*.config.{js,ts}', '**/*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        process: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Special cases that need relative imports
  {
    files: ['**/prisma/seed.ts', '**/+types/*.ts', '**/*.d.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'import/no-relative-parent-imports': 'off',
      'import/no-relative-packages': 'off',
    },
  },

  // React Router type files (auto-generated)
  {
    files: ['**/*+types*'],
    rules: {
      'no-restricted-imports': 'off',
      'import/no-relative-parent-imports': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '.next/',
      '.cache/',
      '.pnpm-store/',
      'apps/*/node_modules/',
      'packages/*/node_modules/',
      'apps/*/dist/',
      'apps/*/build/',
      'packages/*/dist/',
      'packages/*/build/',
      'apps/backend/generated/',
      'apps/backend/src/generated/',
      'apps/backend/prisma/',
      'apps/backend/prisma.config.ts',
      'apps/frontend/.react-router/',
      'apps/frontend/build/',
      '*.min.js',
      '*.bundle.js',
      '**/*.d.ts',
      '**/*.generated.ts',
    ],
  },
]
