import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.js'], // Ignore build output and compiled files
    },
    { files: ['**/*.{js,mjs,cjs,ts}'] },
    { languageOptions: { globals: { ...globals.node, ...globals.jest } } }, // Add jest globals
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    prettierConfig, // Disable conflicting ESLint rules with Prettier
    {
        plugins: {
            prettier: prettierPlugin, // Add the Prettier plugin
        },
        rules: {
            'prettier/prettier': 'warn', // Show Prettier formatting issues as warnings
            'no-unused-vars': 'off', // Turn off base rule
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ], // Warn on unused vars and ignore _ prefixed vars
            '@typescript-eslint/no-explicit-any': 'off', // Turn off explicit any warning as it's heavily used in this codebase
            '@typescript-eslint/no-require-imports': 'warn', // Warn on require imports
            'no-case-declarations': 'off', // Allow lexical declarations in case blocks
            'no-control-regex': 'off', // Allow ANSI escape codes in regex for colored terminal output
        },
    },
];
