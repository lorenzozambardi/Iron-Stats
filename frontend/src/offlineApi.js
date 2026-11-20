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

  let urlObj;
  try {
    urlObj = new URL(urlStr, window.location.origin);
  } catch {
    return originalFetch(input, init);
  }

  if (urlObj.origin !== window.location.origin || !urlObj.pathname.startsWith('/api/')) {
    return originalFetch(input, init);
  }
  if (!Capacitor.isNativePlatform()) return originalFetch(input, init);

  await defaultsReadyPromise;

  const rawMethod = init?.method || (input instanceof Request ? input.method : 'GET');
  const method  = String(rawMethod).toUpperCase();
  const { dirType, dir, safUri, subfolder } = getStorageConfig();
  const isCustom = dirType === 'custom' && safUri;

  const listDir = async (subpath = '') => {
    if (isCustom) {
      const res = await FolderPicker.listDirectory({ uri: safUri, subpath });
      return {
        files: Array.isArray(res?.files) ? res.files : [],
        directories: Array.isArray(res?.directories) ? res.directories : []
      };
    }
    const targetPath = subpath ? filePath(subpath) : (subfolder || '');
    const res = await Filesystem.readdir({ path: targetPath, directory: dir });
    const files = [];
    const directories = [];
    for (const entry of (res?.files || [])) {
      const name = typeof entry === 'string' ? entry : entry?.name;
      if (!name || name.startsWith('.')) continue;
      if (entry?.type === 'directory') {
        directories.push(name);
      } else {
        files.push(name);
      }
    }
    return { files, directories };
  };

  const getAvailableProfiles = async () => {
    try {
      const { directories } = await listDir('');
      return directories
        .filter((name) => typeof name === 'string' && name.toLowerCase() !== 'programs')
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  };

  const resolveProfileScope = async (rawProfile) => {
    const profiles = await getAvailableProfiles();
    const requested = sanitizeLogbookName(rawProfile);
    const selected = requested && profiles.includes(requested)
      ? requested
      : (profiles.includes('Lorenzo') ? 'Lorenzo' : (profiles[0] || ''));

    if (selected) {
      let hasProgramsSubdir = false;
      try {
        const { directories } = await listDir(selected);
        hasProgramsSubdir = directories.includes('Programs');
      } catch { /* ignore */ }
      return {
        profileName: selected,
        profilePath: `${selected}/profile.md`,
        programsDir: hasProgramsSubdir ? `${selected}/Programs` : selected,
      };
    }

    let hasProgramsSubdir = false;
    try {
      const { directories } = await listDir('');
      hasProgramsSubdir = directories.includes('Programs');
    } catch { /* ignore */ }
    return {
      profileName: '',
      profilePath: 'profile.md',
      programsDir: hasProgramsSubdir ? 'Programs' : '',
    };
  };

  const joinRel = (base, leaf) => (base ? `${base}/${leaf}` : leaf);

  const readRelFile = async (relPath) => {
    if (isCustom) {
      const res = await FolderPicker.readFile({ uri: safUri, filename: relPath });
      return res.data;
    }
    const res = await Filesystem.readFile({ path: filePath(relPath), directory: dir, encoding: Encoding.UTF8 });
    return res.data;
  };

  const writeRelFile = async (relPath, data) => {
    if (isCustom) {
      await FolderPicker.writeFile({ uri: safUri, filename: relPath, data });
    } else {
      await Filesystem.writeFile({ path: filePath(relPath), data, directory: dir, encoding: Encoding.UTF8, recursive: true });
    }
  };

  if (urlObj.pathname === '/api/profiles' && method === 'GET') {
    try {
      const profiles = await getAvailableProfiles();
      return new Response(JSON.stringify(profiles), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

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
    const jsonHeaders = { 'Content-Type': 'application/json' };
    if (method === 'GET') {
      try {
        const { programsDir } = await resolveProfileScope(urlObj.searchParams.get('profile'));
        let res;
        try {
          res = await listDir(programsDir);
        } catch (listErr) {
          if (!isCustom && /does not exist|not found/i.test(String(listErr?.message || ''))) {
            return new Response(JSON.stringify([]), { status: 200, headers: jsonHeaders });
          }
          throw listErr;
        }
        const names = (res.files || [])
          .filter(n => typeof n === 'string' && n.endsWith('.md') && n.toLowerCase() !== 'profile.md')
          .map(n => n.replace(/\.md$/, ''))
          .filter(n => sanitizeLogbookName(n).length > 0);
        return new Response(JSON.stringify(names), { status: 200, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e?.message || 'Failed to list programs' }), { status: 500, headers: jsonHeaders });
      }
    } else if (method === 'POST') {
      try {
        const bodyText = await readRequestBodyText(input, init);
        const data     = JSON.parse(bodyText);
        const { programsDir } = await resolveProfileScope(data.profile || urlObj.searchParams.get('profile'));
        const name     = sanitizeLogbookName(data.name);
        if (!name) {
          return new Response(JSON.stringify({ error: 'Invalid program name' }), { status: 400, headers: jsonHeaders });
        }
        if (name.toLowerCase() === 'profile') {
          return new Response(JSON.stringify({ error: 'Reserved program name' }), { status: 400, headers: jsonHeaders });
        }
        const filename = `${name}.md`;
        const fileContent = data.content || `# 1\nDates:\n\nLat machine | 3' |\n90.. 9+2, 7+2\n`;

        try {
          const listing = await listDir(programsDir);
          if ((listing.files || []).includes(filename)) {
            return new Response(JSON.stringify({ error: 'Program already exists' }), { status: 400, headers: jsonHeaders });
          }
        } catch { /* ignore if folder doesn't exist yet */ }
        await writeRelFile(joinRel(programsDir, filename), fileContent);

        return new Response(JSON.stringify({ success: true, name }), { status: 200, headers: jsonHeaders });
      } catch (e) {
        const status = e instanceof SyntaxError ? 400 : 500;
        return new Response(JSON.stringify({ error: e?.message || 'Failed to create program' }), { status, headers: jsonHeaders });
      }
    }
  }

  // ── /api/logbook ───────────────────────────────────────────────────────────
  if (urlObj.pathname === '/api/logbook') {
    const jsonHeaders = { 'Content-Type': 'application/json' };
    const { programsDir } = await resolveProfileScope(urlObj.searchParams.get('profile'));
    const rawProgram = urlObj.searchParams.get('program');
    const programName = rawProgram === null ? 'S1M3' : rawProgram;
    const cleanName   = sanitizeLogbookName(programName);
    if (!cleanName || cleanName.toLowerCase() === 'profile') {
      return new Response(JSON.stringify({ error: 'Invalid program name' }), { status: 400, headers: jsonHeaders });
    }
    const relPath = joinRel(programsDir, `${cleanName}.md`);

    if (method === 'GET') {
      try {
        const data = await readRelFile(relPath);
        return new Response(data, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } catch {
        return new Response(`Logbook file ${cleanName}.md not found`, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    } else if (method === 'POST') {
      try {
        const bodyText = await readRequestBodyText(input, init);
        await writeRelFile(relPath, bodyText);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e?.message || 'Failed to save logbook' }), { status: 500, headers: jsonHeaders });
      }
    }
  }

  // ── /api/profile ───────────────────────────────────────────────────────────
  if (urlObj.pathname === '/api/profile') {
    const jsonHeaders = { 'Content-Type': 'application/json' };
    const { profilePath } = await resolveProfileScope(urlObj.searchParams.get('profile'));
    if (method === 'GET') {
      try {
        const data = await readRelFile(profilePath);
        return new Response(data, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } catch {
        return new Response('profile.md not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    } else if (method === 'POST') {
      try {
        const bodyText = await readRequestBodyText(input, init);
        await writeRelFile(profilePath, bodyText);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e?.message || 'Failed to save profile' }), { status: 500, headers: jsonHeaders });
      }
    }
  }

  return originalFetch(input, init);
};
