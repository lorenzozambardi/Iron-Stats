import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import defaultExercises from './defaultExercises.json';
import { defaultLogbook } from './defaultLogbook.js';

const originalFetch = window.fetch;

// Initialize defaults if they don't exist
async function ensureDefaults() {
  try {
    const progs = await Filesystem.readdir({
      path: '',
      directory: Directory.Data
    });
    // check if S1M3.md exists
    if (!progs.files.some(f => f.name === 'S1M3.md')) {
      await Filesystem.writeFile({
        path: 'S1M3.md',
        data: defaultLogbook,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
    }
  } catch (e) {
    // maybe directory doesn't exist yet, write directly
    await Filesystem.writeFile({
      path: 'S1M3.md',
      data: defaultLogbook,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
  }
}

// Call once on load
ensureDefaults();

window.fetch = async (input, init) => {
  let urlStr = '';
  if (typeof input === 'string') urlStr = input;
  else if (input instanceof URL) urlStr = input.toString();
  else if (input instanceof Request) urlStr = input.url;

  // We only intercept relative paths or localhost /api/ paths
  if (!urlStr.includes('/api/')) {
    return originalFetch(input, init);
  }

  // Parse url
  const urlObj = new URL(urlStr, 'http://localhost');
  const method = init?.method || 'GET';

  if (urlObj.pathname === '/api/exercises') {
    if (method === 'GET') {
      try {
        const res = await Filesystem.readFile({
          path: 'exercises.json',
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        return new Response(res.data, { status: 200, headers: { 'Content-Type': 'application/json' }});
      } catch (e) {
        // Return defaults if file doesn't exist
        return new Response(JSON.stringify(defaultExercises), { status: 200, headers: { 'Content-Type': 'application/json' }});
      }
    } else if (method === 'POST') {
      try {
        const body = init.body;
        await Filesystem.writeFile({
          path: 'exercises.json',
          data: body,
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' }});
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
      }
    }
  }

  if (urlObj.pathname === '/api/programs') {
    if (method === 'GET') {
      try {
        const res = await Filesystem.readdir({
          path: '',
          directory: Directory.Data
        });
        const programs = res.files
          .map(f => f.name)
          .filter(name => name.endsWith('.md'))
          .map(name => name.replace('.md', ''));
        return new Response(JSON.stringify(programs), { status: 200, headers: { 'Content-Type': 'application/json' }});
      } catch (e) {
        // Return default S1M3 if readdir fails
        return new Response(JSON.stringify(['S1M3']), { status: 200, headers: { 'Content-Type': 'application/json' }});
      }
    } else if (method === 'POST') {
      try {
        const data = JSON.parse(init.body);
        const name = data.name.replace(/[^a-zA-Z0-9_-]/g, '');
        const filename = `${name}.md`;
        
        try {
          await Filesystem.stat({ path: filename, directory: Directory.Data });
          return new Response(JSON.stringify({ error: 'Program already exists' }), { status: 400 });
        } catch(e) {} // doesn't exist, proceed

        const defaultTemplate = `# 1\nLat machine | 3' |\n90..9+2.7+2\n`;
        await Filesystem.writeFile({
          path: filename,
          data: defaultTemplate,
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        return new Response(JSON.stringify({ success: true, name }), { status: 200, headers: { 'Content-Type': 'application/json' }});
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }
  }

  if (urlObj.pathname === '/api/logbook') {
    const programName = urlObj.searchParams.get('program') || 'S1M3';
    const cleanProgramName = programName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${cleanProgramName}.md`;

    if (method === 'GET') {
      try {
        const res = await Filesystem.readFile({
          path: filename,
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        return new Response(res.data, { status: 200, headers: { 'Content-Type': 'text/plain' }});
      } catch (e) {
        return new Response(`Logbook file ${cleanProgramName}.md not found`, { status: 404 });
      }
    } else if (method === 'POST') {
      try {
        await Filesystem.writeFile({
          path: filename,
          data: init.body,
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }
  }

  return originalFetch(input, init);
};
