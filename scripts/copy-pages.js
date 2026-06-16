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

console.log('[pages] 已复制 dist → docs，可推送到 GitHub 并在 Pages 设置中选择 /docs 目录');
