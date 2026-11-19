/*
	Tablet tweaks for the desktop interface on Android: folders come from
	Android's folder picker (with permissions managed in the Accessibility
	settings), there's no folder watching, and the "open"/"show" buttons
	preview and share instead.
*/
(() => {
	const $ = (s) => document.querySelector(s);
	const setText = (sel, text) => {
		const el = $(sel);
		if (!el) return;
		const node = [...el.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
		if (node) node.textContent = text;
		else el.append(text);
	};
	document.documentElement.classList.add('nt-tablet');
	setText('#add-source-folders', 'Add folder…');
	setText('#add-module-folders', 'Add folder…');
	setText('#add-source-files', 'Add files or .zip…');
	setText('#add-module-files', 'Add files or .zip…');
	setText('#build-open', 'Preview');
	setText('#build-show', 'Share');
	setText('#dec-open', 'Share Twee file');

	const help = $('.page[data-page="build"] .card .muted.small');
	if (help) help.textContent = 'Add the folder that holds your story (its folders are searched too), a .zip of it, or the files themselves. Twee, Twine HTML, CSS, JS, fonts, images, audio and video are used.';
	const fmt = $('.page[data-page="formats"] p.muted');
	if (fmt) fmt.innerHTML = 'NesTwee ships with SugarCube, Harlowe, Chapbook, Snowman, Duplex and Paperthin. Import any other <code>format.js</code> to use other formats, proofing formats or newer versions.';
	const sub = $('.brand-sub');
	if (sub) sub.textContent = 'Twee & Twine compiler · tablet';

	// Folder permissions live in the Accessibility settings, below the settings and preview.
	const grid = $('.page[data-page="access"] .access-grid');
	if (grid && window.nestweeMobile) {
		const card = document.createElement('div');
		card.className = 'card nt-folder-card';
		card.id = 'folder-settings';
		grid.after(card);
		const toast = (message, kind = 'info') => {
			const t = document.createElement('div');
			t.className = `toast ${kind}`;
			t.setAttribute('role', 'status');
			t.textContent = message;
			const box = $('#toasts');
			if (!box) return;
			box.append(t);
			setTimeout(() => t.remove(), 4200);
		};
		window.nestweeMobile.renderFolderSettings(card, { toast });
	}
})();
