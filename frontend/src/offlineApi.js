import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { registerPlugin, Capacitor } from '@capacitor/core';
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
  const rawSubfolder   = localStorage.getItem('logbook_subfolder');
  const subfolder      = rawSubfolder === null ? 'Iron Stats' : rawSubfolder;
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
  if (!Capacitor.isNativePlatform()) return;
  const { dirType, dir, subfolder } = getStorageConfig();

  // Never auto-seed in custom (SAF) mode — the user chose an existing folder
  if (dirType === 'custom') return;

  // Ensure subfolder exists
  if (subfolder) {
    try { await Filesystem.mkdir({ path: subfolder, directory: dir, recursive: true }); }
    catch { /* already exists */ }
  }

  // Seed S1M3.md if not present
  const defaultFile = filePath('S1M3.md');
  try {
    await Filesystem.stat({ path: defaultFile, directory: dir });
  } catch {
    try {
      await Filesystem.writeFile({ path: defaultFile, data: defaultLogbook, directory: dir, encoding: Encoding.UTF8, recursive: true });
    } catch (writeErr) {
      console.warn('Could not seed default logbook:', writeErr);
    }
  }
}

const defaultsReadyPromise = ensureDefaults();

async function readRequestBodyText(input, init) {
  if (init?.body !== undefined && init?.body !== null) {
    return typeof init.body === 'string' ? init.body : String(init.body);
  }
  if (input instanceof Request) {
    return input.clone().text();
  }
  return '';
}

function sanitizeLogbookName(rawName) {
  const trimmed = (rawName || '').trim();
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[/\\]/.test(trimmed) || trimmed.includes('..')) {
    return '';
  }
  return trimmed;
}

// ─── Fetch Interceptor ─────────────────────────────────────────────────────────

window.fetch = async (input, init) => {
  let urlStr = '';
  if (typeof input === 'string') urlStr = input;
  else if (input instanceof URL) urlStr = input.toString();
  else if (input instanceof Request) urlStr = input.url;

  if (!urlStr.includes('/api/')) return originalFetch(input, init);
  if (!Capacitor.isNativePlatform()) return originalFetch(input, init);

  await defaultsReadyPromise;

  const urlObj  = new URL(urlStr, 'http://localhost');
  const rawMethod = init?.method || (input instanceof Request ? input.method : 'GET');
  const method  = String(rawMethod).toUpperCase();
  const { dirType, dir, safUri } = getStorageConfig();
  const isCustom = dirType === 'custom' && safUri;

  if (urlObj.pathname === '/api/exercises/reset') {
    if (method === 'POST') {
      try {
        if (isCustom) {
          await FolderPicker.writeFile({ uri: safUri, filename: 'exercises_v6.json', data: JSON.stringify(defaultExercises) });
        } else {
          await Filesystem.writeFile({ path: filePath('exercises_v6.json'), data: JSON.stringify(defaultExercises), directory: dir, encoding: Encoding.UTF8, recursive: true });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  // ── /api/exercises ────────────────────────────────────────────────────────
  if (urlObj.pathname === '/api/exercises') {
    if (method === 'GET') {
      try {
        const res = isCustom
          ? await FolderPicker.readFile({ uri: safUri, filename: 'exercises_v6.json' })
          : await Filesystem.readFile({ path: filePath('exercises_v6.json'), directory: dir, encoding: Encoding.UTF8 });
        const raw = typeof res?.data === 'string' ? res.data : '';
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new TypeError('Stored exercises_v6.json is not an array');
        }
        return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch {
        return new Response(JSON.stringify(defaultExercises), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (method === 'POST') {
      try {
        const bodyText = await readRequestBodyText(input, init);
        const parsed = JSON.parse(bodyText);
        if (!Array.isArray(parsed)) {
          return new Response(JSON.stringify({ error: 'Exercises payload must be a JSON array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        if (isCustom) {
          await FolderPicker.writeFile({ uri: safUri, filename: 'exercises_v6.json', data: bodyText });
        } else {
          await Filesystem.writeFile({ path: filePath('exercises_v6.json'), data: bodyText, directory: dir, encoding: Encoding.UTF8, recursive: true });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        const status = e instanceof SyntaxError ? 400 : 500;
        return new Response(JSON.stringify({ error: e.message }), { status, headers: { 'Content-Type': 'application/json' } });
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
            .filter(n => typeof n === 'string' && n.endsWith('.md'))
            .map(n => n.replace(/\.md$/, ''))
            .filter(n => sanitizeLogbookName(n).length > 0);
        } else {
          const { subfolder } = getStorageConfig();
          const res = await Filesystem.readdir({ path: subfolder || '', directory: dir });
          names = res.files
            .map(f => f.name)
            .filter(n => typeof n === 'string' && n.endsWith('.md'))
            .map(n => n.replace(/\.md$/, ''))
            .filter(n => sanitizeLogbookName(n).length > 0);
        }
        return new Response(JSON.stringify(names), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch {
        return new Response(JSON.stringify(['S1M3']), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (method === 'POST') {
      try {
        const bodyText = await readRequestBodyText(input, init);
        const data     = JSON.parse(bodyText);
        const name     = (data.name || '').replace(/[^a-zA-Z0-9_\- ()]/g, '').trim();
        if (!name) {
          return new Response(JSON.stringify({ error: 'Invalid program name' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const filename = `${name}.md`;
        const fileContent = data.content || `# 1\nDates:\n\nLat machine | 3' |\n90.. 9+2, 7+2\n`;

        if (isCustom) {
          // Check if it already exists
          try {
            const listing = await FolderPicker.listDirectory({ uri: safUri });
            if ((listing.files || []).includes(filename)) {
              return new Response(JSON.stringify({ error: 'Program already exists' }), { status: 400 });
            }
          } catch { /* ignore */ }
          await FolderPicker.writeFile({ uri: safUri, filename, data: fileContent });
        } else {
          const fullPath = filePath(filename);
          try {
            await Filesystem.stat({ path: fullPath, directory: dir });
            return new Response(JSON.stringify({ error: 'Program already exists' }), { status: 400 });
          } catch { /* ignore */ }
          await Filesystem.writeFile({ path: fullPath, data: fileContent, directory: dir, encoding: Encoding.UTF8, recursive: true });
        }
        return new Response(JSON.stringify({ success: true, name }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }
  }

  // ── /api/logbook ───────────────────────────────────────────────────────────
  if (urlObj.pathname === '/api/logbook') {
    const rawProgram = urlObj.searchParams.get('program');
    const programName = rawProgram === null ? 'S1M3' : rawProgram;
    const cleanName   = sanitizeLogbookName(programName);
    if (!cleanName) {
      return new Response(JSON.stringify({ error: 'Invalid program name' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
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
      } catch {
        return new Response(`Logbook file ${filename} not found`, { status: 404 });
      }
    } else if (method === 'POST') {
      try {
        const bodyText = await readRequestBodyText(input, init);
        if (isCustom) {
          await FolderPicker.writeFile({ uri: safUri, filename, data: bodyText });
        } else {
          await Filesystem.writeFile({ path: filePath(filename), data: bodyText, directory: dir, encoding: Encoding.UTF8, recursive: true });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }
  }

  return originalFetch(input, init);
};
