// Normal authentication build, separate from the delivered ChatGPT Demo artifacts.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const frontend = path.resolve(__dirname, '..');
const env = { ...process.env };
// Only explicitly selected public frontend settings belong in this build.
for (const name of Object.keys(env)) {
  if (name.startsWith('REACT_APP_')) delete env[name];
}
Object.assign(env, {
  REACT_APP_PREVIEW: 'false',
  REACT_APP_STANDARD_SIGN_IN: 'true',
  REACT_APP_BACKEND_URL: '',
  BUILD_PATH: path.resolve(frontend, '../deploy/cloudflare/dist'),
  GENERATE_SOURCEMAP: 'false',
  PUBLIC_URL: '/',
});
const result = spawnSync(process.execPath,
  [require.resolve('@craco/craco/dist/bin/craco.js'), 'build'],
  { cwd: frontend, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
