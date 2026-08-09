import js from '@eslint/js';
export default [js.configs.recommended, {
  rules: {
    'no-unused-vars': 'warn',
    'no-undef': 'error'
  },
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: {
      console: 'readonly',
      process: 'readonly',
      setTimeout: 'readonly',
      setInterval: 'readonly',
      clearTimeout: 'readonly',
      clearInterval: 'readonly',
      Math: 'readonly',
      parseInt: 'readonly',
      isNaN: 'readonly',
      Promise: 'readonly',
      Buffer: 'readonly',
      URL: 'readonly',
      fetch: 'readonly',
      setImmediate: 'readonly',
      structuredClone: 'readonly'
    }
  }
}, {
  files: ['public/**/*.js'],
  rules: {
    'no-unused-vars': 'off'
  },
  languageOptions: {
    globals: {
      document: 'readonly',
      window: 'readonly',
      Option: 'readonly',
      EventSource: 'readonly',
      FileReader: 'readonly',
      confirm: 'readonly'
    }
  }
}];
