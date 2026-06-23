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
          const analyzerPath = path.resolve(__dirname, '../analyzer/models.py');
          const parentDir = path.resolve(__dirname, '../');

          if (urlObj.pathname === '/api/logbook') {
            const programName = urlObj.searchParams.get('program') || 'S1M3';
            const cleanProgramName = programName.replace(/[^a-zA-Z0-9_-]/g, '');
            const logbookPath = path.resolve(parentDir, `${cleanProgramName}.md`);

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
                const files = fs.readdirSync(parentDir);
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
                  const newPath = path.resolve(parentDir, `${name}.md`);
                  if (fs.existsSync(newPath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Program already exists' }));
                    return;
                  }
                  
                  // Default skeleton template for a new program
                  const defaultTemplate = `# 1\nLat machine | 3' |\n90..9+2.7+2\n`;
                  fs.writeFileSync(newPath, defaultTemplate, 'utf-8');
                  
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
            if (fs.existsSync(analyzerPath)) {
              try {
                const content = fs.readFileSync(analyzerPath, 'utf-8');
                const startIndex = content.indexOf('exercises_list = [');
                const endIndex = content.indexOf('\n]', startIndex);
                const listContent = content.substring(startIndex, endIndex);

                const exercises = [];
                const regex = /Exercise\(\s*"([^"]+)"\s*,\s*({[^{}]*(?:{[^{}]*}[^{}]*)*})\s*,\s*([\d.]+)\s*,\s*([\d.]+)(.*?)\)/gs;

                let match;
                while ((match = regex.exec(listContent)) !== null) {
                  const name = match[1];
                  let musclesJson = match[2].replace(/'/g, '"');
                  // Remove trailing commas to make it valid JSON
                  musclesJson = musclesJson.replace(/,\s*}/g, '}');
                  
                  try {
                    // Convert BezierProfile(x0, y0, x1, y1, x2, y2, x3, y3, m) back to JSON object string for frontend
                    musclesJson = musclesJson.replace(/BezierProfile\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g, '{"x0": $1, "y0": $2, "x1": $3, "y1": $4, "x2": $5, "y2": $6, "x3": $7, "y3": $8, "magnitude": $9}');
                    // Handle the legacy 7-argument version just in case
                    musclesJson = musclesJson.replace(/BezierProfile\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g, '{"x0": 0.0, "y0": $1, "x1": $2, "y1": $3, "x2": $4, "y2": $5, "x3": 1.0, "y3": $6, "magnitude": $7}');
                    
                    const muscles = JSON.parse(musclesJson);
                    const fatigue = parseFloat(match[3]);
                    const load_coeff = parseFloat(match[4]);
                    const extra = match[5];

                    let load_multiplier = 1.0;
                    let load_offset = 0.0;
                    let is_isolation = false;

                    const multMatch = extra.match(/load_multiplier\s*=\s*([\d.]+)/);
                    if (multMatch) load_multiplier = parseFloat(multMatch[1]);

                    const offsetMatch = extra.match(/load_offset\s*=\s*([\d.]+)/);
                    if (offsetMatch) load_offset = parseFloat(offsetMatch[1]);

                    const isoMatch = extra.match(/is_isolation\s*=\s*(True|False)/);
                    if (isoMatch) is_isolation = isoMatch[1] === 'True';

                    exercises.push({
                      name,
                      muscles_distr: muscles,
                      fatigue,
                      load_coeff,
                      load_multiplier,
                      load_offset,
                      is_isolation
                    });
                  } catch(e) {
                    console.error("Failed to parse exercise", name, e);
                  }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(exercises));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Failed to parse exercises: ${err.message}` }));
              }
            } else {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('models.py not found');
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

                if (!fs.existsSync(analyzerPath)) {
                  throw new Error('models.py not found');
                }
                const content = fs.readFileSync(analyzerPath, 'utf-8');

                let listCode = 'exercises_list = [\n';
                exercises.forEach((ex, idx) => {
                  const name = ex.name;
                  const fatigue = parseFloat(ex.fatigue);
                  const load_coeff = parseFloat(ex.load_coeff);
                  const load_multiplier = ex.load_multiplier !== undefined ? parseFloat(ex.load_multiplier) : 1.0;
                  const load_offset = ex.load_offset !== undefined ? parseFloat(ex.load_offset) : 0.0;
                  const is_isolation = !!ex.is_isolation;

                  const musclesEntries = Object.entries(ex.muscles_distr)
                    .map(([m, p]) => {
                        if (typeof p === 'object') {
                          return `"${m}": BezierProfile(${p.x0 ?? 0}, ${p.y0 ?? 1}, ${p.x1 ?? 0.33}, ${p.y1 ?? 1}, ${p.x2 ?? 0.66}, ${p.y2 ?? 1}, ${p.x3 ?? 1}, ${p.y3 ?? 1}, ${p.magnitude || 0})`;
                        } else {
                          return `"${m}": BezierProfile(0.0, 1.0, 0.33, 1.0, 0.66, 1.0, 1.0, 1.0, ${(parseFloat(p) / 100).toFixed(2)})`;
                        }
                    })
                    .join(', ');
                  const musclesStr = `{${musclesEntries}}`;

                  let extraArgs = '';
                  if (load_multiplier !== 1.0) {
                    extraArgs += `, load_multiplier=${load_multiplier.toFixed(1)}`;
                  }
                  if (load_offset !== 0.0) {
                    extraArgs += `, load_offset=${load_offset.toFixed(1)}`;
                  }
                  if (is_isolation) {
                    extraArgs += `, is_isolation=True`;
                  }

                  const comma = idx < exercises.length - 1 ? ',' : '';
                  listCode += `    Exercise("${name}", ${musclesStr}, ${fatigue.toFixed(1)}, ${load_coeff.toFixed(2)}${extraArgs})${comma}\n`;
                });
                listCode += ']';

                const startToken = 'exercises_list = [';
                const startIndex = content.indexOf(startToken);
                if (startIndex === -1) {
                  throw new Error('Could not find exercises_list declaration in models.py');
                }

                const endToken = '\n]';
                const endIndex = content.indexOf(endToken, startIndex);
                if (endIndex === -1) {
                  throw new Error('Could not find end of exercises_list in models.py');
                }

                const before = content.substring(0, startIndex);
                const after = content.substring(endIndex + endToken.length);
                const updatedContent = before + listCode + after;

                fs.writeFileSync(analyzerPath, updatedContent, 'utf-8');

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
