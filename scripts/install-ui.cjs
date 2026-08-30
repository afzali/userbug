const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ui = path.join(root, 'ui');
const env = { ...process.env };

// npm تو‌در‌تو نباید local-prefix و lifecycle بستهٔ ریشه را به ارث ببرد؛
// وگرنه روی بعضی نسخه‌های npm دوباره postinstall ریشه را اجرا می‌کند.
for (const key of [
  'INIT_CWD',
  'npm_config_local_prefix',
  'npm_lifecycle_event',
  'npm_lifecycle_script',
  'npm_package_json',
  'npm_package_name',
]) {
  delete env[key];
}
env.INIT_CWD = ui;

const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = npmCli ? [npmCli, 'install'] : ['install'];
const result = spawnSync(command, args, {
  cwd: ui,
  env,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});

if (result.error) {
  console.error(`نصب وابستگی‌های UI شروع نشد: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
