'use strict';
/*
	NesTwee window logic. Talks to the main process through window.nestwee
	(see src/main/preload.js).
*/

(() => {
	const api = window.nestwee;
	const $ = (sel, el = document) => el.querySelector(sel);
	const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

	// ---------------------------------------------------------------- defaults

	const DEFAULT_A11Y = Object.freeze({
		theme: 'dark',
		font: 'sans',
		scale: 1,
		contrast: 0,
		spacing: false,
		underline: true,
		motion: false,
	});

	const BUILTIN_A11Y_PRESETS = {
		'Default dark': { ...DEFAULT_A11Y },
		'Default light': { ...DEFAULT_A11Y, theme: 'light' },
		'Dyslexia friendly': { ...DEFAULT_A11Y, font: 'opendyslexic', scale: 1.1, spacing: true },
		'Large text': { ...DEFAULT_A11Y, scale: 1.4 },
		'Maximum contrast (dark)': { ...DEFAULT_A11Y, contrast: 100 },
		'Maximum contrast (light)': { ...DEFAULT_A11Y, theme: 'light', contrast: 100 },
	};

	const DEFAULT_BUILD = Object.freeze({
		sources: [],
		outFile: '',
		mode: 'html',
		format: '',
		proofFormat: '',
		start: '',
		test: false,
		modules: [],
		headFile: '',
		encoding: '',
		trim: true,
		twee2Compat: false,
		skipHidden: false,
		logFiles: false,
		logStats: true,
	});

	const BUILTIN_BUILD_PRESETS = {
		'SugarCube 2': { format: 'sugarcube-2' },
		'Harlowe 3': { format: 'harlowe-3' },
		'Chapbook 1': { format: 'chapbook-1' },
		'Duplex 1': { format: 'duplex-1' },
		'Test build (debug on)': { test: true, logStats: true, logFiles: true },
		'Proofing copy (Paperthin)': { mode: 'proof', proofFormat: 'paperthin-1' },
	};

	const PATH_KEYS = ['sources', 'outFile', 'modules', 'headFile'];

	const DEFAULT_DECOMPILE = Object.freeze({ input: '', outFile: '', mode: 'twee3', lineEndings: 'auto', trim: true });

	const KIND_LABELS = {
		twee: 'Twee',
		twee2: 'Twee2',
		html: 'HTML',
		css: 'CSS',
		js: 'JS',
		font: 'Fonts',
		image: 'Images',
		audio: 'Audio',
		video: 'Video',
		vtt: 'Captions',
	};

	const state = {
		info: {},
		a11y: { ...DEFAULT_A11Y },
		draft: { ...DEFAULT_A11Y },
		build: { ...DEFAULT_BUILD },
		decompile: { ...DEFAULT_DECOMPILE },
		formatDirs: [],
		presets: { a11y: {}, build: {} },
		formats: [],
		lastOut: '',
		lastDecompiled: '',
		watching: false,
		page: 'build',
		fontOk: null,
	};

	// ---------------------------------------------------------------- helpers

	const save = (key) => api.saveStore(key, state[key]);
	let saveTimer = null;
	const saveSoon = (key) => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => save(key), 250);
	};

	function el(tag, attrs = {}, ...children) {
		const node = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) {
			if (v === undefined || v === null || v === false) continue;
			if (k === 'class') node.className = v;
			else if (k === 'text') node.textContent = v;
			else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
			else node.setAttribute(k, v === true ? '' : v);
		}
		for (const c of children.flat()) {
			if (c === null || c === undefined || c === false) continue;
			node.append(c.nodeType ? c : document.createTextNode(String(c)));
		}
		return node;
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

	function toast(message, kind = 'info', ms = 4200) {
		const t = el('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
		$('#toasts').append(t);
		setTimeout(() => t.remove(), ms);
	}

	function basename(p) {
		return String(p).split(/[\\/]/).filter(Boolean).pop() || p;
	}

	function dirname(p) {
		const parts = String(p).split(/([\\/])/);
		return parts.slice(0, -2).join('') || p;
	}

	function joinPath(dir, name) {
		const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
		return dir.replace(/[\\/]+$/, '') + sep + name;
	}

	// ---------------------------------------------------------------- log

	const LEVEL_MARK = { info: '›', warn: '⚠', error: '✖', success: '✔' };

	function logEntry(entry) {
		const list = $('#log');
		const time = new Date(entry.time || Date.now()).toLocaleTimeString();
		list.append(
			el(
				'li',
				{ class: entry.level },
				el('span', { class: 'time' }, time),
				el('span', { class: 'lvl', 'aria-label': entry.level }, LEVEL_MARK[entry.level] || '›'),
				el('span', { class: 'msg' }, entry.message)
			)
		);
		while (list.children.length > 800) list.firstChild.remove();
		list.scrollTop = list.scrollHeight;
	}

	function setStatus(text, ok) {
		const s = $('#build-status');
		s.textContent = text;
		s.className = 'status ' + (ok === true ? 'ok' : ok === false ? 'fail' : '');
	}

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

	function contrastLabel(v) {
		if (v <= 0) return 'Standard';
		if (v >= 100) return 'Maximum (pure black & white)';
		if (v < 35) return `Raised (${v}%)`;
		if (v < 70) return `High (${v}%)`;
		return `Very high (${v}%)`;
	}

	async function checkDyslexicFont() {
		if (state.fontOk !== null) return state.fontOk;
		try {
			await document.fonts.load('16px "NT OpenDyslexic"');
			state.fontOk = document.fonts.check('16px "NT OpenDyslexic"');
		} catch {
			state.fontOk = false;
		}
		return state.fontOk;
	}

	async function updateFontWarning(font) {
		const w = $('#font-warning');
		if (font !== 'opendyslexic') {
			w.hidden = true;
			return;
		}
		const ok = await checkDyslexicFont();
		w.hidden = ok;
		if (!ok) {
			w.replaceChildren(
				icon('i-warn'),
				el(
					'span',
					{},
					'OpenDyslexic could not be loaded. Install it from ',
					el('a', { href: 'https://opendyslexic.org', target: '_blank', rel: 'noopener' }, 'opendyslexic.org'),
					' and restart NesTwee. Until then, a plain sans-serif font is used.'
				)
			);
		}
	}

	function renderA11yForm() {
		const d = state.draft;
		$$('input[name="a11y-theme"]').forEach((r) => (r.checked = r.value === d.theme));
		$('#a11y-font').value = d.font;
		$('#a11y-scale').value = Math.round(d.scale * 100);
		$('#a11y-scale-out').textContent = `${Math.round(d.scale * 100)}%`;
		$('#a11y-contrast').value = d.contrast;
		$('#a11y-contrast-out').textContent = contrastLabel(d.contrast);
		$('#a11y-spacing').checked = !!d.spacing;
		$('#a11y-underline').checked = !!d.underline;
		$('#a11y-motion').checked = !!d.motion;
		applyA11y($('#a11y-preview'), d);
		updateFontWarning(d.font);
		const dirty = JSON.stringify(d) !== JSON.stringify(state.a11y);
		$('#a11y-apply').disabled = !dirty;
		$('#a11y-revert').disabled = !dirty;
	}

	function commitA11y(next) {
		state.a11y = { ...next };
		applyA11y(document.documentElement, state.a11y);
		updateThemeToggle();
		save('a11y');
	}

	function updateThemeToggle() {
		const dark = state.a11y.theme === 'dark';
		const btn = $('#theme-toggle');
		btn.setAttribute('aria-pressed', String(dark));
		btn.querySelector('use').setAttribute('href', dark ? '#i-moon' : '#i-sun');
		btn.querySelector('.theme-label').textContent = dark ? 'Dark' : 'Light';
		btn.title = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
	}

	function setScale(next, { commit = false } = {}) {
		const v = Math.min(2, Math.max(0.8, Math.round(next * 20) / 20));
		if (commit) {
			commitA11y({ ...state.a11y, scale: v });
			state.draft = { ...state.draft, scale: v };
		} else {
			state.draft = { ...state.draft, scale: v };
		}
		renderA11yForm();
	}

	function wireA11y() {
		$$('input[name="a11y-theme"]').forEach((r) =>
			r.addEventListener('change', () => {
				state.draft.theme = r.value;
				renderA11yForm();
			})
		);
		$('#a11y-font').addEventListener('change', (e) => {
			state.draft.font = e.target.value;
			renderA11yForm();
		});
		$('#a11y-scale').addEventListener('input', (e) => setScale(Number(e.target.value) / 100));
		$('#a11y-scale-down').addEventListener('click', () => setScale(state.draft.scale - 0.1));
		$('#a11y-scale-up').addEventListener('click', () => setScale(state.draft.scale + 0.1));
		$('#a11y-contrast').addEventListener('input', (e) => {
			state.draft.contrast = Number(e.target.value);
			renderA11yForm();
		});
		$('#a11y-spacing').addEventListener('change', (e) => {
			state.draft.spacing = e.target.checked;
			renderA11yForm();
		});
		$('#a11y-underline').addEventListener('change', (e) => {
			state.draft.underline = e.target.checked;
			renderA11yForm();
		});
		$('#a11y-motion').addEventListener('change', (e) => {
			state.draft.motion = e.target.checked;
			renderA11yForm();
		});
		$('#a11y-apply').addEventListener('click', () => {
			commitA11y(state.draft);
			renderA11yForm();
			toast('Accessibility settings applied.', 'success');
		});
		$('#a11y-revert').addEventListener('click', () => {
			state.draft = { ...state.a11y };
			renderA11yForm();
		});
		$('#a11y-reset').addEventListener('click', () => {
			state.draft = { ...DEFAULT_A11Y };
			renderA11yForm();
		});
		$('#theme-toggle').addEventListener('click', () => {
			const theme = state.a11y.theme === 'dark' ? 'light' : 'dark';
			commitA11y({ ...state.a11y, theme });
			state.draft = { ...state.draft, theme };
			renderA11yForm();
		});
		$('#a11y-preview').addEventListener('click', (e) => e.preventDefault());
	}

	// ---------------------------------------------------------------- presets

	const presetKinds = {
		a11y: {
			builtins: BUILTIN_A11Y_PRESETS,
			current: () => ({ ...state.draft }),
			apply: (p) => {
				state.draft = { ...DEFAULT_A11Y, ...p };
				renderA11yForm();
				toast('Preset loaded into the preview. Press Apply to use it.');
			},
		},
		build: {
			builtins: BUILTIN_BUILD_PRESETS,
			current: (includePaths) => {
				const b = { ...state.build };
				if (!includePaths) for (const k of PATH_KEYS) delete b[k];
				return b;
			},
			apply: (p) => {
				state.build = { ...state.build, ...p };
				renderBuildForm();
				saveSoon('build');
				rescanSources();
				toast('Build preset loaded.');
			},
		},
	};

	function renderPresetBar(bar) {
		const kind = bar.dataset.presetKind;
		const cfg = presetKinds[kind];
		const user = state.presets[kind] || {};
		const select = el('select', { 'aria-label': 'Preset' });
		select.append(el('option', { value: '' }, 'Choose a preset…'));
		const gUser = el('optgroup', { label: 'Your presets' });
		for (const name of Object.keys(user).sort()) gUser.append(el('option', { value: 'user:' + name }, name));
		if (gUser.children.length) select.append(gUser);
		const gBuiltin = el('optgroup', { label: 'Built-in' });
		for (const name of Object.keys(cfg.builtins)) gBuiltin.append(el('option', { value: 'builtin:' + name }, name));
		select.append(gBuiltin);

		const del = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', disabled: true }, 'Delete');
		const update = el('button', { type: 'button', class: 'btn btn-sm', disabled: true, title: 'Overwrite this preset with the current settings' }, 'Update');
		const nameInput = el('input', { type: 'text', placeholder: 'New preset name', 'aria-label': 'New preset name' });
		const saveBtn = el('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Save as preset');
		const include = kind === 'build' ? el('input', { type: 'checkbox', checked: true }) : null;

		select.addEventListener('change', () => {
			const v = select.value;
			const isUser = v.startsWith('user:');
			del.disabled = !isUser;
			update.disabled = !isUser;
			if (!v) return;
			const name = v.slice(v.indexOf(':') + 1);
			const preset = isUser ? user[name] : cfg.builtins[name];
			if (preset) cfg.apply(preset);
		});
		del.addEventListener('click', () => {
			const name = select.value.slice(5);
			delete state.presets[kind][name];
			save('presets');
			renderPresetBar(bar);
			toast(`Deleted preset “${name}”.`);
		});
		update.addEventListener('click', () => {
			const name = select.value.slice(5);
			state.presets[kind][name] = cfg.current(include ? include.checked : true);
			save('presets');
			toast(`Updated preset “${name}”.`, 'success');
		});
		const doSave = () => {
			const name = nameInput.value.trim();
			if (!name) {
				nameInput.focus();
				toast('Type a name for the preset first.');
				return;
			}
			state.presets[kind] = state.presets[kind] || {};
			state.presets[kind][name] = cfg.current(include ? include.checked : true);
			save('presets');
			renderPresetBar(bar);
			toast(`Saved preset “${name}”.`, 'success');
		};
		saveBtn.addEventListener('click', doSave);
		nameInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') doSave();
		});

		const parts = [
			el('label', { class: 'field' }, el('span', { class: 'label' }, kind === 'build' ? 'Build presets' : 'Accessibility presets'), select),
			update,
			del,
			el('span', { class: 'preset-save' }, nameInput, saveBtn),
			include ? el('label', { class: 'check include-paths', title: 'Save source folders and the output file with the preset' }, include, el('span', {}, 'Include paths')) : null,
		];
		bar.replaceChildren(...parts.filter(Boolean));
	}

	// ---------------------------------------------------------------- build page

	function renderPathList(listEl, paths, onRemove, emptyText) {
		listEl.dataset.empty = emptyText;
		listEl.replaceChildren(
			...paths.map((p) =>
				el(
					'li',
					{},
					icon(/\.[a-z0-9]+$/i.test(p) ? 'i-file' : 'i-folder'),
					el('span', { class: 'path', title: p }, el('bdi', {}, p)),
					el(
						'button',
						{ type: 'button', class: 'btn btn-icon btn-quiet', 'aria-label': `Remove ${p}`, onclick: () => onRemove(p) },
						icon('i-x')
					)
				)
			)
		);
	}

	function formatLabel(f) {
		return f.twine2 ? `${f.name} ${f.version} — ${f.id}` : `${f.id} (Twine 1)`;
	}

	function renderFormatSelect(select, value, { proofing = false } = {}) {
		const story = state.formats.filter((f) => !f.proofing);
		const proof = state.formats.filter((f) => f.proofing);
		select.replaceChildren();
		if (proofing) {
			if (!proof.length) select.append(el('option', { value: '' }, 'No proofing formats found. Import one.'));
			for (const f of proof) select.append(el('option', { value: f.id }, formatLabel(f)));
		} else {
			select.append(el('option', { value: '' }, 'Automatic (StoryData or SugarCube 2)'));
			if (story.length) select.append(el('optgroup', { label: 'Story formats' }, story.map((f) => el('option', { value: f.id }, formatLabel(f)))));
			if (proof.length) select.append(el('optgroup', { label: 'Proofing formats' }, proof.map((f) => el('option', { value: f.id }, formatLabel(f)))));
		}
		if (value && !state.formats.some((f) => f.id === value)) {
			select.append(el('option', { value }, `${value} (not found)`));
		}
		select.value = value || (proofing && proof[0] ? proof[0].id : '');
	}

	async function importFormat() {
		const [file] = await api.pickFiles({
			title: 'Choose a story format (format.js)',
			multiple: false,
			filters: [{ name: 'Twine 2 story format', extensions: ['js'] }, { name: 'All files', extensions: ['*'] }],
		});
		if (!file) return;
		const res = await api.importFormat(file);
		if (!res.ok) {
			logEntry({ level: 'error', message: `Import failed: ${res.error}` });
			toast(`That file couldn't be imported: ${res.error}`, 'error', 7000);
			return;
		}
		await loadFormats();
		const kind = res.proofing ? 'proofing format' : 'story format';
		logEntry({ level: 'success', message: `Imported ${res.name} ${res.version} as ${kind} “${res.id}”.` });
		toast(`Imported ${res.name} ${res.version} (${res.id}).`, 'success');
		await rebuildIfWatching('the story format changed');
	}

	/** Watch mode only notices source files, so rebuild by hand when the format or its settings change. */
	async function rebuildIfWatching(why) {
		if (!state.watching) return;
		logEntry({ level: 'info', message: `Rebuilding because ${why}: ${state.build.outFile}` });
		const res = await api.watchStart(buildConfig());
		if (res && res.first) handleBuildResult(res.first);
	}

	function renderBuildForm() {
		const b = state.build;
		renderPathList($('#sources-list'), b.sources, removeSource, 'No sources yet. Add the folder that holds your story.');
		renderPathList($('#modules-list'), b.modules, removeModule, 'No modules.');
		$$('input[name="build-mode"]').forEach((r) => (r.checked = r.value === b.mode));
		$('#build-out').value = b.outFile;
		renderFormatSelect($('#build-format'), b.format);
		$('#build-start').value = b.start;
		$('#build-test').checked = b.test;
		$('#build-head').value = b.headFile;
		$('#build-charset').value = b.encoding;
		$('#build-trim').checked = b.trim;
		$('#build-twee2').checked = b.twee2Compat;
		$('#build-skip-hidden').checked = b.skipHidden;
		$('#build-log-files').checked = b.logFiles;
		$('#build-log-stats').checked = b.logStats;
		renderFormatSelect($('#build-proof-format'), b.proofFormat, { proofing: true });
		const compiled = b.mode === 'html' || b.mode === 'proof';
		$('#build-format-field').hidden = b.mode === 'proof';
		$('#build-proof-field').hidden = b.mode !== 'proof';
		$('#build-format').disabled = !compiled;
		$('#build-test').disabled = b.mode !== 'html';
	}

	function updateBuild(patch) {
		Object.assign(state.build, patch);
		saveSoon('build');
	}

	function removeSource(p) {
		updateBuild({ sources: state.build.sources.filter((x) => x !== p) });
		renderBuildForm();
		rescanSources();
	}

	function removeModule(p) {
		updateBuild({ modules: state.build.modules.filter((x) => x !== p) });
		renderBuildForm();
	}

	function addUnique(list, items) {
		const out = [...list];
		for (const i of items) if (!out.includes(i)) out.push(i);
		return out;
	}

	let scanSeq = 0;
	async function rescanSources() {
		const box = $('#scan-summary');
		const seq = ++scanSeq;
		if (!state.build.sources.length) {
			box.replaceChildren();
			return;
		}
		box.replaceChildren(el('span', { class: 'muted small' }, 'Searching folders…'));
		const res = await api.scan(state.build.sources, { skipHidden: state.build.skipHidden, outFile: state.build.outFile });
		if (seq !== scanSeq) return;
		const chips = Object.entries(res.counts).map(([k, n]) => el('span', { class: 'chip' }, el('b', {}, String(n)), ' ', KIND_LABELS[k] || k));
		const nodes = [
			el(
				'div',
				{ class: 'small' },
				res.total ? `Found ${res.total} usable file${res.total === 1 ? '' : 's'}` : 'No usable files found yet',
				res.ignored ? el('span', { class: 'muted' }, ` · ${res.ignored} other file${res.ignored === 1 ? '' : 's'} ignored`) : null
			),
			chips.length ? el('div', { class: 'chips' }, chips) : null,
		];
		for (const w of res.warnings) nodes.push(el('div', { class: 'callout callout-warn small' }, icon('i-warn'), el('span', {}, w)));
		if (res.total && !res.counts.twee && !res.counts.twee2 && !res.counts.html) {
			nodes.push(
				el('div', { class: 'callout callout-warn small' }, icon('i-warn'), el('span', {}, 'No Twee or Twine HTML files were found, so there are no story passages to compile.'))
			);
		}
		if (res.files.length) {
			const shown = res.files.slice(0, 400);
			nodes.push(
				el(
					'details',
					{},
					el('summary', {}, 'Show files'),
					el(
						'ul',
						{ class: 'file-list' },
						shown.map((f) => el('li', {}, el('span', { class: 'kind' }, KIND_LABELS[f.kind] || f.kind), el('span', {}, f.path))),
						res.files.length > shown.length ? el('li', { class: 'muted' }, `…and ${res.files.length - shown.length} more`) : null
					)
				)
			);
		}
		box.replaceChildren(...nodes);
	}

	function outputFilters(mode) {
		if (mode === 'twee3' || mode === 'twee1') return [{ name: 'Twee source', extensions: ['twee', 'tw'] }];
		return [{ name: 'HTML', extensions: ['html', 'htm'] }];
	}

	function suggestOutPath() {
		const first = state.build.sources[0];
		if (!first) return undefined;
		const base = /\.[a-z0-9]+$/i.test(first) ? dirname(first) : first;
		const name = { html: 'index.html', proof: 'proof.html' }[state.build.mode] || 'archive.html';
		return joinPath(dirname(base) || base, name);
	}

	async function chooseBuildOutput() {
		const p = await api.pickSave({
			title: 'Save the built story as',
			defaultPath: state.build.outFile || suggestOutPath(),
			filters: outputFilters(state.build.mode),
		});
		if (p) {
			updateBuild({ outFile: p });
			renderBuildForm();
		}
		return p;
	}

	function buildConfig() {
		const cfg = { ...state.build, formatDirs: state.formatDirs };
		if (cfg.mode === 'proof') {
			// A proofing copy is an HTML build that uses a proofing format.
			cfg.mode = 'html';
			cfg.format = cfg.proofFormat || $('#build-proof-format').value;
			cfg.test = false;
		}
		delete cfg.proofFormat;
		return cfg;
	}

	function showIFIDHelp(message) {
		const box = $('#ifid-help');
		const m = message.match(/"ifid": "([0-9A-F-]{36})"/);
		if (!m) {
			box.hidden = true;
			return;
		}
		const snippet = message.slice(message.indexOf('::'));
		box.replaceChildren(
			el('strong', {}, 'Your story needs an IFID (a unique ID).'),
			el('span', {}, 'Add this to your StoryData passage, then build again:'),
			el('pre', {}, snippet.trim()),
			el(
				'div',
				{ class: 'row wrap' },
				el('button', { type: 'button', class: 'btn btn-sm', onclick: () => api.copyText(m[1]).then(() => toast('IFID copied.', 'success')) }, icon('i-copy'), 'Copy IFID'),
				el('button', { type: 'button', class: 'btn btn-sm', onclick: () => api.copyText(snippet.trim()).then(() => toast('StoryData copied.', 'success')) }, icon('i-copy'), 'Copy snippet')
			)
		);
		box.hidden = false;
	}

	async function runBuild() {
		if (state.watching) {
			toast('Watch mode is already rebuilding on every change.');
			return;
		}
		if (!state.build.sources.length) {
			toast('Add a source folder or file first.', 'error');
			$('#add-source-folders').focus();
			return;
		}
		if (!state.build.outFile && !(await chooseBuildOutput())) return;
		const btn = $('#build-run');
		btn.disabled = true;
		setStatus('Building…');
		logEntry({ level: 'info', message: `BUILDING: ${state.build.outFile}` });
		const res = await api.build(buildConfig());
		btn.disabled = false;
		res.log.forEach(logEntry);
		handleBuildResult(res);
	}

	function handleBuildResult(res) {
		if (res.ok) {
			state.lastOut = res.outFile;
			setStatus(`Built ${basename(res.outFile)}`, true);
			$('#ifid-help').hidden = true;
		} else {
			setStatus('Build failed', false);
			const err = [...res.log].reverse().find((e) => e.level === 'error');
			if (res.code === 'MISSING_IFID' && err) showIFIDHelp(err.message);
			toast('The build failed. Check the log for details.', 'error');
		}
		$('#build-open').disabled = !state.lastOut;
		$('#build-show').disabled = !state.lastOut;
	}

	async function toggleWatch() {
		if (state.watching) {
			await api.watchStop();
			logEntry({ level: 'info', message: 'Watch mode stopped.' });
			return;
		}
		if (!state.build.sources.length) {
			toast('Add a source folder or file first.', 'error');
			return;
		}
		if (!state.build.outFile && !(await chooseBuildOutput())) return;
		logEntry({ level: 'info', message: `BUILDING: ${state.build.outFile}` });
		const res = await api.watchStart(buildConfig());
		handleBuildResult(res.first);
		logEntry({ level: 'info', message: 'Watch mode started. NesTwee rebuilds whenever a source file changes.' });
	}

	function setWatching(on) {
		state.watching = on;
		const btn = $('#watch-toggle');
		btn.setAttribute('aria-pressed', String(on));
		btn.classList.toggle('watching', on);
		btn.querySelector('use').setAttribute('href', on ? '#i-stop' : '#i-eye');
		btn.querySelector('span').textContent = on ? 'Stop watching' : 'Watch & rebuild';
		$('#watch-pill').hidden = !on;
		$('#build-run').disabled = on;
	}

	function wireBuild() {
		$('#add-source-folders').addEventListener('click', async () => {
			const dirs = await api.pickFolders({ title: 'Choose source folders (searched recursively)' });
			if (!dirs.length) return;
			updateBuild({ sources: addUnique(state.build.sources, dirs) });
			renderBuildForm();
			rescanSources();
		});
		$('#add-source-files').addEventListener('click', async () => {
			const files = await api.pickFiles({
				title: 'Choose source files',
				filters: [
					{ name: 'Story sources', extensions: ['tw', 'twee', 'tw2', 'twee2', 'html', 'htm', 'css', 'js'] },
					{ name: 'All files', extensions: ['*'] },
				],
			});
			if (!files.length) return;
			updateBuild({ sources: addUnique(state.build.sources, files) });
			renderBuildForm();
			rescanSources();
		});
		$('#rescan-sources').addEventListener('click', rescanSources);

		$('#add-module-folders').addEventListener('click', async () => {
			const dirs = await api.pickFolders({ title: 'Choose module folders' });
			if (!dirs.length) return;
			updateBuild({ modules: addUnique(state.build.modules, dirs) });
			renderBuildForm();
		});
		$('#add-module-files').addEventListener('click', async () => {
			const files = await api.pickFiles({
				title: 'Choose module files',
				filters: [{ name: 'Modules', extensions: ['css', 'js', 'otf', 'ttf', 'woff', 'woff2'] }],
			});
			if (!files.length) return;
			updateBuild({ modules: addUnique(state.build.modules, files) });
			renderBuildForm();
		});

		$$('input[name="build-mode"]').forEach((r) =>
			r.addEventListener('change', () => {
				updateBuild({ mode: r.value });
				renderBuildForm();
			})
		);
		$('#build-out').addEventListener('change', (e) => updateBuild({ outFile: e.target.value.trim() }));
		$('#build-out-browse').addEventListener('click', chooseBuildOutput);
		$('#build-format').addEventListener('change', (e) => (updateBuild({ format: e.target.value }), rebuildIfWatching('the story format changed')));
		$('#build-proof-format').addEventListener('change', (e) => updateBuild({ proofFormat: e.target.value }));
		$('#build-import-format').addEventListener('click', importFormat);
		$('#build-start').addEventListener('change', (e) => updateBuild({ start: e.target.value.trim() }));
		$('#build-test').addEventListener('change', (e) => updateBuild({ test: e.target.checked }));
		$('#build-head').addEventListener('change', (e) => updateBuild({ headFile: e.target.value.trim() }));
		$('#build-head-browse').addEventListener('click', async () => {
			const [f] = await api.pickFiles({ title: 'Choose a head file', multiple: false, filters: [{ name: 'HTML snippet', extensions: ['html', 'htm', 'txt'] }, { name: 'All files', extensions: ['*'] }] });
			if (f) {
				updateBuild({ headFile: f });
				renderBuildForm();
			}
		});
		$('#build-head-clear').addEventListener('click', () => {
			updateBuild({ headFile: '' });
			renderBuildForm();
		});
		$('#build-charset').addEventListener('change', (e) => updateBuild({ encoding: e.target.value }));
		$('#build-trim').addEventListener('change', (e) => updateBuild({ trim: e.target.checked }));
		$('#build-twee2').addEventListener('change', (e) => updateBuild({ twee2Compat: e.target.checked }));
		$('#build-skip-hidden').addEventListener('change', (e) => {
			updateBuild({ skipHidden: e.target.checked });
			rescanSources();
		});
		$('#build-log-files').addEventListener('change', (e) => updateBuild({ logFiles: e.target.checked }));
		$('#build-log-stats').addEventListener('change', (e) => updateBuild({ logStats: e.target.checked }));

		$('#build-run').addEventListener('click', runBuild);
		$('#watch-toggle').addEventListener('click', toggleWatch);
		$('#build-open').addEventListener('click', () => state.lastOut && api.openPath(state.lastOut));
		$('#build-show').addEventListener('click', () => state.lastOut && api.showInFolder(state.lastOut));

		api.onWatchLog(logEntry);
		api.onWatchState((s) => {
			setWatching(!!s.watching);
			if (s.lastBuild) {
				if (s.lastBuild.ok) {
					state.lastOut = s.lastBuild.outFile;
					setStatus(`Rebuilt ${basename(s.lastBuild.outFile)} at ${new Date(s.lastBuild.time).toLocaleTimeString()}`, true);
				} else {
					setStatus('Rebuild failed', false);
				}
				$('#build-open').disabled = !state.lastOut;
				$('#build-show').disabled = !state.lastOut;
			}
		});
	}

	// ---------------------------------------------------------------- decompile page

	function renderDecompileForm() {
		const d = state.decompile;
		$('#dec-in').value = d.input;
		$('#dec-out').value = d.outFile;
		$$('input[name="dec-mode"]').forEach((r) => (r.checked = r.value === d.mode));
		$('#dec-eol').value = d.lineEndings;
		$('#dec-trim').checked = d.trim;
		$('#dec-open').disabled = !state.lastDecompiled;
	}

	function updateDecompile(patch) {
		Object.assign(state.decompile, patch);
		saveSoon('decompile');
	}

	function wireDecompile() {
		$('#dec-in-browse').addEventListener('click', async () => {
			const [f] = await api.pickFiles({ title: 'Choose a compiled story or Twine archive', multiple: false, filters: [{ name: 'HTML', extensions: ['html', 'htm'] }] });
			if (!f) return;
			const patch = { input: f };
			if (!state.decompile.outFile) patch.outFile = f.replace(/\.html?$/i, '') + '.twee';
			updateDecompile(patch);
			renderDecompileForm();
		});
		$('#dec-out-browse').addEventListener('click', async () => {
			const p = await api.pickSave({ title: 'Save Twee source as', defaultPath: state.decompile.outFile || undefined, filters: outputFilters('twee3') });
			if (p) {
				updateDecompile({ outFile: p });
				renderDecompileForm();
			}
		});
		$('#dec-in').addEventListener('change', (e) => updateDecompile({ input: e.target.value.trim() }));
		$('#dec-out').addEventListener('change', (e) => updateDecompile({ outFile: e.target.value.trim() }));
		$$('input[name="dec-mode"]').forEach((r) => r.addEventListener('change', () => updateDecompile({ mode: r.value })));
		$('#dec-eol').addEventListener('change', (e) => updateDecompile({ lineEndings: e.target.value }));
		$('#dec-trim').addEventListener('change', (e) => updateDecompile({ trim: e.target.checked }));
		$('#dec-run').addEventListener('click', async () => {
			const d = state.decompile;
			if (!d.input) return toast('Choose an HTML file to decompile first.', 'error');
			if (!d.outFile) return toast('Choose where to save the Twee file.', 'error');
			logEntry({ level: 'info', message: `DECOMPILING: ${d.input}` });
			const res = await api.build({
				sources: [d.input],
				outFile: d.outFile,
				mode: d.mode,
				lineEndings: d.lineEndings,
				trim: d.trim,
				formatDirs: state.formatDirs,
			});
			res.log.forEach(logEntry);
			if (res.ok) {
				state.lastDecompiled = res.outFile;
				setStatus(`Decompiled to ${basename(res.outFile)}`, true);
				toast(`Saved ${basename(res.outFile)}.`, 'success');
			} else {
				setStatus('Decompile failed', false);
				toast('Decompiling failed. Check the log for details.', 'error');
			}
			renderDecompileForm();
		});
		$('#dec-open').addEventListener('click', () => state.lastDecompiled && api.showInFolder(state.lastDecompiled));
	}

	// ---------------------------------------------------------------- formats page

	async function loadFormats() {
		const res = await api.listFormats(state.formatDirs);
		state.formats = res.formats;
		const tbody = $('#formats-table tbody');
		tbody.replaceChildren(
			...res.formats.map((f) =>
				el(
					'tr',
					{},
					el('td', {}, f.twine2 ? f.name : f.id, f.proofing ? el('span', { class: 'badge' }, 'proofing') : null, f.id === 'sugarcube-2' ? el('span', { class: 'badge warm' }, 'default') : null),
					el('td', {}, f.version || '—'),
					el('td', {}, el('code', {}, f.id)),
					el('td', {}, f.twine2 ? (f.proofing ? 'Proofing (Twine 2)' : 'Story (Twine 2)') : 'Story (Twine 1)'),
					el('td', { class: 'path-cell' }, dirname(f.filename)),
					el(
						'td',
						{},
						res.importedDir && f.filename.startsWith(res.importedDir)
							? el('button', { type: 'button', class: 'btn btn-quiet btn-sm', 'aria-label': `Remove imported format ${f.id}`, onclick: () => removeImported(f.id) }, icon('i-x'), 'Remove')
							: null
					)
				)
			)
		);
		if (!res.formats.length) {
			tbody.append(el('tr', {}, el('td', { colspan: '6' }, 'No story formats were found. Import one or add a folder below.')));
		}
		$('#formats-warnings').replaceChildren(...res.warnings.map((w) => el('div', { class: 'callout callout-warn small' }, icon('i-warn'), el('span', {}, w))));

		const userDirs = new Set(state.formatDirs);
		$('#formatdirs-list').replaceChildren(
			...res.searchDirs.map((d) =>
				el(
					'li',
					{},
					icon('i-folder'),
					el('span', { class: 'path', title: d.path }, el('bdi', {}, d.path)),
					d.bundled ? el('span', { class: 'tag' }, 'bundled') : null,
					d.imported ? el('span', { class: 'tag' }, 'imported') : null,
					!d.exists && !d.imported ? el('span', { class: 'tag' }, 'missing') : null,
					userDirs.has(d.path)
						? el('button', { type: 'button', class: 'btn btn-icon btn-quiet', 'aria-label': `Remove ${d.path}`, onclick: () => removeFormatDir(d.path) }, icon('i-x'))
						: el('span', { class: 'tag' }, d.bundled ? 'built in' : d.imported ? 'app' : 'auto')
				)
			)
		);
		renderBuildForm();
	}

	async function removeImported(id) {
		await api.removeImportedFormat(id);
		await loadFormats();
		toast(`Removed imported format “${id}”.`);
		await rebuildIfWatching('the story format changed');
	}

	function removeFormatDir(p) {
		state.formatDirs = state.formatDirs.filter((d) => d !== p);
		save('formatDirs');
		loadFormats();
	}

	function wireFormats() {
		$('#formats-import').addEventListener('click', importFormat);
		$('#formats-refresh').addEventListener('click', async () => {
			await loadFormats();
			toast(`Found ${state.formats.length} story formats.`);
		});
		$('#formatdirs-add').addEventListener('click', async () => {
			const dirs = await api.pickFolders({ title: 'Choose a story formats folder' });
			if (!dirs.length) return;
			state.formatDirs = addUnique(state.formatDirs, dirs);
			save('formatDirs');
			await loadFormats();
		});
	}

	// ---------------------------------------------------------------- navigation

	function showPage(page) {
		state.page = page;
		$('.app').dataset.page = page;
		$$('.page').forEach((p) => (p.hidden = p.dataset.page !== page));
		$$('.nav-item').forEach((b) => (b.dataset.page === page ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
		if (page === 'access') {
			state.draft = { ...state.a11y };
			renderA11yForm();
		}
		if (page === 'formats') loadFormats();
		api.saveStore('page', page);
		$('#main').scrollTop = 0;
	}

	function wireNav() {
		$$('.nav-item').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
		$$('[data-goto]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.goto)));
		$('#log-clear').addEventListener('click', () => $('#log').replaceChildren());
		$('#log-copy').addEventListener('click', () => {
			const text = $$('#log li')
				.map((li) => li.textContent)
				.join('\n');
			api.copyText(text).then(() => toast('Log copied.', 'success'));
		});
		document.addEventListener('keydown', (e) => {
			const mod = e.ctrlKey || e.metaKey;
			if (!mod) return;
			if (e.key.toLowerCase() === 'b') {
				e.preventDefault();
				runBuild();
			} else if (e.key === '=' || e.key === '+') {
				e.preventDefault();
				setScale(state.a11y.scale + 0.1, { commit: true });
			} else if (e.key === '-') {
				e.preventDefault();
				setScale(state.a11y.scale - 0.1, { commit: true });
			} else if (e.key === '0') {
				e.preventDefault();
				setScale(1, { commit: true });
			}
		});
		$$('a[target="_blank"]').forEach((a) =>
			a.addEventListener('click', (e) => {
				e.preventDefault();
				api.openExternal(a.href);
			})
		);
	}

	// ---------------------------------------------------------------- start up

	async function init() {
		const [info, stored, charsets] = await Promise.all([api.appInfo(), api.loadStore(), api.charsets()]);
		state.info = info;
		state.a11y = { ...DEFAULT_A11Y, ...(stored.a11y || {}) };
		state.draft = { ...state.a11y };
		state.build = { ...DEFAULT_BUILD, ...(stored.build || {}) };
		state.decompile = { ...DEFAULT_DECOMPILE, ...(stored.decompile || {}) };
		state.formatDirs = stored.formatDirs || [];
		state.presets = { a11y: {}, build: {}, ...(stored.presets || {}) };

		applyA11y(document.documentElement, state.a11y);
		updateThemeToggle();

		const cs = $('#build-charset');
		cs.append(el('option', { value: '' }, 'Automatic (UTF-8)'));
		for (const c of charsets) cs.append(el('option', { value: c }, c.toUpperCase()));

		$('#about-version').textContent = `v${info.version}`;

		wireNav();
		wireA11y();
		wireBuild();
		wireDecompile();
		wireFormats();
		$$('.preset-bar').forEach(renderPresetBar);

		await loadFormats();
		renderBuildForm();
		renderDecompileForm();
		renderA11yForm();
		rescanSources();
		showPage(stored.page || 'build');
	}

	init().catch((err) => {
		console.error(err);
		toast(`NesTwee could not start properly: ${err.message}`, 'error', 10000);
	});

	// Exposed for tests and screenshots only.
	window.__nestwee = { state, applyA11y, showPage, renderA11yForm };
})();
