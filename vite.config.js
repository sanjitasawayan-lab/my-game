import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const modelCandidates = [
  (file) => path.join(process.cwd(), 'public', 'assets', file),
  (file) => path.join(process.cwd(), 'assets', file),
  (file) => path.join(process.cwd(), 'public', 'models', file),
  (file) => path.join(process.cwd(), 'models', file),
];

function resolveModelFile(filename) {
  for (const getPath of modelCandidates) {
    const fullPath = getPath(filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function createServeModelMiddleware(base = '/') {
  const basePrefix = base.endsWith('/') ? base.slice(0, -1) : base;

  return function serveModelMiddleware(req, res, next) {
    let pathname = req.url?.split('?')[0] ?? '';
    if (basePrefix && basePrefix !== '/' && pathname.startsWith(basePrefix)) {
      pathname = pathname.slice(basePrefix.length) || '/';
    }

    const match = pathname.match(/^\/(?:models|assets)\/(.+\.(glb|gltf|fbx))$/i);
  if (!match) {
    next();
    return;
  }

  const filePath = resolveModelFile(match[1]);
  if (!filePath) {
    next();
    return;
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === '.gltf'
      ? 'model/gltf+json'
      : ext === '.fbx'
        ? 'application/octet-stream'
        : 'model/gltf-binary';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Accept-Ranges', 'bytes');

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }

    fs.createReadStream(filePath).pipe(res);
  };
}

/** GitHub Pages 项目页：https://<user>.github.io/my-game/ */
const pagesBase = '/my-game/';

export default defineConfig({
  base: pagesBase,
  plugins: [
    {
      name: 'serve-local-models',
      configureServer(server) {
        server.middlewares.use(createServeModelMiddleware(pagesBase));
      },
      configurePreviewServer(server) {
        server.middlewares.use(createServeModelMiddleware(pagesBase));
      },
    },
  ],
  build: {
    rollupOptions: {
      plugins: [
        {
          name: 'copy-root-models',
          writeBundle() {
            const copied = new Set();
            for (const file of [
              'hero.glb',
              'FastRun.fbx',
              'RunningJump.fbx',
              'RunningSlide.fbx',
            ]) {
              for (const getPath of modelCandidates) {
                const src = getPath(file);
                if (!src || !fs.existsSync(src)) continue;
                const key = `${file}:${src}`;
                if (copied.has(key)) break;

                const destDir =
                  file.endsWith('.glb') && file.includes('animated')
                    ? path.join(process.cwd(), 'dist', 'assets')
                    : path.join(process.cwd(), 'dist', 'models');
                fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(src, path.join(destDir, file));
                copied.add(key);
                break;
              }
            }

            const animatedCandidates = [
              path.join(process.cwd(), 'public', 'assets', 'hero_animated.glb'),
              path.join(process.cwd(), 'assets', 'hero_animated.glb'),
            ];
            const menuHero = resolveModelFile('hero.glb');
            for (const animatedPath of animatedCandidates) {
              if (!fs.existsSync(animatedPath) || !menuHero) continue;
              const sameSize =
                fs.statSync(animatedPath).size === fs.statSync(menuHero).size;
              if (sameSize) continue;

              const destDir = path.join(process.cwd(), 'dist', 'assets');
              fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(
                animatedPath,
                path.join(destDir, 'hero_animated.glb')
              );
              break;
            }
          },
        },
      ],
    },
  },
});