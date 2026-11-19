/*
	NesTwee on Android: provides the same `window.nestwee` API that the
	desktop app's preload script provides, but backed by files the person
	picks (or unzips) and by Android's storage and share sheet.

	The tablet app runs the desktop interface on top of this; the phone app
	uses it through its own simplified page.
*/

import { unzipSync } from 'fflate';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import engine from './engine-web.js';

const VERSION = typeof __NESTWEE_VERSION__ !== 'undefined' ? __NESTWEE_VERSION__ : '0.0.0';
const native = Capacitor.isNativePlatform();

// ------------------------------------------------------------ IndexedDB

const DB_NAME = 'nestwee';
let dbPromise = null;
function db() {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => {
				req.result.createObjectStore('library', { keyPath: 'id' });
				req.result.createObjectStore('formats', { keyPath: 'id' });
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}
	return dbPromise;
}
async function idb(store, mode, fn) {
	const d = await db();
	return new Promise((resolve, reject) => {
		const tx = d.transaction(store, mode);
		const req = fn(tx.objectStore(store));
		tx.oncomplete = () => resolve(req && req.result);
		tx.onerror = () => reject(tx.error);
	});
}
const idbGetAll = (store) => idb(store, 'readonly', (s) => s.getAll());
const idbPut = (store, value) => idb(store, 'readwrite', (s) => s.put(value));
const idbDelete = (store, key) => idb(store, 'readwrite', (s) => s.delete(key));

// ------------------------------------------------------------ picked files ("library")

/*
	Android can't hand an app a whole folder, so a "source" is a set of files:
	everything inside a picked .zip, or a group of picked files. Each set is
	shown in the interface with a reference like "hello-hawk.zip · 3 files".
*/
const library = new Map();
let libraryLoaded = null;
function loadLibrary() {
	if (!libraryLoaded) {
		libraryLoaded = idbGetAll('library')
			.then((items) => items.forEach((i) => library.set(i.ref, i)))
			.catch(() => {});
	}
	return libraryLoaded;
}

function stripCommonFolder(files) {
	if (files.length < 2 && !(files[0] && files[0].path.includes('/'))) return files;
	const first = files[0].path.split('/');
	if (first.length < 2) return files;
	const top = first[0] + '/';
	if (!files.every((f) => f.path.startsWith(top))) return files;
	return files.map((f) => ({ ...f, path: f.path.slice(top.length) }));
}

async function readPicked(fileList) {
	const groups = [];
	const loose = [];
	for (const file of fileList) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (/\.zip$/i.test(file.name)) {
			const entries = unzipSync(bytes);
			const files = Object.entries(entries)
				.filter(([p, b]) => !p.endsWith('/') && !p.startsWith('__MACOSX/') && b.length >= 0)
				.map(([p, b]) => ({ path: p, bytes: b }));
			groups.push({ label: file.name, kind: 'zip', files: stripCommonFolder(files) });
		} else {
			loose.push({ path: file.name, bytes });
		}
	}
	if (loose.length === 1) groups.push({ label: loose[0].path, kind: 'file', files: loose });
	else if (loose.length > 1) groups.push({ label: `${loose.length} picked files`, kind: 'files', files: loose });

	const refs = [];
	for (const g of groups) {
		const id = Math.random().toString(36).slice(2, 8);
		const count = g.files.length;
		const ref = g.kind === 'file' ? `${g.label} #${id}` : `${g.label} · ${count} file${count === 1 ? '' : 's'} #${id}`;
		const item = { ref, ...g, added: Date.now() };
		library.set(ref, item);
		idbPut('library', { id: ref, ...item }).catch(() => {});
		refs.push(ref);
	}
	return refs;
}

function pickWithInput({ multiple = true, accept = '' } = {}) {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = multiple;
		if (accept) input.accept = accept;
		input.style.display = 'none';
		document.body.append(input);
		let done = false;
		const finish = async () => {
			if (done) return;
			done = true;
			const refs = input.files && input.files.length ? await readPicked([...input.files]) : [];
			input.remove();
			resolve(refs);
		};
		input.addEventListener('change', finish);
		input.addEventListener('cancel', () => {
			done = true;
			input.remove();
			resolve([]);
		});
		input.click();
	});
}

function acceptFromFilters(filters) {
	if (!filters) return '';
	const exts = filters.flatMap((f) => f.extensions || []).filter((e) => e !== '*');
	if (!exts.length || filters.some((f) => (f.extensions || []).includes('*'))) return '';
	return [...exts.map((e) => '.' + e), '.zip'].join(',');
}

async function resolveRefs(refs) {
	await loadLibrary();
	const files = [];
	for (const r of refs || []) {
		const item = library.get(r);
		if (item) files.push(...item.files);
	}
	return files;
}

