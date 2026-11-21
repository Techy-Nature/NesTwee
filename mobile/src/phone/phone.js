'use strict';
/*
	NesTwee for phones: a simplified, one-column version of the desktop app.
	Uses the same window.nestwee API (provided by bridge.js).
*/

(() => {
	const api = window.nestwee;
	const $ = (s, el = document) => el.querySelector(s);
	const $$ = (s, el = document) => [...el.querySelectorAll(s)];

	const DEFAULT_A11Y = { theme: 'dark', font: 'sans', scale: 1, contrast: 0, spacing: false, underline: true, motion: false };
	const BUILTIN_A11Y = {
		'Default dark': { ...DEFAULT_A11Y },
		'Default light': { ...DEFAULT_A11Y, theme: 'light' },
		'Dyslexia friendly': { ...DEFAULT_A11Y, font: 'opendyslexic', scale: 1.1, spacing: true },
		'Large text': { ...DEFAULT_A11Y, scale: 1.4 },
		'Maximum contrast (dark)': { ...DEFAULT_A11Y, contrast: 100 },
		'Maximum contrast (light)': { ...DEFAULT_A11Y, theme: 'light', contrast: 100 },
	};
	const DEFAULT_BUILD = { sources: [], mode: 'html', format: '', proofFormat: '', outName: '', start: '', test: false, trim: true, twee2Compat: false, skipHidden: false, saveTo: '' };
	const BUILTIN_BUILD = {
		'SugarCube 2': { mode: 'html', format: 'sugarcube-2' },
		'Harlowe 3': { mode: 'html', format: 'harlowe-3' },
		'Chapbook 1': { mode: 'html', format: 'chapbook-1' },
		'Duplex 1': { mode: 'html', format: 'duplex-1' },
		'Proofing copy (Paperthin)': { mode: 'proof', proofFormat: 'paperthin-1' },
		'Test build (debug on)': { mode: 'html', test: true },
	};
	const KIND = { twee: 'Twee', twee2: 'Twee2', html: 'HTML', css: 'CSS', js: 'JS', font: 'Fonts', image: 'Images', audio: 'Audio', video: 'Video', vtt: 'Captions' };
	const EXT = { html: 'html', proof: 'html', 'archive-twine2': 'html', twee3: 'twee' };

	const state = {
		a11y: { ...DEFAULT_A11Y },
		draft: { ...DEFAULT_A11Y },
		build: { ...DEFAULT_BUILD },
		presets: { a11y: {}, build: {} },
		formats: [],
		last: null,
		watching: false,
		fontOk: null,
	};

	// ---------------------------------------------------------------- helpers

	function el(tag, attrs = {}, ...kids) {
		const n = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) {
			if (v === undefined || v === null || v === false) continue;
			if (k === 'class') n.className = v;
			else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
			else n.setAttribute(k, v === true ? '' : v);
		}
		for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
		return n;
	}
	function icon(id) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'icon');
		svg.setAttribute('aria-hidden', 'true');
		const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
		use.setAttribute('href', '#' + id);
		svg.append(use);
		return svg;
	}
	function toast(msg, kind = 'info', ms = 3500) {
		const t = el('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
		$('#toasts').append(t);
		setTimeout(() => t.remove(), ms);
	}
	const save = (key) => api.saveStore(key, key === 'build' ? state.build : key === 'a11y' ? state.a11y : state.presets);
	const label = (ref) => ref.replace(/ #[a-z0-9]+$/, '');

	// ---------------------------------------------------------------- accessibility

	function applyA11y(target, s) {
		target.dataset.theme = s.theme;
		target.dataset.font = s.font;
		target.dataset.spacing = String(!!s.spacing);
		target.dataset.underline = String(!!s.underline);
		target.dataset.motion = s.motion ? 'reduce' : 'full';
		target.style.setProperty('--hc', `${s.contrast}%`);
		target.style.setProperty('--scale', String(s.scale));
	}
	function commitA11y(next) {
		state.a11y = { ...next };
		applyA11y(document.documentElement, state.a11y);
		const dark = state.a11y.theme === 'dark';
		const t = $('#theme-toggle');
		t.setAttribute('aria-pressed', String(dark));
		t.setAttribute('aria-label', dark ? 'Dark theme is on. Switch to light' : 'Light theme is on. Switch to dark');
		t.querySelector('use').setAttribute('href', dark ? '#i-moon' : '#i-sun');
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#0d131c';
		save('a11y');
	}
	function contrastLabel(v) {
		if (v <= 0) return 'Standard';
		if (v >= 100) return 'Maximum (black & white)';
		return v < 50 ? `Raised (${v}%)` : `High (${v}%)`;
	}
	async function fontWarning(font) {
		const w = $('#font-warning');
		if (font !== 'opendyslexic') return (w.hidden = true);
		if (state.fontOk === null) {
			try {
				await document.fonts.load('16px "NT OpenDyslexic"');
				state.fontOk = document.fonts.check('16px "NT OpenDyslexic"');
			} catch {
				state.fontOk = false;
			}
		}
		w.hidden = state.fontOk;
		if (!state.fontOk) {
			w.replaceChildren(icon('i-warn'), el('span', {}, 'OpenDyslexic could not be loaded. Install it from opendyslexic.org; until then a plain sans-serif font is used.'));
		}
	}
	function renderA11y() {
		const d = state.draft;
		$$('input[name="a-theme"]').forEach((r) => (r.checked = r.value === d.theme));
		$('#a-font').value = d.font;
		$('#a-scale').value = Math.round(d.scale * 100);
		$('#a-scale-out').textContent = `${Math.round(d.scale * 100)}%`;
		$('#a-contrast').value = d.contrast;
		$('#a-contrast-out').textContent = contrastLabel(d.contrast);
		$('#a-spacing').checked = d.spacing;
		$('#a-underline').checked = d.underline;
		$('#a-motion').checked = d.motion;
		applyA11y($('#a11y-preview'), d);
		fontWarning(d.font);
		const dirty = JSON.stringify(d) !== JSON.stringify(state.a11y);
		$('#a-apply').disabled = !dirty;
		$('#a-revert').disabled = !dirty;
	}
	function setScale(v) {
		state.draft.scale = Math.min(2, Math.max(0.8, Math.round(v * 20) / 20));
		renderA11y();
	}
	function wireA11y() {
		$$('input[name="a-theme"]').forEach((r) => r.addEventListener('change', () => ((state.draft.theme = r.value), renderA11y())));
		$('#a-font').addEventListener('change', (e) => ((state.draft.font = e.target.value), renderA11y()));
		$('#a-scale').addEventListener('input', (e) => setScale(Number(e.target.value) / 100));
		$('#a-scale-down').addEventListener('click', () => setScale(state.draft.scale - 0.1));
		$('#a-scale-up').addEventListener('click', () => setScale(state.draft.scale + 0.1));
		$('#a-contrast').addEventListener('input', (e) => ((state.draft.contrast = Number(e.target.value)), renderA11y()));
		for (const k of ['spacing', 'underline', 'motion']) $(`#a-${k}`).addEventListener('change', (e) => ((state.draft[k] = e.target.checked), renderA11y()));
		$('#a-apply').addEventListener('click', () => {
			commitA11y(state.draft);
			renderA11y();
			toast('Settings applied.', 'success');
		});
		$('#a-revert').addEventListener('click', () => ((state.draft = { ...state.a11y }), renderA11y()));
		$('#a-reset').addEventListener('click', () => ((state.draft = { ...DEFAULT_A11Y }), renderA11y()));
		$('#theme-toggle').addEventListener('click', () => {
			const theme = state.a11y.theme === 'dark' ? 'light' : 'dark';
			commitA11y({ ...state.a11y, theme });
			state.draft.theme = theme;
			renderA11y();
		});
		$('#a11y-preview').addEventListener('click', (e) => e.preventDefault());
	}

	// ---------------------------------------------------------------- presets

	const presetKinds = {
		a11y: {
			builtins: BUILTIN_A11Y,
			current: () => ({ ...state.draft }),
			apply: (p) => {
				state.draft = { ...DEFAULT_A11Y, ...p };
				renderA11y();
				toast('Preset loaded into the preview. Tap Apply to use it.');
			},
		},
		build: {
			builtins: BUILTIN_BUILD,
			current: () => {
				const { sources, ...rest } = state.build;
				return rest;
			},
			apply: (p) => {
				state.build = { ...state.build, ...p };
				save('build');
				renderBuild();
				toast('Preset loaded.');
			},
		},
	};

	function renderPreset(box) {
		const kind = box.dataset.kind;
		const cfg = presetKinds[kind];
		const user = state.presets[kind] || {};
		const select = el('select', { 'aria-label': 'Choose a preset' }, el('option', { value: '' }, 'Choose a preset…'));
		if (Object.keys(user).length) select.append(el('optgroup', { label: 'Your presets' }, Object.keys(user).sort().map((n) => el('option', { value: 'user:' + n }, n))));
		select.append(el('optgroup', { label: 'Built-in' }, Object.keys(cfg.builtins).map((n) => el('option', { value: 'builtin:' + n }, n))));
		const del = el('button', { type: 'button', class: 'btn', disabled: true }, 'Delete');
		const name = el('input', { type: 'text', placeholder: 'New preset name', 'aria-label': 'New preset name' });
		const saveBtn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Save');
		select.addEventListener('change', () => {
			const v = select.value;
			del.disabled = !v.startsWith('user:');
			if (!v) return;
			const n = v.slice(v.indexOf(':') + 1);
			cfg.apply(v.startsWith('user:') ? user[n] : cfg.builtins[n]);
		});
		del.addEventListener('click', () => {
			delete state.presets[kind][select.value.slice(5)];
			save('presets');
			renderPreset(box);
		});
		saveBtn.addEventListener('click', () => {
			const n = name.value.trim();
			if (!n) return toast('Type a name for the preset first.');
			state.presets[kind] = state.presets[kind] || {};
			state.presets[kind][n] = cfg.current();
			save('presets');
			renderPreset(box);
			toast(`Saved preset “${n}”.`, 'success');
		});
		box.replaceChildren(el('div', { class: 'row' }, select, del), el('div', { class: 'row' }, name, saveBtn));
	}

	// ---------------------------------------------------------------- build page

	function fillFormats() {
		const story = state.formats.filter((f) => !f.proofing);
		const proof = state.formats.filter((f) => f.proofing);
		const opt = (f) => el('option', { value: f.id }, `${f.name} ${f.version}`);
		$('#format').replaceChildren(el('option', { value: '' }, 'Automatic (from StoryData)'), ...story.map(opt));
		$('#format').value = state.build.format;
		$('#proof-format').replaceChildren(...(proof.length ? proof.map(opt) : [el('option', { value: '' }, 'None. Import one first.')]));
		$('#proof-format').value = state.build.proofFormat || (proof[0] ? proof[0].id : '');
	}

	function renderBuild() {
		const b = state.build;
		$('#sources').replaceChildren(
			...b.sources.map((ref) =>
				el(
					'li',
					{},
					icon(ref.includes('/ · ') ? 'i-folder' : /\.zip/i.test(ref) ? 'i-zip' : 'i-file'),
					el('span', { class: 'path' }, label(ref)),
					el('button', { type: 'button', class: 'btn btn-icon btn-quiet', 'aria-label': `Remove ${label(ref)}`, onclick: () => removeSource(ref) }, icon('i-x'))
				)
			)
		);
		if ($('#save-to').value !== (b.saveTo || '')) fillSaveTo();
		$('#mode').value = b.mode;
		$('#format-field').hidden = b.mode !== 'html';
		$('#proof-field').hidden = b.mode !== 'proof';
		fillFormats();
		$('#out-name').value = b.outName;
		$('#out-name').placeholder = defaultName();
		$('#start').value = b.start;
		$('#test').checked = b.test;
		$('#trim').checked = b.trim;
		$('#twee2').checked = b.twee2Compat;
		$('#skip-hidden').checked = b.skipHidden;
	}

	function defaultName() {
		const first = state.build.sources[0];
		const base = first ? label(first).replace(/ · .*$/, '').replace(/\.[a-z0-9]+$/i, '') : 'story';
		const safe = base.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'story';
		return `${state.build.mode === 'proof' ? safe + '-proof' : safe}.${EXT[state.build.mode] || 'html'}`;
	}

	function update(patch) {
		Object.assign(state.build, patch);
		save('build');
	}

	async function summarize() {
		const box = $('#summary');
		if (!state.build.sources.length) return box.replaceChildren();
		const res = await api.scan(state.build.sources, { skipHidden: state.build.skipHidden });
		const chips = Object.entries(res.counts).map(([k, n]) => el('span', { class: 'chip' }, el('b', {}, String(n)), ' ', KIND[k] || k));
		box.replaceChildren(
			el('div', { class: 'small' }, res.total ? `Found ${res.total} usable file${res.total === 1 ? '' : 's'}` : 'No usable files found', res.ignored ? el('span', { class: 'muted' }, ` · ${res.ignored} ignored`) : null),
			chips.length ? el('div', { class: 'chips' }, chips) : null,
			...res.warnings.map((w) => el('div', { class: 'callout callout-warn small' }, icon('i-warn'), el('span', {}, w))),
			res.files.length ? el('details', {}, el('summary', {}, 'Show files'), el('ul', { class: 'file-list' }, res.files.slice(0, 300).map((f) => el('li', {}, el('span', { class: 'kind' }, KIND[f.kind] || f.kind), el('span', {}, f.path))))) : null
		);
	}

	async function addSources(refs) {
		if (!refs.length) return;
		update({ sources: [...state.build.sources, ...refs] });
		renderBuild();
		summarize();
	}

	function removeSource(ref) {
		update({ sources: state.build.sources.filter((r) => r !== ref) });
		if (api.forgetSource) api.forgetSource(ref);
		renderBuild();
		summarize();
	}

	function logList(entries) {
		const mark = { info: '›', warn: '⚠', error: '✖', success: '✔' };
		return el('ol', { class: 'log' }, entries.map((e) => el('li', { class: e.level }, el('span', { class: 'lvl', 'aria-label': e.level }, mark[e.level] || '›'), el('span', { class: 'msg' }, e.message))));
	}

	function ifidHelp(message) {
		const m = message.match(/"ifid": "([0-9A-F-]{36})"/);
		if (!m) return null;
		const snippet = message.slice(message.indexOf('::')).trim();
		return el(
			'div',
			{ class: 'callout callout-attention' },
			el('strong', {}, 'Your story needs an IFID (a unique ID).'),
			el('span', {}, 'Add this to your StoryData passage, then build again:'),
			el('pre', {}, snippet),
			el('button', { type: 'button', class: 'btn', onclick: () => api.copyText(snippet).then(() => toast('Copied.', 'success')) }, icon('i-copy'), 'Copy snippet')
		);
	}

	function buildConfig() {
		const b = state.build;
		return {
			sources: b.sources,
			outFile: `${b.saveTo || 'NesTwee'}/${b.outName.trim() || defaultName()}`,
			mode: b.mode === 'proof' ? 'html' : b.mode,
			format: b.mode === 'proof' ? b.proofFormat || $('#proof-format').value : b.format,
			start: b.start,
			test: b.mode === 'html' && b.test,
			trim: b.trim,
			twee2Compat: b.twee2Compat,
			skipHidden: b.skipHidden,
			logStats: true,
		};
	}

	async function runBuild() {
		if (!state.build.sources.length) {
			toast('Pick your story files first.', 'error');
			return;
		}
		const btn = $('#build');
		btn.disabled = true;
		btn.lastChild.textContent = 'Building…';
		const res = await api.build(buildConfig());
		btn.disabled = state.watching;
		btn.lastChild.textContent = 'Build';
		showResult(res, true);
	}

	function showResult(res, scroll) {
		const box = $('#result');
		box.hidden = false;
		if (res.ok) {
			state.last = res.outFile;
			box.replaceChildren(
				el('h3', {}, el('span', { class: 'status ok' }, '✔'), 'Built!'),
				el('p', {}, `${res.stats.storyPassages} story passages, about ${res.stats.words} words.`),
				el('p', { class: 'where' }, res.outFile),
				el(
					'div',
					{ class: 'p-two' },
					el('button', { type: 'button', class: 'btn btn-primary', onclick: () => api.previewOutput(res.outFile) }, icon('i-play'), 'Preview'),
					el('button', { type: 'button', class: 'btn', onclick: () => api.shareOutput(res.outFile) }, icon('i-share'), 'Share')
				),
				el('details', {}, el('summary', {}, 'Messages'), logList(res.log))
			);
		} else {
			const err = [...res.log].reverse().find((e) => e.level === 'error');
			box.replaceChildren(el('h3', {}, el('span', { class: 'status fail' }, '✖'), 'The build stopped'), (err && ifidHelp(err.message)) || null, logList(res.log));
		}
		if (scroll) box.scrollIntoView({ behavior: state.a11y.motion ? 'auto' : 'smooth', block: 'start' });
	}

	// ---------------------------------------------------------------- watch mode

	function setWatching(on, note) {
		state.watching = on;
		const w = $('#watch');
		w.setAttribute('aria-pressed', String(on));
		w.querySelector('use').setAttribute('href', on ? '#i-stop' : '#i-eye');
		w.querySelector('span').textContent = on ? 'Stop' : 'Watch';
		w.setAttribute('aria-label', on ? 'Stop watching' : 'Watch and rebuild when files change');
		$('#build').disabled = on;
		const p = $('#watching');
		p.hidden = !on;
		if (on) p.textContent = note || 'Watching your folders. NesTwee rebuilds when a file changes.';
	}

	async function toggleWatch() {
		if (state.watching) {
			await api.watchStop();
			toast('Stopped watching.');
			return;
		}
		if (!state.build.sources.length) {
			toast('Add your story folder first.', 'error');
			return;
		}
		const w = $('#watch');
		w.disabled = true;
		const res = await api.watchStart(buildConfig());
		w.disabled = false;
		showResult(res.first, true);
		if (!res.watching) toast('Watch mode follows folders only. Add your story with Add folder.', 'error', 6000);
	}

	function wireWatch() {
		$('#watch').addEventListener('click', toggleWatch);
		api.onWatchState((s) => {
			const when = s.lastBuild ? new Date(s.lastBuild.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
			setWatching(!!s.watching, s.lastBuild ? `Watching. ${s.lastBuild.ok ? 'Built' : 'Build failed'} at ${when}.` : '');
			if (s.lastBuild && s.lastBuild.result && state.watching) showResult(s.lastBuild.result, false);
		});
	}

	// ---------------------------------------------------------------- save to (export folder)

	async function fillSaveTo() {
		const sel = $('#save-to');
		const folders = api.folderAccess ? await api.folderAccess.list() : [];
		const cur = state.build.saveTo;
		const opts = [el('option', { value: '' }, 'Documents/NesTwee (default)')];
		for (const f of folders) if (f.available !== false) opts.push(el('option', { value: f.place }, f.place));
		if (cur && !folders.some((f) => f.place === cur)) opts.push(el('option', { value: cur }, `${cur} (no permission)`));
		if (api.folderAccess && api.folderAccess.available) opts.push(el('option', { value: '__choose' }, 'Choose a folder…'));
		sel.replaceChildren(...opts);
		sel.value = cur;
	}

	async function onSaveTo(e) {
		if (e.target.value !== '__choose') return update({ saveTo: e.target.value });
		const f = await api.folderAccess.grant();
		if (f) {
			update({ saveTo: f.place });
			toast(`Builds will be saved in ${f.place}.`, 'success');
		}
		fillSaveTo();
	}

	function wireBuild() {
		$('#pick-folder').addEventListener('click', async () => addSources(await api.pickFolders()));
		$('#pick-zip').addEventListener('click', async () => addSources(await api.pickFiles({ filters: [{ name: 'Zip', extensions: ['zip'] }] })));
		$('#pick-files').addEventListener('click', async () => addSources(await api.pickFiles({})));
		$('#mode').addEventListener('change', (e) => (update({ mode: e.target.value }), renderBuild()));
		$('#format').addEventListener('change', (e) => update({ format: e.target.value }));
		$('#proof-format').addEventListener('change', (e) => update({ proofFormat: e.target.value }));
		$('#out-name').addEventListener('change', (e) => update({ outName: e.target.value.trim() }));
		$('#start').addEventListener('change', (e) => update({ start: e.target.value.trim() }));
		$('#test').addEventListener('change', (e) => update({ test: e.target.checked }));
		$('#trim').addEventListener('change', (e) => update({ trim: e.target.checked }));
		$('#twee2').addEventListener('change', (e) => update({ twee2Compat: e.target.checked }));
		$('#skip-hidden').addEventListener('change', (e) => (update({ skipHidden: e.target.checked }), summarize()));
		$('#build').addEventListener('click', runBuild);
		$('#save-to').addEventListener('change', onSaveTo);
		$('#save-to').addEventListener('focus', fillSaveTo);
	}

	// ---------------------------------------------------------------- formats page

	async function loadFormats() {
		const res = await api.listFormats();
		state.formats = res.formats;
		$('#formats').replaceChildren(
			...res.formats.map((f) =>
				el(
					'li',
					{},
					el('div', { class: 'meta' }, el('strong', {}, `${f.name} ${f.version}`), el('small', {}, `${f.proofing ? 'Proofing format' : 'Story format'} · ${f.id}${f.filename.startsWith('Imported') ? ' · imported' : ''}`)),
					f.filename.startsWith('Imported')
						? el('button', { type: 'button', class: 'btn btn-quiet', onclick: async () => (await api.removeImportedFormat(f.id), loadFormats(), toast(`Removed ${f.id}.`)) }, 'Remove')
						: null
				)
			),
			...res.warnings.map((w) => el('li', { class: 'callout callout-warn small' }, icon('i-warn'), el('span', {}, w)))
		);
		fillFormats();
	}

	function wireFormats() {
		$('#import-format').addEventListener('click', async () => {
			const [ref] = await api.pickFiles({ multiple: false, filters: [{ name: 'Story format', extensions: ['js'] }] });
			if (!ref) return;
			const res = await api.importFormat(ref);
			if (!res.ok) return toast(`Couldn't import it: ${res.error}`, 'error', 6000);
			await loadFormats();
			toast(`Imported ${res.name} ${res.version}.`, 'success');
			// Watch mode only notices source files, so rebuild now that the format changed.
			if (state.watching) await api.watchStart(buildConfig());
		});
	}

	// ---------------------------------------------------------------- navigation

	function show(page) {
		$$('.p-page').forEach((p) => (p.hidden = p.dataset.page !== page));
		$$('.p-nav button').forEach((b) => (b.dataset.page === page ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
		$('#buildbar').hidden = page !== 'build';
		if (page === 'settings') {
			state.draft = { ...state.a11y };
			renderA11y();
		}
		$('#main').scrollTop = 0;
	}

	async function init() {
		const [info, stored] = await Promise.all([api.appInfo(), api.loadStore()]);
		state.a11y = { ...DEFAULT_A11Y, ...(stored.a11y || {}) };
		state.draft = { ...state.a11y };
		state.build = { ...DEFAULT_BUILD, ...(stored.build || {}) };
		state.presets = { a11y: {}, build: {}, ...(stored.presets || {}) };
		$('#version').textContent = `v${info.version}`;
		commitA11y(state.a11y);
		wireA11y();
		wireBuild();
		wireFormats();
		wireWatch();
		$$('.p-nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.page)));
		$$('.p-preset').forEach(renderPreset);
		if (window.nestweeMobile) window.nestweeMobile.renderFolderSettings($('#folder-settings'), { toast: (m, k) => toast(m, k) });
		await loadFormats();
		renderBuild();
		renderA11y();
		summarize();
		fillSaveTo();
	}

	init().catch((err) => toast(`NesTwee could not start: ${err.message}`, 'error', 10000));
})();
