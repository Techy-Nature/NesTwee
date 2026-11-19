/*
	Tablet tweaks for the desktop interface: Android can't hand over whole
	folders or watch them, so folder buttons take .zip files and the
	"open"/"show" buttons preview and share instead.
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
	setText('#add-source-folders', 'Add .zip…');
	setText('#add-module-folders', 'Add .zip…');
	setText('#build-open', 'Preview');
	setText('#build-show', 'Share');
	setText('#dec-open', 'Share Twee file');
	const help = document.querySelector('.page[data-page="build"] .card .muted.small');
	if (help) help.textContent = 'Add a .zip of your project folder (its folders are searched too), or pick files. Twee, Twine HTML, CSS, JS, fonts, images, audio and video are used.';
	const lead = $('.page[data-page="build"] .page-head p.muted') || $('.page[data-page="build"] p.muted');
	if (lead) lead.textContent = 'Pick a .zip of your story or its files, choose a story format, and build a playable HTML file.';
	const fmt = $('.page[data-page="formats"] p.muted');
	if (fmt) fmt.innerHTML = 'NesTwee ships with SugarCube, Harlowe, Chapbook, Snowman, Duplex and Paperthin. Import any other <code>format.js</code> to use other formats, proofing formats or newer versions.';
	// app.js writes the empty-list hint into data-empty; reword it for zips.
	const list = $('#sources-list');
	if (list) {
		const fix = () => {
			if (/folder/.test(list.dataset.empty || '')) list.dataset.empty = 'No sources yet. Add a .zip of your story, or its files.';
		};
		new MutationObserver(fix).observe(list, { attributes: true, attributeFilter: ['data-empty'] });
		fix();
	}
	const sub = $('.brand-sub');
	if (sub) sub.textContent = 'Twee & Twine compiler · tablet';
})();
