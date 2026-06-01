import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { registerPlugin } from '@capacitor/core';
import defaultExercises from './defaultExercises.json';
import { defaultLogbook } from './defaultLogbook.js';

const originalFetch = window.fetch;

// Register the native FolderPicker plugin
const FolderPicker = registerPlugin('FolderPicker');

// ─── Storage Config ────────────────────────────────────────────────────────────
// dirType: 'documents' | 'data' | 'custom'
//   documents → public Documents/<subfolder>  (default, syncs with PC)
//   data      → private app sandbox/<subfolder>
//   custom    → any folder picked by the user via Android folder picker (SAF)

export function getStorageConfig() {
  const dirType        = localStorage.getItem('logbook_directory_type')    || 'documents';
  const subfolder      = localStorage.getItem('logbook_subfolder')         || 'Algorithmic Bodybuilding';
  const safUri         = localStorage.getItem('logbook_saf_uri')           || null;
  const safDisplayName = localStorage.getItem('logbook_saf_display_name') || safUri;
  const dir            = dirType === 'documents' ? Directory.Documents : Directory.Data;
  return { dirType, subfolder, dir, safUri, safDisplayName };
}

export function setStorageConfig(dirType, subfolder) {
  localStorage.setItem('logbook_directory_type', dirType);
  localStorage.setItem('logbook_subfolder', subfolder);
  if (dirType !== 'custom') {
    localStorage.removeItem('logbook_saf_uri');
    localStorage.removeItem('logbook_saf_display_name');
  }
}

// Launch the native folder picker; saves the chosen URI and reloads the page.
export async function pickDirectory() {
  const result = await FolderPicker.pickDirectory();
  localStorage.setItem('logbook_directory_type',    'custom');
  localStorage.setItem('logbook_saf_uri',           result.uri);
  localStorage.setItem('logbook_saf_display_name',  result.displayName || result.uri);
  return result;
}

// ─── Filesystem helpers (non-SAF) ──────────────────────────────────────────────

function filePath(filename) {
  const { subfolder } = getStorageConfig();
  return subfolder ? `${subfolder}/${filename}` : filename;
}

async function ensureDefaults() {
  const { dirType, dir, subfolder } = getStorageConfig();

  // Never auto-seed in custom (SAF) mode — the user chose an existing folder
  if (dirType === 'custom') return;

  // Ensure subfolder exists
  if (subfolder) {
    try { await Filesystem.mkdir({ path: subfolder, directory: dir, recursive: true }); }
    catch (e) { /* already exists */ }
  }

  // Seed S1M3.md if not present
  const defaultFile = filePath('S1M3.md');
  try {
    await Filesystem.stat({ path: defaultFile, directory: dir });
  } catch (e) {
    try {
      await Filesystem.writeFile({ path: defaultFile, data: defaultLogbook, directory: dir, encoding: Encoding.UTF8 });
    } catch (writeErr) {
      console.warn('Could not seed default logbook:', writeErr);
    }
  }
}

ensureDefaults();

// ─── Fetch Interceptor ─────────────────────────────────────────────────────────

window.fetch = async (input, init) => {
  let urlStr = '';
  if (typeof input === 'string') urlStr = input;
  else if (input instanceof URL) urlStr = input.toString();
  else if (input instanceof Request) urlStr = input.url;

  if (!urlStr.includes('/api/')) return originalFetch(input, init);

  const urlObj  = new URL(urlStr, 'http://localhost');
  const method  = init?.method || 'GET';
  const { dirType, dir, safUri } = getStorageConfig();
  const isCustom = dirType === 'custom' && safUri;

  // ── /api/exercises ────────────────────────────────────────────────────────
  if (urlObj.pathname === '/api/exercises') {
    if (method === 'GET') {
      try {
        if (isCustom) {
          const res = await FolderPicker.readFile({ uri: safUri, filename: 'exercises.json' });
          return new Response(res.data, { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else {
          const res = await Filesystem.readFile({ path: filePath('exercises.json'), directory: dir, encoding: Encoding.UTF8 });
          return new Response(res.data, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      } catch (e) {
        return new Response(JSON.stringify(defaultExercises), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (method === 'POST') {
      try {
        if (isCustom) {
          await FolderPicker.writeFile({ uri: safUri, filename: 'exercises.json', data: init.body });
        } else {
          await Filesystem.writeFile({ path: filePath('exercises.json'), data: init.body, directory: dir, encoding: Encoding.UTF8 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  // ── /api/programs ──────────────────────────────────────────────────────────
  if (urlObj.pathname === '/api/programs') {
    if (method === 'GET') {
      try {
        let names;
        if (isCustom) {
          const res = await FolderPicker.listDirectory({ uri: safUri });
          names = (res.files || [])
            .filter(n => n.endsWith('.md'))
            .map(n => n.replace('.md', ''));
        } else {
          const { subfolder } = getStorageConfig();
          const res = await Filesystem.readdir({ path: subfolder || '', directory: dir });
          names = res.files
            .map(f => f.name)
            .filter(n => n.endsWith('.md'))
            .map(n => n.replace('.md', ''));
        }
        return new Response(JSON.stringify(names), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify(['S1M3']), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (method === 'POST') {
      try {
        const data     = JSON.parse(init.body);
        const name     = data.name.replace(/[^a-zA-Z0-9_\- ()]/g, '');
        const filename = `${name}.md`;
        const template = `# 1\nLat machine | 3' |\n90..9+2.7+2\n`;

        if (isCustom) {
          // Check if it already exists
          try {
            const listing = await FolderPicker.listDirectory({ uri: safUri });
            if ((listing.files || []).includes(filename)) {
              return new Response(JSON.stringify({ error: 'Program already exists' }), { status: 400 });
            }
          } catch (_) {}
          await FolderPicker.writeFile({ uri: safUri, filename, data: template });
        } else {
          const fullPath = filePath(filename);
          try {
            await Filesystem.stat({ path: fullPath, directory: dir });
            return new Response(JSON.stringify({ error: 'Program already exists' }), { status: 400 });
          } catch (_) {}
          await Filesystem.writeFile({ path: fullPath, data: template, directory: dir, encoding: Encoding.UTF8 });
        }
        return new Response(JSON.stringify({ success: true, name }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }
  }

  // ── /api/logbook ───────────────────────────────────────────────────────────
  if (urlObj.pathname === '/api/logbook') {
    const programName = urlObj.searchParams.get('program') || 'S1M3';
    const cleanName   = programName.replace(/[^a-zA-Z0-9_\- ()]/g, '');
    const filename    = `${cleanName}.md`;

    if (method === 'GET') {
      try {
        if (isCustom) {
          const res = await FolderPicker.readFile({ uri: safUri, filename });
          return new Response(res.data, { status: 200, headers: { 'Content-Type': 'text/plain' } });
        } else {
          const res = await Filesystem.readFile({ path: filePath(filename), directory: dir, encoding: Encoding.UTF8 });
          return new Response(res.data, { status: 200, headers: { 'Content-Type': 'text/plain' } });
        }
      } catch (e) {
        return new Response(`Logbook file ${filename} not found`, { status: 404 });
      }
    } else if (method === 'POST') {
      try {
        if (isCustom) {
          await FolderPicker.writeFile({ uri: safUri, filename, data: init.body });
        } else {
          await Filesystem.writeFile({ path: filePath(filename), data: init.body, directory: dir, encoding: Encoding.UTF8 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }
  }

  return originalFetch(input, init);
};
