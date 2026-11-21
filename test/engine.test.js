'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const engine = require('../src/engine');
const { lex, ItemType } = require('../src/engine/lexer');
const { toV3 } = require('../src/engine/twee2compat');
const { tweeEscape, tweeUnescape } = require('../src/engine/escaping');

const FORMAT_DIRS = [path.join(__dirname, '..', 'storyformats')];
const IFID = 'D674C58C-DEFA-4F70-B7A2-27742230C0FC';

function tmpProject(files) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestwee-test-'));
	for (const [name, content] of Object.entries(files)) {
		const full = path.join(dir, 'src', name);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	return dir;
}

const BASIC = `:: StoryTitle
Test Story

:: StoryData
{
	"ifid": "${IFID}"
}

:: Start [tag-a tag-b] {"position":"100,200","size":"200,100"}
Hello & <b>world</b>! [[Next]]

:: Next
The end.
`;

test('lexer splits headers, tags, metadata and content', () => {
	const items = lex(':: A [x y] {"position":"1,2"}\nbody\n:: B\nmore');
	const types = items.map((i) => i.type);
	assert.deepStrictEqual(types, [
		ItemType.Header, ItemType.Name, ItemType.Tags, ItemType.Metadata, ItemType.Content,
		ItemType.Header, ItemType.Name, ItemType.Content, ItemType.EOF,
	]);
	assert.strictEqual(items[2].val, '[x y]');
	assert.strictEqual(items[4].val, 'body\n');
});

test('lexer reports unterminated tag blocks with a line number', () => {
	const items = lex('\n\n:: A [x y\nbody');
	const err = items.find((i) => i.type === ItemType.Error);
	assert.ok(err);
	assert.match(err.val, /unterminated tag block/);
	assert.strictEqual(err.line, 3);
});

test('twee escaping round-trips', () => {
	const name = 'odd [name] {with} \\ slash';
	assert.strictEqual(tweeUnescape(tweeEscape(name)), name);
});

test('twee2 headers convert to twee3 metadata', () => {
	assert.strictEqual(toV3(':: Start [a] <10,20>\ntext'), ':: Start [a] {"position":"10,20"}\ntext');
});

test('compiles to HTML with a bundled story format and decompiles back', () => {
	const dir = tmpProject({ 'story.twee': BASIC, 'css/style.css': 'body { color: red; }' });
	const out = path.join(dir, 'out.html');
	const res = engine.build({ sources: [path.join(dir, 'src')], outFile: out }, { formatDirs: FORMAT_DIRS });
	const html = fs.readFileSync(out, 'utf8');
	assert.match(html, /<tw-storydata name="Test Story" startnode="1" creator="NesTwee"/);
	assert.match(html, /format="SugarCube"/);
	assert.match(html, /Hello &amp; &lt;b&gt;world&lt;\/b&gt;!/);
	assert.match(html, /tags="tag-a tag-b" position="100,200" size="200,100"/);
	assert.match(html, /body \{ color: red; \}/);
	assert.strictEqual(res.stats.storyPassages, 2);

	const back = path.join(dir, 'back.twee');
	engine.build({ sources: [out], outFile: back, mode: 'twee3' }, { formatDirs: FORMAT_DIRS, platform: 'linux' });
	const twee = fs.readFileSync(back, 'utf8');
	assert.match(twee, /:: Start \[tag-a tag-b\] \{"position":"100,200","size":"200,100"\}\nHello & <b>world<\/b>! \[\[Next\]\]/);
	assert.match(twee, /:: StoryTitle\nTest Story/);
	assert.match(twee, new RegExp(`"ifid": "${IFID}"`));
});

test('the output file can never be an input', () => {
	const dir = tmpProject({ 'story.twee': BASIC });
	const out = path.join(dir, 'src', 'out.html');
	fs.writeFileSync(out, '');
	assert.throws(
		() => engine.build({ sources: [path.join(dir, 'src')], outFile: out }, { formatDirs: FORMAT_DIRS }),
		/cannot be an input/
	);
});

test('missing IFID produces a helpful error with a fresh IFID', () => {
	const dir = tmpProject({ 'story.twee': ':: StoryTitle\nX\n\n:: Start\nHi' });
	assert.throws(
		() => engine.build({ sources: [path.join(dir, 'src')], outFile: path.join(dir, 'o.html') }, { formatDirs: FORMAT_DIRS }),
		(err) => err.code === 'MISSING_IFID' && /"ifid": "[0-9A-F-]{36}"/.test(err.message)
	);
});

