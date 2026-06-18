/**
 * 从 models/hero.glb 生成轻量版 models/hero_lite.glb（约 1.7MB，原文件约 9MB）
 * 运行：npm run compress:hero
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'models', 'hero.glb');
const dest = path.join(root, 'models', 'hero_lite.glb');

if (!fs.existsSync(src)) {
  console.error('[compress] 找不到 models/hero.glb');
  process.exit(1);
}

const run = (args) => {
  execSync(`npx --yes @gltf-transform/cli ${args}`, { stdio: 'inherit', cwd: root });
};

const tmp = path.join(root, 'models', '_hero_tmp.glb');
run(`simplify "${src}" "${tmp}" --ratio 0.08`);
run(`resize "${tmp}" "${tmp}" --width 512 --height 512`);
run(`meshopt "${tmp}" "${dest}"`);
fs.rmSync(tmp, { force: true });

const before = fs.statSync(src).size;
const after = fs.statSync(dest).size;
console.log(
  `[compress] hero.glb ${(before / 1024 / 1024).toFixed(2)} MB -> hero_lite.glb ${(after / 1024 / 1024).toFixed(2)} MB`
);
