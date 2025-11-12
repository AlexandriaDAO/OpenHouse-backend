import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['dist/auth.js'],
  bundle: true,
  format: 'iife',
  globalName: 'OpenHouseAuthModule',
  outfile: 'dist/auth.bundle.js',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: true
});

console.log('Auth module bundled successfully!');
