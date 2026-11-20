import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'logbook-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          let urlObj;
          try {
            urlObj = new URL(req.url, 'http://localhost');
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request URL' }));
            return;
          }

          const examplesDir = path.resolve(__dirname, '../logbooks');
          const defaultExercisesPath = path.resolve(__dirname, './src/defaultExercises.json');
          const customExercisesPath = path.resolve(examplesDir, 'exercises_v6.json');

          const sanitizeLogbookName = (rawName) => {
            const trimmed = (rawName || '').trim();
            if (!trimmed || trimmed === '.' || trimmed === '..' || /[/\\]/.test(trimmed) || trimmed.includes('..')) {
              return '';
            }
            return trimmed;
          };

          const isWithinDir = (parentDir, targetPath) => {
            const rel = path.relative(parentDir, targetPath);
            return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
          };

          const readRequestBody = (request, onDone) => {
            const chunks = [];
            let finished = false;
            request.on('data', (chunk) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            request.on('end', () => {
              if (finished) return;
              finished = true;
              onDone(null, Buffer.concat(chunks).toString('utf-8'));
            });
            request.on('error', (err) => {
              if (finished) return;
              finished = true;
              onDone(err, '');
            });
          };

          const getAvailableProfiles = () => {
            if (!fs.existsSync(examplesDir)) return [];
            return fs.readdirSync(examplesDir)
              .filter((entry) => {
                if (entry.startsWith('.') || entry.toLowerCase() === 'programs') return false;
                try {
                  return fs.statSync(path.resolve(examplesDir, entry)).isDirectory();
                } catch {
                  return false;
                }
              })
              .sort((a, b) => a.localeCompare(b));
          };

          const resolveProfileScope = (rawProfile) => {
            const profiles = getAvailableProfiles();
            const requested = sanitizeLogbookName(rawProfile);
            const selected = requested && profiles.includes(requested)
              ? requested
              : (profiles.includes('Lorenzo') ? 'Lorenzo' : (profiles[0] || ''));
            if (selected) {
              const profileRoot = path.resolve(examplesDir, selected);
              const subPrograms = path.resolve(profileRoot, 'Programs');
              return {
                profileName: selected,
                profilePath: path.resolve(profileRoot, 'profile.md'),
                programsDir: fs.existsSync(subPrograms) ? subPrograms : profileRoot,
              };
            }
            const programsSubdir = path.resolve(examplesDir, 'Programs');
            return {
              profileName: '',
              profilePath: path.resolve(examplesDir, 'profile.md'),
              programsDir: fs.existsSync(programsSubdir) ? programsSubdir : examplesDir,
            };
          };

          if (urlObj.pathname === '/api/profiles' && req.method === 'GET') {
            try {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(getAvailableProfiles()));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (urlObj.pathname === '/api/logbook') {
            const { programsDir } = resolveProfileScope(urlObj.searchParams.get('profile'));
            const rawProgram = urlObj.searchParams.get('program');
            const programName = rawProgram === null ? 'S1M3' : rawProgram;
            const cleanProgramName = sanitizeLogbookName(programName);
            if (!cleanProgramName || cleanProgramName.toLowerCase() === 'profile') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid program name' }));
              return;
            }
            const logbookPath = path.resolve(programsDir, `${cleanProgramName}.md`);
            if (!isWithinDir(programsDir, logbookPath)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid program path' }));
              return;
            }

            if (req.method === 'GET') {
              if (fs.existsSync(logbookPath)) {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(fs.readFileSync(logbookPath, 'utf-8'));
              } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`Logbook file ${cleanProgramName}.md not found`);
              }
              return;
            } else if (req.method === 'POST') {
              readRequestBody(req, (readErr, body) => {
                if (readErr) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: readErr.message }));
                  return;
                }
                try {
                  fs.mkdirSync(path.dirname(logbookPath), { recursive: true });
                  fs.writeFileSync(logbookPath, body, 'utf-8');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true }));
                } catch (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }
          }

          if (urlObj.pathname === '/api/profile') {
            const { profilePath } = resolveProfileScope(urlObj.searchParams.get('profile'));
            if (req.method === 'GET') {
              if (fs.existsSync(profilePath)) {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(fs.readFileSync(profilePath, 'utf-8'));
              } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('profile.md not found');
              }
              return;
            } else if (req.method === 'POST') {
              readRequestBody(req, (readErr, body) => {
                if (readErr) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: readErr.message }));
                  return;
                }
                try {
                  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
                  fs.writeFileSync(profilePath, body, 'utf-8');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true }));
                } catch (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }
          }

          if (urlObj.pathname === '/api/programs') {
            if (req.method === 'GET') {
              try {
                const { programsDir } = resolveProfileScope(urlObj.searchParams.get('profile'));
                if (!fs.existsSync(programsDir)) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify([]));
                  return;
                }
                const files = fs.readdirSync(programsDir);
                const programs = files
                  .filter(file => file.endsWith('.md') && file.toLowerCase() !== 'profile.md')
                  .map(file => path.basename(file, '.md'))
                  .filter(name => sanitizeLogbookName(name).length > 0);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(programs));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            } else if (req.method === 'POST') {
              readRequestBody(req, (readErr, body) => {
                if (readErr) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: readErr.message }));
                  return;
                }
                try {
                  const data = JSON.parse(body);
                  const { programsDir } = resolveProfileScope(data.profile || urlObj.searchParams.get('profile'));
                  const name = sanitizeLogbookName(data.name);
                  if (!name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid program name' }));
                    return;
                  }
                  if (name.toLowerCase() === 'profile') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Reserved program name' }));
                    return;
                  }
                  const newPath = path.resolve(programsDir, `${name}.md`);
                  if (!isWithinDir(programsDir, newPath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid program path' }));
                    return;
                  }
                  if (fs.existsSync(newPath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Program already exists' }));
                    return;
                  }

                  fs.mkdirSync(programsDir, { recursive: true });
                  const fileContent = data.content || `# 1\nDates:\n\nLat machine | 3' |\n90.. 9+2, 7+2\n`;
                  fs.writeFileSync(newPath, fileContent, 'utf-8');

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, name }));
                } catch (err) {
                  const status = err instanceof SyntaxError ? 400 : 500;
                  res.writeHead(status, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }
          }

          if (urlObj.pathname === '/api/exercises/reset' && req.method === 'POST') {
            try {
              if (fs.existsSync(customExercisesPath)) {
                fs.unlinkSync(customExercisesPath);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (urlObj.pathname === '/api/exercises' && req.method === 'GET') {
            const sourcePath = fs.existsSync(customExercisesPath) ? customExercisesPath : defaultExercisesPath;
            if (fs.existsSync(sourcePath)) {
              try {
                const content = fs.readFileSync(sourcePath, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(content);
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Failed to read exercises: ${err.message}` }));
              }
            } else {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('defaultExercises.json not found');
            }
            return;
          }

          if (urlObj.pathname === '/api/exercises' && req.method === 'POST') {
            readRequestBody(req, (readErr, body) => {
              if (readErr) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: readErr.message }));
                return;
              }
              try {
                const exercises = JSON.parse(body);
                if (!Array.isArray(exercises)) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Body must be an array of exercises' }));
                  return;
                }
                fs.mkdirSync(path.dirname(customExercisesPath), { recursive: true });
                fs.writeFileSync(customExercisesPath, JSON.stringify(exercises, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (err) {
                const status = err instanceof SyntaxError ? 400 : 500;
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }



          next();
        });
      }
    }
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-recharts';
          }
          if (id.includes('node_modules/@codemirror') || id.includes('node_modules/@uiw/react-codemirror')) {
            return 'vendor-codemirror';
          }
          if (id.includes('node_modules/katex')) {
            return 'vendor-katex';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  }
})
