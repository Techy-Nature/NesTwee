/*
	NesTwee on Android: provides the same `window.nestwee` API that the
	desktop app's preload script provides, but backed by files the person
	picks (or unzips) and by Android's storage and share sheet.

	The tablet app runs the desktop interface on top of this; the phone app
	uses it through its own simplified page.
*/

import { unzipSync } from 'fflate';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import engine from './engine-web.js';

const VERSION = typeof __NESTWEE_VERSION__ !== 'undefined' ? __NESTWEE_VERSION__ : '0.0.0';
const native = Capacitor.isNativePlatform();
// NesTwee's own Android plugin (android/app/src/main/java/.../FolderAccessPlugin.java).
const FolderAccess = registerPlugin('FolderAccess');

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
	A "source" is one of:
	- a folder the person gave NesTwee permission for (read fresh on every
	  build, so edits are picked up), shown like "hello-hawk/ · folder";
	- everything inside a picked .zip, shown like "hello-hawk.zip · 3 files";
	- a group of picked files.
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

	return groups.map((g) => {
		const count = g.files.length;
		const label = g.kind === 'file' ? g.label : `${g.label} · ${count} file${count === 1 ? '' : 's'}`;
		return addLibraryItem(label, g.kind, { files: g.files });
	});
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

function addLibraryItem(label, kind, extra) {
	const id = Math.random().toString(36).slice(2, 8);
	const ref = `${label} #${id}`;
	const item = { ref, label, kind, ...extra, added: Date.now() };
	library.set(ref, item);
	idbPut('library', { id: ref, ...item }).catch(() => {});
	return ref;
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Asks which folder to add when some folders already have permission.
 * Resolves to one of those folders, 'pick' for Android's folder picker, or null.
 */
function chooseGrantedFolder(folders, { title = 'Add a folder', defaultLabel = '', defaultPlace = '' } = {}) {
	return new Promise((resolve) => {
		const back = document.activeElement;
		const wrap = document.createElement('div');
		wrap.id = 'nt-folders';
		wrap.setAttribute('role', 'dialog');
		wrap.setAttribute('aria-modal', 'true');
		wrap.setAttribute('aria-labelledby', 'nt-folders-title');
		wrap.innerHTML =
			`<div class="nt-folders-sheet"><h2 id="nt-folders-title">${esc(title)}</h2>` +
			(defaultLabel ? `<button type="button" class="btn" data-default><span>${esc(defaultLabel)}<small>${esc(defaultPlace)}</small></span></button>` : '') +
			folders
				.map((f, i) => `<button type="button" class="btn" data-i="${i}"><span>${esc(f.name)}<small>${esc(f.place)}</small></span></button>`)
				.join('') +
			'<button type="button" class="btn btn-primary" data-pick>Choose another folder…</button>' +
			'<button type="button" class="btn btn-quiet" data-cancel>Cancel</button></div>';
		const done = (value) => {
			wrap.remove();
			document.removeEventListener('keydown', onKey, true);
			if (back && back.focus) back.focus();
			resolve(value);
		};
		const onKey = (e) => {
			if (e.key === 'Escape') done(null);
		};
		wrap.addEventListener('click', (e) => {
			if (e.target === wrap) return done(null);
			const b = e.target.closest('button');
			if (!b) return;
			if (b.hasAttribute('data-cancel')) done(null);
			else if (b.hasAttribute('data-pick')) done('pick');
			else if (b.hasAttribute('data-default')) done('default');
			else done(folders[+b.dataset.i]);
		});
		document.addEventListener('keydown', onKey, true);
		document.body.append(wrap);
		wrap.querySelector('button').focus();
	});
}

async function grantedFolders() {
	if (!native) return [];
	try {
		return ((await FolderAccess.list()).folders || []).filter((f) => f.available !== false);
	} catch {
		return [];
	}
}

const folderRef = (f) => addLibraryItem(`${f.name}/ · folder`, 'folder', { uri: f.uri, place: f.place || f.name, files: [] });

/** Adds a folder source: one that already has permission, or a new one from Android's picker. */
async function pickNativeFolder() {
	let granted = [];
	try {
		granted = ((await FolderAccess.list()).folders || []).filter((f) => f.available !== false);
	} catch {
		/* ignore */
	}
	if (granted.length) {
		const choice = await chooseGrantedFolder(granted);
		if (!choice) return null;
		if (choice !== 'pick') return folderRef(choice);
	}
	const r = await FolderAccess.pick();
	if (!r || r.cancelled || !r.uri) return null;
	return folderRef(r);
}

/** Folder picking in an ordinary browser (for trying the interface on a computer). */
function pickBrowserFolder() {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.webkitdirectory = true;
		input.style.display = 'none';
		document.body.append(input);
		input.addEventListener('change', async () => {
			const list = [...(input.files || [])];
			input.remove();
			if (!list.length) return resolve([]);
			const files = await Promise.all(
				list.map(async (f) => ({ path: f.webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
			);
			const top = (files[0].path.split('/')[0] || 'folder');
			resolve([addLibraryItem(`${top}/ · ${files.length} files`, 'zip', { files: stripCommonFolder(files) })]);
		});
		input.addEventListener('cancel', () => {
			input.remove();
			resolve([]);
		});
		input.click();
	});
}

function base64ToBytes(b64) {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Lists a granted folder: [{ path, id, size }]. */
async function listFolder(item) {
	const r = await FolderAccess.listTree({ uri: item.uri });
	return r.files || [];
}

/** Reads the story files in a granted folder (only the kinds NesTwee uses). */
/** True when `path` (inside a granted folder) is where the build is being saved. */
function isOutputFile(item, path, outFile) {
	return !!outFile && `${item.place}/${path}` === String(outFile);
}

/** Plain words for the errors a too-big story causes in the browser. */
function tooBigMessage(err) {
	const m = (err && err.message) || String(err);
	if (/invalid string length|out of memory|allocation failed|array buffer allocation/i.test(m)) {
		return 'This story is too big for this device\'s memory. Large music, video or image files in the folder are the usual cause: move them out of the story folder, or build on a computer.';
	}
	return m;
}

const READ_BATCH_BYTES = 6 * 1024 * 1024;

async function readFolder(item, { skipHidden = false, outFile = '', log = null } = {}) {
	const listed = (await listFolder(item)).filter(
		(f) =>
			engine.fileKind(f.path) &&
			!(skipHidden && f.path.split('/').some((s) => s.startsWith('.'))) &&
			!isOutputFile(item, f.path, outFile)
	);
	const files = [];
	// Read in small batches (by count and by size) so big music or image files
	// never have to cross from Android to the app all at once.
	const batches = [];
	let batch = [];
	let bytes = 0;
	for (const f of listed) {
		if (batch.length && (batch.length >= 40 || bytes + (f.size || 0) > READ_BATCH_BYTES)) {
			batches.push(batch);
			batch = [];
			bytes = 0;
		}
		batch.push(f);
		bytes += f.size || 0;
	}
	if (batch.length) batches.push(batch);
	for (const b of batches) {
		const r = await FolderAccess.readFiles({ uri: item.uri, ids: b.map((f) => f.id) });
		const byId = new Map((r.files || []).map((f) => [f.id, f]));
		for (const f of b) {
			const got = byId.get(f.id);
			if (!got) continue;
			if (got.skipped) {
				if (log) log({ level: 'warn', message: `Skipped ${f.path}: ${got.skipped}.`, time: Date.now() });
				continue;
			}
			files.push({ path: f.path, bytes: base64ToBytes(got.data) });
		}
	}
	return files;
}

async function resolveRefs(refs, opts = {}) {
	await loadLibrary();
	const files = [];
	for (const r of refs || []) {
		const item = library.get(r);
		if (!item) continue;
		if (item.kind === 'folder') {
			try {
				files.push(...(await readFolder(item, opts)));
			} catch (err) {
				throw new Error(`${item.label.replace(/ · folder$/, '')}: ${err.message || err}`);
			}
		} else files.push(...item.files);
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

const DEFAULT_SAVE_DIR = 'NesTwee';

/** "Stories/my-story/story.html" → the granted folder "Stories/my-story", if there is one. */
async function exportFolderFor(outFile) {
	const dir = String(outFile || '').split('/').slice(0, -1).join('/');
	if (!dir || dir === DEFAULT_SAVE_DIR) return null;
	return (await grantedFolders()).find((f) => f.place === dir) || null;
}

async function saveOutput(outFile, text, log = () => {}) {
	const name = outName(outFile);
	const entry = { name, text, uri: null, where: '' };
	const folder = native ? await exportFolderFor(outFile) : null;
	if (folder) {
		try {
			const mime = /\.html?$/i.test(name) ? 'text/html' : 'application/octet-stream';
			await FolderAccess.writeFile({ uri: folder.uri, name, data: text, mime });
			entry.where = `${folder.place}/${name}`;
			// A private copy for the share sheet, which can't share folder files directly.
			const c = await Filesystem.writeFile({ path: `share/${name}`, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
			entry.uri = c.uri;
			outputs.set(entry.where, entry);
			return entry;
		} catch (err) {
			log({ level: 'warn', message: `Couldn't save into ${folder.place} (${err.message || err}). Saving to Documents/NesTwee instead.`, time: Date.now() });
		}
	} else if (native && outFile && !String(outFile).startsWith(DEFAULT_SAVE_DIR + '/') && String(outFile).includes('/')) {
		log({ level: 'warn', message: `NesTwee doesn't have permission for the folder in "${outFile}". Saving to Documents/NesTwee instead. Give permission in the Accessibility settings to save there.`, time: Date.now() });
	}
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

// ------------------------------------------------------------ watch mode helpers

let watcher = null;
const watchLogFns = new Set();
const watchStateFns = new Set();
const emitLog = (e) => watchLogFns.forEach((fn) => fn(e));
const emitState = (st) => watchStateFns.forEach((fn) => fn(st));

/** A fingerprint of every file (path, size, time) in the watched folders. */
async function watchSignature(folders, config) {
	const parts = [];
	for (const item of folders) {
		const files = await listFolder(item);
		for (const f of files) {
			if (!engine.fileKind(f.path)) continue;
			if (config.skipHidden && f.path.split('/').some((x) => x.startsWith('.'))) continue;
			// Skip the output itself if it's being saved inside a watched folder.
			if (isOutputFile(item, f.path, config.outFile)) continue;
			parts.push(`${item.uri}|${f.path}|${f.size}|${f.modified || 0}`);
		}
	}
	return parts.sort().join('\n');
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

	// Folders come from Android's folder picker (which grants permission);
	// .zip files can be picked through pickFiles or pickZips.
	async pickFolders() {
		if (!native) return pickBrowserFolder();
		const ref = await pickNativeFolder();
		return ref ? [ref] : [];
	},
	pickZips: () => pickWithInput({ multiple: true, accept: '.zip,application/zip' }),
	pickFiles: (opts = {}) => pickWithInput({ multiple: opts.multiple !== false, accept: acceptFromFilters(opts.filters) }),
	/**
	 * Where to save: Documents/NesTwee, or a folder NesTwee has permission for.
	 * Returns "<folder>/<name>", e.g. "NesTwee/story.html" or "Stories/my-story/story.html".
	 */
	async pickSave(opts = {}) {
		const ext = opts.filters && opts.filters[0] && opts.filters[0].extensions ? opts.filters[0].extensions[0] : 'html';
		let name = outName(opts.defaultPath || '');
		if (!name || !name.includes('.')) name = `story.${ext}`;
		if (!native) return `${DEFAULT_SAVE_DIR}/${name}`;
		const dir = await api.chooseExportFolder();
		return dir === null ? null : `${dir}/${name}`;
	},

	/** Asks where builds go. Resolves to a folder place, "NesTwee" for the default, or null. */
	async chooseExportFolder() {
		if (!native) return DEFAULT_SAVE_DIR;
		const choice = await chooseGrantedFolder(await grantedFolders(), {
			title: 'Save builds to',
			defaultLabel: 'Documents/NesTwee',
			defaultPlace: 'The default',
		});
		if (!choice) return null;
		if (choice === 'default') return DEFAULT_SAVE_DIR;
		if (choice !== 'pick') return choice.place;
		const r = await FolderAccess.pick();
		return r && !r.cancelled && r.uri ? r.place || r.name : null;
	},

	async scan(refs, opts = {}) {
		await loadLibrary();
		const files = [];
		const warnings = [];
		for (const r of refs || []) {
			const item = library.get(r);
			if (!item) continue;
			if (item.kind !== 'folder') {
				files.push(...item.files);
				continue;
			}
			try {
				files.push(...(await listFolder(item)).filter((f) => !isOutputFile(item, f.path, opts.outFile)));
			} catch (err) {
				warnings.push(`${r}: ${err.message || err}`);
			}
		}
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
		for (const r of missing) warnings.push(`${r}: These files are no longer stored. Remove it and pick them again.`);
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
		let sources, modules, head;
		const early = [];
		try {
			const opts = { skipHidden: !!config.skipHidden, outFile: config.outFile, log: (e) => early.push(e) };
			sources = await resolveRefs(config.sources, opts);
			modules = await resolveRefs(config.modules, opts);
			[head] = config.headFile ? await resolveRefs([config.headFile]) : [];
		} catch (err) {
			return { ok: false, log: [{ level: 'error', message: err.message || String(err), time: Date.now() }] };
		}
		if (!sources.length) {
			return { ok: false, log: [{ level: 'error', message: 'No story files were chosen. Add your story folder, a .zip of it, or its files.', time: Date.now() }] };
		}
		let res;
		try {
			res = engine.build({
				sources,
				modules,
				head: head || null,
				formats: await allFormats(),
				cfg: { ...config, outFile: config.outFile || 'NesTwee/story.html' },
				creatorVersion: VERSION,
			});
		} catch (err) {
			return { ok: false, log: [...early, { level: 'error', message: tooBigMessage(err), time: Date.now() }] };
		}
		if (!res.ok) return res;
		res.log.unshift(...early);
		let saved;
		try {
			saved = await saveOutput(config.outFile, res.output, (e) => res.log.push(e));
		} catch (err) {
			res.log.push({ level: 'error', message: `Built, but couldn't save: ${tooBigMessage(err)}`, time: Date.now() });
			return { ok: false, log: res.log };
		}
		res.log.push({ level: 'success', message: `Built ${saved.name} in ${Date.now() - started} ms (${res.stats.storyPassages} story passages). Saved to ${saved.where}.`, time: Date.now() });
		return { ok: true, outFile: saved.where, stats: res.stats, log: res.log, text: res.output };
	},

	/*
		Watch mode: folder sources are checked every couple of seconds (and
		whenever the app comes back to the screen), and the story is rebuilt
		when a file is added, removed or changed. A .zip or picked files are a
		snapshot, so only folders are watched.
	*/
	async watchStart(config) {
		await api.watchStop();
		const first = await api.build(config);
		// Show the first build's messages in the log, as the desktop app does.
		for (const e of first.log || []) emitLog(e);
		await loadLibrary();
		const refs = [...(config.sources || []), ...(config.modules || []), ...(config.headFile ? [config.headFile] : [])];
		const folders = refs.map((r) => library.get(r)).filter((i) => i && i.kind === 'folder');
		if (!folders.length) {
			emitLog({ level: 'warn', message: 'Watch mode only follows folders. Add your story with Add folder (not a .zip or picked files) to rebuild automatically.', time: Date.now() });
			emitState({ watching: false });
			return { ok: true, watching: 0, first };
		}
		const w = { config, folders, signature: await watchSignature(folders, config), busy: false, timer: null };
		const check = async () => {
			if (watcher !== w || w.busy) return;
			w.busy = true;
			try {
				const sig = await watchSignature(w.folders, w.config);
				if (watcher === w && sig !== w.signature) {
					w.signature = sig;
					emitLog({ level: 'info', message: `CHANGED: rebuilding ${outName(w.config.outFile)}`, time: Date.now() });
					const r = await api.build(w.config);
					for (const e of r.log || []) emitLog(e);
					if (watcher === w) emitState({ watching: true, lastBuild: { ok: r.ok, time: Date.now(), outFile: r.outFile, result: r } });
				}
			} catch (err) {
				emitLog({ level: 'error', message: err.message || String(err), time: Date.now() });
			} finally {
				w.busy = false;
			}
		};
		w.timer = setInterval(check, 2000);
		w.onVisible = () => document.visibilityState === 'visible' && check();
		document.addEventListener('visibilitychange', w.onVisible);
		watcher = w;
		emitState({ watching: true, lastBuild: { ok: first.ok, time: Date.now(), outFile: first.outFile, result: first } });
		return { ok: true, watching: folders.length, first };
	},
	async watchStop() {
		if (!watcher) return { ok: true };
		clearInterval(watcher.timer);
		document.removeEventListener('visibilitychange', watcher.onVisible);
		watcher = null;
		emitState({ watching: false });
		return { ok: true };
	},
	onWatchLog: (fn) => (watchLogFns.add(fn), () => watchLogFns.delete(fn)),
	onWatchState: (fn) => (watchStateFns.add(fn), () => watchStateFns.delete(fn)),

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

	/** Folder permissions, managed from the Accessibility settings. */
	folderAccess: {
		available: native,
		async list() {
			if (!native) return [];
			const r = await FolderAccess.list().catch(() => ({ folders: [] }));
			return r.folders || [];
		},
		async grant() {
			if (!native) return null;
			const r = await FolderAccess.pick();
			return r && !r.cancelled ? r : null;
		},
		async release(uri) {
			if (!native) return;
			await FolderAccess.release({ uri }).catch(() => {});
			// Sources that used this folder can't be read any more.
			for (const [ref, item] of library) if (item.kind === 'folder' && item.uri === uri) forgetRef(ref);
		},
	},
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

// ------------------------------------------------------------ folder permissions card

/**
 * Fills `box` with the "Folder permissions" settings: a button that asks
 * Android for permission to a folder, and the folders that have it.
 * Used by the Accessibility settings in both the phone and tablet apps.
 */
function renderFolderSettings(box, { toast = () => {} } = {}) {
	const fa = api.folderAccess;
	box.innerHTML = '';
	const h = document.createElement('h3');
	h.textContent = 'Folder permissions';
	const p = document.createElement('p');
	p.className = 'small muted';
	p.textContent = fa.available
		? 'Give NesTwee permission to open your story folders. Android shows its folder picker: pick the folder that holds your story. NesTwee can then read it and its subfolders every time you build, so your latest edits are always used. Folders listed here appear when you tap Add folder, and when you choose where to save builds.'
		: 'Folder permissions are part of the Android app. In a browser, Add folder asks for a folder each time.';
	const grantBtn = document.createElement('button');
	grantBtn.type = 'button';
	grantBtn.className = 'btn btn-primary nt-grant';
	grantBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-folder"/></svg>Give folder permission…';
	grantBtn.hidden = !fa.available;
	const list = document.createElement('ul');
	list.className = 'path-list nt-granted';
	list.dataset.empty = 'No folders have permission yet.';
	list.setAttribute('aria-label', 'Folders NesTwee has permission for');
	box.append(h, p, grantBtn, list);

	const refresh = async () => {
		const folders = await fa.list();
		list.replaceChildren(
			...folders.map((f) => {
				const li = document.createElement('li');
				li.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-folder"/></svg>';
				const span = document.createElement('span');
				span.className = 'path';
				span.title = f.place;
				span.textContent = f.available === false ? `${f.place} (not found)` : f.place;
				const revoke = document.createElement('button');
				revoke.type = 'button';
				revoke.className = 'btn btn-quiet';
				revoke.textContent = 'Remove';
				revoke.setAttribute('aria-label', `Remove permission for ${f.name}`);
				revoke.addEventListener('click', async () => {
					await fa.release(f.uri);
					toast(`NesTwee no longer has permission for ${f.name}.`);
					refresh();
				});
				li.append(span, revoke);
				return li;
			})
		);
	};
	grantBtn.addEventListener('click', async () => {
		const f = await fa.grant();
		if (f) toast(`NesTwee can now open ${f.name}.`, 'success');
		refresh();
	});
	refresh();
	return refresh;
}

/** After the page had to restart (a build used up the memory), says what happened. */
async function showCrashNote() {
	if (!native) return;
	let note = '';
	try {
		note = (await FolderAccess.takeCrashNote()).note;
	} catch {
		return;
	}
	if (!note) return;
	const wrap = document.createElement('div');
	wrap.id = 'nt-folders';
	wrap.setAttribute('role', 'alertdialog');
	wrap.setAttribute('aria-modal', 'true');
	wrap.setAttribute('aria-labelledby', 'nt-crash-title');
	wrap.innerHTML =
		'<div class="nt-folders-sheet"><h2 id="nt-crash-title">NesTwee had to restart</h2>' +
		'<p>The last build needed more memory than this device could give it. This usually means the story folder holds large music, video or image files, which get packed into the built story.</p>' +
		'<p>Move big media out of the story folder (and link to it instead), or build this story on a computer.</p>' +
		'<button type="button" class="btn btn-primary" data-ok>OK</button></div>';
	wrap.addEventListener('click', (e) => {
		if (e.target === wrap || e.target.closest('[data-ok]')) wrap.remove();
	});
	document.body.append(wrap);
	wrap.querySelector('button').focus();
}

window.nestwee = api;
window.nestweeMobile = { renderFolderSettings };
loadLibrary();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showCrashNote);
else showCrashNote();
