/**
 * 将 Vite 构建产物 dist/ 复制到 docs/，供 GitHub Pages「从 /docs 目录发布」使用。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const docsDir = path.join(root, 'docs');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(distDir)) {
  console.error('[pages] 请先运行 npm run build');
  process.exit(1);
}

fs.rmSync(docsDir, { recursive: true, force: true });
copyDir(distDir, docsDir);

// 避免 GitHub Pages Jekyll 处理干扰静态资源
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

const nestedGit = path.join(docsDir, '.git');
if (fs.existsSync(nestedGit)) {
  fs.rmSync(nestedGit, { recursive: true, force: true });
}

// 同步到仓库根目录：兼容 Pages 误选 /(root) 时也能加载打包脚本
const rootSyncDirs = ['assets', 'audio', 'models', 'textures'];
for (const dirName of rootSyncDirs) {
  const src = path.join(distDir, dirName);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(root, dirName);
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(src, dest);
}

const assetsDir = path.join(distDir, 'assets');
const jsBundle = fs
  .readdirSync(assetsDir)
  .find((file) => /^index-.*\.js$/.test(file));
if (!jsBundle) {
  console.error('[pages] 未找到打包后的 index-*.js');
  process.exit(1);
}

const pagesBase = process.env.VITE_BASE_URL || '/my-game/';
const base = pagesBase.endsWith('/') ? pagesBase : `${pagesBase}/`;
const bundlePath = `${base}assets/${jsBundle}`;
fs.writeFileSync(
  path.join(root, 'pages-bundle.json'),
  `${JSON.stringify({ js: bundlePath, builtAt: new Date().toISOString() }, null, 2)}\n`
);

console.log('[pages] 已复制 dist → docs，并同步根目录资源与 pages-bundle.json');