function forgetRef(ref) {
	library.delete(ref);
	idbDelete('library', ref).catch(() => {});
}

// ------------------------------------------------------------ story formats

let bundledFormats = null;
async function loadBundledFormats() {
	if (!bundledFormats) {
		bundledFormats = (async () => {
			const index = await (await fetch('formats/index.json')).json();
			return Promise.all(
				index.map(async (id) => ({ id, text: await (await fetch(`formats/${id}/format.js`)).text(), bundled: true }))
			);
		})();
	}
	return bundledFormats;
}

async function allFormats() {
	const bundled = await loadBundledFormats();
	let imported = [];
	try {
		imported = await idbGetAll('formats');
	} catch {
		/* ignore */
	}
	const byId = new Map();
	for (const f of bundled) byId.set(f.id, f);
	for (const f of imported) byId.set(f.id, { ...f, imported: true });
	return [...byId.values()];
}

// ------------------------------------------------------------ output files

const outputs = new Map(); // shown path → { name, text, uri }

function outName(p) {
	return String(p || 'story.html').split(/[\\/]/).pop() || 'story.html';
}

async function saveOutput(outFile, text) {
	const name = outName(outFile);
	const entry = { name, text, uri: null, where: '' };
	if (native) {
		const path = `NesTwee/${name}`;
		try {
			// Android 10 and older ask once for storage access; newer ones don't need it.
			const perm = await Filesystem.checkPermissions().catch(() => null);
			if (perm && perm.publicStorage !== 'granted') await Filesystem.requestPermissions().catch(() => null);
			const r = await Filesystem.writeFile({ path, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
			entry.uri = r.uri;
			entry.where = `Documents/NesTwee/${name}`;
		} catch {
			const r = await Filesystem.writeFile({ path, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
			entry.uri = r.uri;
			entry.where = `App storage/NesTwee/${name} (use Share to copy it elsewhere)`;
		}
	} else {
		entry.where = `Downloads/${name}`;
		downloadText(name, text);
	}
	outputs.set(entry.where, entry);
	return entry;
}

function downloadText(name, text) {
	const type = /\.html?$/i.test(name) ? 'text/html' : 'text/plain';
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function shareOutput(where) {
	const entry = outputs.get(where);
	if (!entry) return false;
	if (native) {
		let uri = entry.uri;
		if (!uri) return false;
		await Share.share({ title: entry.name, files: [uri], dialogTitle: `Share ${entry.name}` }).catch(() => {});
		return true;
	}
	const file = new File([entry.text], entry.name, { type: 'text/html' });
	if (navigator.canShare && navigator.canShare({ files: [file] })) {
		await navigator.share({ files: [file], title: entry.name }).catch(() => {});
		return true;
	}
	downloadText(entry.name, entry.text);
	return true;
}

/** Full-screen preview so a story can be played or proofread straight away. */
function previewOutput(where) {
	const entry = outputs.get(where);
	if (!entry) return false;
	let overlay = document.getElementById('nt-preview');
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = 'nt-preview';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.innerHTML =
			'<div class="nt-preview-bar"><strong class="nt-preview-title"></strong><button type="button" class="btn btn-primary nt-preview-close">Close</button></div><iframe class="nt-preview-frame" title="Story preview" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"></iframe>';
		document.body.append(overlay);
		overlay.querySelector('.nt-preview-close').addEventListener('click', () => {
			overlay.hidden = true;
			overlay.querySelector('iframe').srcdoc = '';
		});
	}
	overlay.querySelector('.nt-preview-title').textContent = entry.name;
	const frame = overlay.querySelector('iframe');
	frame.srcdoc = /\.html?$/i.test(entry.name) ? entry.text : `<pre style="white-space:pre-wrap;font:14px monospace;padding:1em">${entry.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</pre>`;
	overlay.hidden = false;
	overlay.querySelector('.nt-preview-close').focus();
	return true;
}

// ------------------------------------------------------------ the API

const STORE_KEY = 'nestwee-store';
function readStore() {
	try {
		return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
	} catch {
		return {};
	}
}

const CHARSETS = ['utf-8', 'utf-16le', 'utf-16be', 'iso-8859-1', 'iso-8859-2', 'iso-8859-15', 'windows-1250', 'windows-1251', 'windows-1252', 'koi8-r', 'shift_jis', 'euc-jp', 'gbk', 'big5', 'euc-kr'];

const api = {
	isMobile: true,

	async appInfo() {
		return {
			version: VERSION,
			platform: 'android',
			electron: null,
			systemDark: matchMedia('(prefers-color-scheme: dark)').matches,
			bundledFormatsDir: 'Built-in formats',
		};
	},

	// Folders can't be picked on Android, so both of these take files or .zip files.
	pickFolders: () => pickWithInput({ multiple: true, accept: '.zip,application/zip' }),
	pickFiles: (opts = {}) => pickWithInput({ multiple: opts.multiple !== false, accept: acceptFromFilters(opts.filters) }),
	async pickSave(opts = {}) {
		const ext = opts.filters && opts.filters[0] && opts.filters[0].extensions ? opts.filters[0].extensions[0] : 'html';
		let name = outName(opts.defaultPath || '');
		if (!name || !name.includes('.')) name = `story.${ext}`;
		return `NesTwee/${name}`;
	},

	async scan(refs, opts = {}) {
		const files = await resolveRefs(refs);
		const counts = {};
		const list = [];
		let ignored = 0;
		for (const f of files) {
			if (opts.skipHidden && f.path.split('/').some((s) => s.startsWith('.'))) continue;
			const kind = engine.fileKind(f.path);
			if (!kind) {
				ignored++;
				continue;
			}
			counts[kind] = (counts[kind] || 0) + 1;
			list.push({ path: f.path, kind });
		}
		const missing = (refs || []).filter((r) => !library.has(r));
		const warnings = missing.map((r) => `${r}: These files are no longer stored. Remove it and pick them again.`);
		return { files: list, counts, warnings, total: list.length, ignored };
	},

	async listFormats() {
		const formats = [];
		const warnings = [];
		for (const f of await allFormats()) {
			try {
				const info = engine.describeFormat(f.text, f.id);
				formats.push({ ...info, filename: `${f.imported ? 'Imported formats' : 'Built-in formats'}/${f.id}/format.js` });
			} catch (err) {
				warnings.push(`format ${f.id}: Skipping format; ${err.message}`);
			}
		}
		formats.sort((a, b) => a.id.localeCompare(b.id));
		return {
			searchDirs: [
				{ path: 'Built-in formats', exists: true, bundled: true },
				{ path: 'Imported formats', exists: true, imported: true },
			],
			formats,
			warnings,
			importedDir: 'Imported formats',
		};
	},

	async importFormat(ref) {
		try {
			const [file] = await resolveRefs([ref]);
			forgetRef(ref);
			if (!file) throw new Error('No file was chosen.');
			const text = new TextDecoder().decode(file.bytes);
			const info = engine.describeFormat(text);
			if (!info.name || !info.version) throw new Error('This file has no name or version, so it is not a Twine 2 story format.');
			const id = `${info.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${(info.version.match(/^\d+/) || ['1'])[0]}`;
			await idbPut('formats', { id, text });
			return { ok: true, id, name: info.name, version: info.version, proofing: info.proofing, folder: 'Imported formats' };
		} catch (err) {
			return { ok: false, error: err.message };
		}
	},

	async removeImportedFormat(id) {
		await idbDelete('formats', id);
		return { ok: true };
	},

	charsets: async () => CHARSETS,
	newIFID: async () => engine.newIFID(),

	async build(config) {
		const started = Date.now();
		const sources = await resolveRefs(config.sources);
		const modules = await resolveRefs(config.modules);
		const [head] = config.headFile ? await resolveRefs([config.headFile]) : [];
		if (!sources.length) {
			return { ok: false, log: [{ level: 'error', message: 'No story files were chosen. Add a .zip of your project or pick its files.', time: Date.now() }] };
		}
		const res = engine.build({
			sources,
			modules,
			head: head || null,
			formats: await allFormats(),
			cfg: { ...config, outFile: config.outFile || 'NesTwee/story.html' },
			creatorVersion: VERSION,
		});
		if (!res.ok) return res;
		const saved = await saveOutput(config.outFile, res.output);
		res.log.push({ level: 'success', message: `Built ${saved.name} in ${Date.now() - started} ms (${res.stats.storyPassages} story passages). Saved to ${saved.where}.`, time: Date.now() });
		return { ok: true, outFile: saved.where, stats: res.stats, log: res.log, text: res.output };
	},

	// Android has no folder watching for picked files; watching just builds once.
	async watchStart(config) {
		const first = await api.build(config);
		return { ok: true, watching: 0, first };
	},
	watchStop: async () => ({ ok: true }),
	onWatchLog: () => () => {},
	onWatchState: () => () => {},

	loadStore: async () => readStore(),
	async saveStore(key, value) {
		const s = readStore();
		s[key] = value;
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify(s));
		} catch {
			/* storage full or blocked */
		}
		return true;
	},

	openPath: async (p) => previewOutput(p),
	showInFolder: async (p) => shareOutput(p),
	shareOutput: async (p) => shareOutput(p),
	previewOutput: async (p) => previewOutput(p),
	forgetSource: async (ref) => forgetRef(ref),
	openExternal: async (url) => {
		if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener');
	},
	copyText: async (text) => {
		try {
			await navigator.clipboard.writeText(String(text));
		} catch {
			/* ignore */
		}
	},
};

window.nestwee = api;
loadLibrary();
