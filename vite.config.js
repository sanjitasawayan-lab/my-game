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

function serveModelMiddleware(req, res, next) {
  const match = req.url?.match(/^\/(?:models|assets)\/(.+\.(glb|gltf|fbx))(\?.*)?$/i);
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
}

export default defineConfig({
  plugins: [
    {
      name: 'serve-local-models',
      configureServer(server) {
        server.middlewares.use(serveModelMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveModelMiddleware);
      },
    },
  ],
  build: {
    rollupOptions: {
      plugins: [
        {
          name: 'copy-root-models',
          writeBundle() {
            for (const file of [
              'hero_animated.glb',
              'hero.glb',
              'FastRun.fbx',
              'RunningJump.fbx',
              'RunningSlide.fbx',
            ]) {
              for (const getPath of modelCandidates) {
                const src = getPath(file);
                if (src && fs.existsSync(src)) {
                  const destDir = file.endsWith('.glb') && file.includes('animated')
                    ? path.join(process.cwd(), 'dist', 'assets')
                    : path.join(process.cwd(), 'dist', 'models');
                  fs.mkdirSync(destDir, { recursive: true });
                  fs.copyFileSync(src, path.join(destDir, file));
                  break;
                }
              }
            }
          },
        },
      ],
    },
  },
});
