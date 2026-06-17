/**
 * 校验 docs/ 是否为可上线的生产构建（禁止仍指向源码 ./src/game.js）
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'docs');
const indexPath = path.join(docsDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('[verify] 缺少 docs/index.html，请先运行 npm run build:pages');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');

if (html.includes('./src/game.js') || html.includes('src/game.js')) {
  console.error('[verify] docs/index.html 仍指向源码，GitHub Pages 将无法运行游戏');
  process.exit(1);
}

if (html.includes('./node_modules/')) {
  console.error('[verify] docs/index.html 仍引用 node_modules，请使用 vite build 产物');
  process.exit(1);
}

const assetsDir = path.join(docsDir, 'assets');
if (!fs.existsSync(assetsDir)) {
  console.error('[verify] 缺少 docs/assets/ 目录');
  process.exit(1);
}

const jsBundles = fs.readdirSync(assetsDir).filter((f) => /^index-.*\.js$/.test(f));
if (jsBundles.length === 0) {
  console.error('[verify] docs/assets/ 中未找到打包后的 index-*.js');
  process.exit(1);
}

const referenced = jsBundles.some((file) => html.includes(file));
if (!referenced) {
  console.error('[verify] index.html 未引用当前 docs/assets 中的 JS 包');
  process.exit(1);
}

const bundleManifest = path.join(root, 'pages-bundle.json');
if (!fs.existsSync(bundleManifest)) {
  console.error('[verify] 缺少 pages-bundle.json');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(bundleManifest, 'utf8'));
if (!manifest.js?.includes(jsBundles[0])) {
  console.error('[verify] pages-bundle.json 与 docs 构建产物不一致');
  process.exit(1);
}

const rootAssetsDir = path.join(root, 'assets');
if (!fs.existsSync(path.join(rootAssetsDir, jsBundles[0]))) {
  console.error('[verify] 根目录 assets 未同步打包 JS');
  process.exit(1);
}

console.log(`[verify] 生产构建校验通过（${jsBundles[0]}）`);
