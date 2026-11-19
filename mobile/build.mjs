// Builds the web files for the Android apps into mobile/www.
//   node mobile/build.mjs phone    simplified phone layout
//   node mobile/build.mjs tablet   the desktop interface, adapted for touch
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const target = process.argv[2] || 'phone';
if (!['phone', 'tablet'].includes(target)) throw new Error(`Unknown target "${target}". Use phone or tablet.`);
const out = path.join(here, 'www');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Node-only modules the engine never calls on Android.
const shims = {
	name: 'nestwee-shims',
	setup(b) {
		const empty = path.join(here, 'src/shims/empty.js');
		b.onResolve({ filter: /^(fs|os|iconv-lite|crypto)$/ }, () => ({ path: empty }));
		b.onResolve({ filter: /^path$/ }, () => ({ path: path.join(here, 'src/shims/path.js') }));
		b.onResolve({ filter: /io-node$/ }, () => ({ path: empty }));
	},
};

await build({
	entryPoints: [path.join(here, 'src/bridge.js')],
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: ['chrome100'],
	outfile: path.join(out, 'bridge.js'),
	plugins: [shims],
	define: { __NESTWEE_VERSION__: JSON.stringify(pkg.version) },
	minify: true,
	legalComments: 'linked',
	logLevel: 'warning',
});

const copy = (from, to) => {
	fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
	fs.cpSync(path.join(root, from), path.join(out, to), { recursive: true });
};
const write = (to, text) => fs.writeFileSync(path.join(out, to), text);
const fixAssets = (text) => text.replaceAll('../../assets/', 'assets/');

// Shared look: the desktop stylesheet, logo and fonts.
write('styles.css', fixAssets(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8')));
copy('mobile/src/preview.css', 'preview.css');
copy('assets/logo.svg', 'assets/logo.svg');
copy('assets/fonts', 'assets/fonts');

// Bundled story formats.
const formatIds = fs
	.readdirSync(path.join(root, 'storyformats'))
	.filter((id) => fs.existsSync(path.join(root, 'storyformats', id, 'format.js')))
	.sort();
for (const id of formatIds) copy(`storyformats/${id}`, `formats/${id}`);
write('formats/index.json', JSON.stringify(formatIds));

if (target === 'phone') {
	for (const f of ['index.html', 'phone.css', 'phone.js']) copy(`mobile/src/phone/${f}`, f);
} else {
	let html = fixAssets(fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8'));
	// Story previews run in an iframe that would inherit this policy and block the
	// story's own scripts, so the Android build leaves it out (everything is local).
	html = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
	html = html.replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n\t<link rel="stylesheet" href="preview.css">\n\t<link rel="stylesheet" href="tablet.css">');
	html = html.replace('<script src="app.js"></script>', '<script src="bridge.js"></script>\n\t<script src="app.js"></script>\n\t<script src="tablet.js"></script>');
	write('index.html', html);
	copy('src/renderer/app.js', 'app.js');
	copy('mobile/src/tablet/tablet.css', 'tablet.css');
	copy('mobile/src/tablet/tablet.js', 'tablet.js');
}

console.log(`Built the ${target} app into ${path.relative(root, out)}/ (${formatIds.length} story formats).`);
