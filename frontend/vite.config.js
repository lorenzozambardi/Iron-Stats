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
          const urlObj = new URL(req.url, 'http://localhost');
          const examplesDir = path.resolve(__dirname, '../logbooks');

          if (urlObj.pathname === '/api/logbook') {
            const programName = urlObj.searchParams.get('program') || 'S1M3';
            const cleanProgramName = programName.replace(/[^a-zA-Z0-9_-]/g, '');
            const logbookPath = path.resolve(examplesDir, `${cleanProgramName}.md`);

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
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
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

          if (urlObj.pathname === '/api/programs') {
            if (req.method === 'GET') {
              try {
                const files = fs.readdirSync(examplesDir);
                const programs = files
                  .filter(file => file.endsWith('.md'))
                  .map(file => path.basename(file, '.md'))
                  .filter(name => /^[a-zA-Z0-9_-]+$/.test(name));
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(programs));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  const name = data.name ? data.name.replace(/[^a-zA-Z0-9_-]/g, '') : '';
                  if (!name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid program name' }));
                    return;
                  }
                  const newPath = path.resolve(examplesDir, `${name}.md`);
                  if (fs.existsSync(newPath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Program already exists' }));
                    return;
                  }
                  
                  // Template from request or default
                  const fileContent = data.content || `# 1\nLat machine | 3' |\n90..9+2.7+2\n`;
                  fs.writeFileSync(newPath, fileContent, 'utf-8');
                  
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, name }));
                } catch (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }
          }

          if (urlObj.pathname === '/api/exercises' && req.method === 'GET') {
            const exercisesJsonPath = path.resolve(__dirname, './src/defaultExercises.json');
            if (fs.existsSync(exercisesJsonPath)) {
              try {
                const content = fs.readFileSync(exercisesJsonPath, 'utf-8');
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
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const exercises = JSON.parse(body);
                if (!Array.isArray(exercises)) {
                  throw new Error('Body must be an array of exercises');
                }
                const exercisesJsonPath = path.resolve(__dirname, './src/defaultExercises.json');
                fs.writeFileSync(exercisesJsonPath, JSON.stringify(exercises, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }



          next();
        });
      }
    }
  ]
})
