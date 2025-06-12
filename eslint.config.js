import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';

export default [
	js.configs.recommended,
	{
		files: ['**/*.{js,ts,mjs}'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module'
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				global: 'readonly',
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				location: 'readonly',
				self: 'readonly',
				importScripts: 'readonly',
				define: 'readonly',
				URL: 'readonly',
				Request: 'readonly',
				Response: 'readonly',
				Headers: 'readonly',
				fetch: 'readonly',
				caches: 'readonly',
				FetchEvent: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				registration: 'readonly',
				IDBDatabase: 'readonly',
				IDBTransaction: 'readonly',
				IDBCursor: 'readonly',
				IDBObjectStore: 'readonly',
				IDBIndex: 'readonly',
				IDBRequest: 'readonly',
				indexedDB: 'readonly',
				DOMException: 'readonly'
			}
		},
		plugins: {
			'@typescript-eslint': ts
		},
		rules: {
			...ts.configs.recommended.rules,
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-non-null-assertion': 'warn'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: tsParser,
				extraFileExtensions: ['.svelte']
			}
		},
		plugins: {
			svelte,
			'@typescript-eslint': ts
		},
		rules: {
			...svelte.configs.recommended.rules,
			...ts.configs.recommended.rules,
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'svelte/no-at-html-tags': 'warn'
		}
	},
	{
		files: ['**/*.{js,ts,svelte}'],
		rules: prettier.rules
	},
	{
		ignores: [
			'node_modules/',
			'.svelte-kit/',
			'build/',
			'dist/',
			'coverage/',
			'*.config.js',
			'*.config.ts',
			'playwright-report/',
			'test-results/'
		]
	}
];
