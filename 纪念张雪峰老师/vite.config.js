import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const modelCandidates = [
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
  const match = req.url?.match(/^\/models\/(.+\.(glb|gltf))(\?.*)?$/i);
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
  const contentType = ext === '.gltf' ? 'model/gltf+json' : 'model/gltf-binary';

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
            const outDir = path.join(process.cwd(), 'dist', 'models');
            fs.mkdirSync(outDir, { recursive: true });

            for (const getPath of modelCandidates) {
              const src = getPath('hero.glb');
              if (src && fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(outDir, 'hero.glb'));
                break;
              }
            }
          },
        },
      ],
    },
  },
});