test('modules and head file are injected before </head>', () => {
	const dir = tmpProject({ 'story.twee': BASIC });
	fs.writeFileSync(path.join(dir, 'mod.js'), 'window.x = 1;');
	fs.writeFileSync(path.join(dir, 'head.html'), '<meta name="nestwee-test" content="1">');
	const out = path.join(dir, 'o.html');
	engine.build(
		{ sources: [path.join(dir, 'src')], outFile: out, modules: [path.join(dir, 'mod.js')], headFile: path.join(dir, 'head.html'), format: 'harlowe-3' },
		{ formatDirs: FORMAT_DIRS }
	);
	const html = fs.readFileSync(out, 'utf8');
	assert.match(html, /<script id="script-module-mod" type="text\/javascript">window.x = 1;<\/script>\n<meta name="nestwee-test" content="1">\n<\/head>/);
});

test('format auto-selection honours StoryData name and major version', () => {
	const formats = engine.StoryFormatsMap.discover(FORMAT_DIRS);
	assert.strictEqual(formats.getIDFromTwine2NameAndVersion('Harlowe', '3.0.0'), 'harlowe-3');
	assert.strictEqual(formats.getIDFromTwine2NameAndVersion('Harlowe', '2.0.0'), '');
	assert.strictEqual(formats.getIDFromTwine2NameAndVersion('SugarCube', '2.30.0'), 'sugarcube-2');
});

test('twine 2 archive and twine 1 archive outputs', () => {
	const dir = tmpProject({ 'story.twee': BASIC });
	const a2 = path.join(dir, 'a2.html');
	engine.build({ sources: [path.join(dir, 'src')], outFile: a2, mode: 'archive-twine2' }, { formatDirs: FORMAT_DIRS });
	assert.match(fs.readFileSync(a2, 'utf8'), /^<!-- UUID:\/\/[^/]+\/\/ --><tw-storydata /);
	const a1 = path.join(dir, 'a1.html');
	engine.build({ sources: [path.join(dir, 'src')], outFile: a1, mode: 'archive-twine1' }, { formatDirs: FORMAT_DIRS });
	assert.match(fs.readFileSync(a1, 'utf8'), /^<div id="storeArea" data-size="4" hidden><div tiddler="StoryTitle"/);
});

test('media files become Twine.image passages', () => {
	const dir = tmpProject({ 'story.twee': BASIC });
	fs.writeFileSync(path.join(dir, 'src', 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const out = path.join(dir, 'o.twee');
	engine.build({ sources: [path.join(dir, 'src')], outFile: out, mode: 'twee3' }, { formatDirs: FORMAT_DIRS, platform: 'linux' });
	assert.match(fs.readFileSync(out, 'utf8'), /:: pic \[Twine.image\]\ndata:image\/png;base64,iVBORw==/);
});

test('scan summary groups files by kind and ignores unknown ones', () => {
	const dir = tmpProject({ 'a.twee': BASIC, 'b/c.css': '', 'notes.txt': 'x' });
	const s = engine.scanSummary([path.join(dir, 'src')]);
	assert.strictEqual(s.counts.twee, 1);
	assert.strictEqual(s.counts.css, 1);
	assert.strictEqual(s.ignored, 1);
});

test('watch triggers a rebuild on change', async () => {
	const dir = tmpProject({ 'a.twee': BASIC });
	let changed = 0;
	const w = engine.watch([path.join(dir, 'src')], { onChange: () => changed++, delay: 50 });
	await new Promise((r) => setTimeout(r, 100));
	fs.writeFileSync(path.join(dir, 'src', 'a.twee'), BASIC + '\n:: More\nx');
	await new Promise((r) => setTimeout(r, 400));
	w.close();
	assert.ok(changed >= 1);
});

test('formats wrapped in Object.assign (like Duplex) are discovered', () => {
	const formats = engine.StoryFormatsMap.discover(FORMAT_DIRS);
	const duplex = formats.getByID('duplex-1');
	assert.ok(duplex);
	assert.strictEqual(duplex.name, 'Duplex');
	assert.strictEqual(duplex.version, '1.10.0');
	assert.match(duplex.source(), /\{\{STORY_DATA\}\}/);
});

test('proofing formats compile like any other format', () => {
	const dir = tmpProject({ 'story.twee': BASIC });
	const out = path.join(dir, 'proof.html');
	engine.build({ sources: [path.join(dir, 'src')], outFile: out, format: 'paperthin-1' }, { formatDirs: FORMAT_DIRS });
	assert.match(fs.readFileSync(out, 'utf8'), /format="Paperthin"/);
});
