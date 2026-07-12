// 最小静态检查:只抓真实缺陷(未定义变量、未使用变量、重复声明等),
// 不做风格约束。www/ 是无打包器的多 script 文件,跨文件全局在此显式声明,
// 新增 UMD 模块导出的全局名要同步加进 projectGlobals。
import globals from 'globals';

const projectGlobals = {
  BeanCore: 'readonly',
  BeanSyncCompare: 'readonly',
  BeanSync: 'readonly',
  BeanCloudSync: 'readonly',
  BeanSyncTransport: 'readonly',
  BeanRepository: 'readonly',
  BeanWebRepositoryAdapter: 'readonly',
  CoffeeParser: 'readonly',
  AppFormat: 'readonly',
  AppShareCard: 'readonly',
  AppSyncUi: 'readonly',
  AppBrewAssist: 'readonly',
  AppBackup: 'readonly',
  AppUpdate: 'readonly',
  AppNumberInput: 'readonly',
  AppWidgetIntent: 'readonly',
  PhotoTone: 'readonly',
  Capacitor: 'readonly',
  qrcode: 'readonly',
  jsQR: 'readonly'
};

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-undef-init': 'off',
  'eqeqeq': 'off'
};

export default [
  {
    files: ['www/**/*.js'],
    ignores: ['www/vendor/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      // module/require/Buffer:www 模块是 UMD,同一份文件也在 Node 测试里跑,存在受 typeof 保护的 Node 分支。
      globals: { ...globals.browser, ...projectGlobals, module: 'readonly', require: 'readonly', Buffer: 'readonly' }
    },
    rules
  },
  {
    files: ['www/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker }
    },
    rules
  },
  {
    files: ['worker/src/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.serviceworker, Request: 'readonly', Response: 'readonly', URL: 'readonly', console: 'readonly', crypto: 'readonly', TextEncoder: 'readonly' }
    },
    rules
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module' }
  }
];
