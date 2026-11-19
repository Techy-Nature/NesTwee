'use strict';
/*
	The NesTwee compiler for the phone app. It runs the same engine as the
	desktop app, reading from files held in memory instead of the disk.
*/

const io = require('../../src/engine/io');
const memory = require('./io-memory');
const { compile, makeLogger, DEFAULT_CONFIG } = require('../../src/engine/core');
const { StoryFormat, StoryFormatsMap } = require('../../src/engine/formats');
const { fileKind, newIFID } = require('../../src/engine/util');

io.set(memory);

/** Sort like a recursive folder walk: by path, folder by folder. */
function walkOrder(a, b) {
	const pa = a.split('/');
	const pb = b.split('/');
	for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
		if (pa[i] === pb[i]) continue;
		const lastA = i === pa.length - 1;
		const lastB = i === pb.length - 1;
		return pa[i] < pb[i] ? -1 : 1;
	}
	return pa.length - pb.length;
}

/**
 * @param {{path:string, bytes:Uint8Array}[]} sources
 * @param {{id:string, text:string}[]} formatList
 */
function makeFormats(formatList) {
	const map = new StoryFormatsMap();
	for (const f of formatList) {
		const filename = `formats/${f.id}/format.js`;
		memory.files.set(filename, new TextEncoder().encode(f.text));
		const sf = new StoryFormat({ id: f.id, filename, twine2: true });
		try {
			sf.loadMetadata();
			map.formats.set(f.id, sf);
		} catch (err) {
			map.warnings.push(`format ${f.id}: Skipping format; ${err.message}`);
		}
	}
	return map;
}

function describeFormat(text, id = 'imported') {
	const memPath = `inspect/${Math.random()}/format.js`;
	memory.files.set(memPath, new TextEncoder().encode(text));
	try {
		const sf = new StoryFormat({ id, filename: memPath, twine2: true });
		sf.loadMetadata();
		return sf.toJSON();
	} finally {
		memory.files.delete(memPath);
	}
}

function place(prefix, list) {
	const out = [];
	for (const s of list || []) {
		const p = prefix + s.path.replace(/^\/+/, '');
		memory.files.set(p, s.bytes);
		out.push(p);
	}
	return out.sort(walkOrder);
}

/**
 * @param {object} args
 * @param {{path:string, bytes:Uint8Array}[]} args.sources story files
 * @param {{path:string, bytes:Uint8Array}[]} [args.modules] module files
 * @param {{path:string, bytes:Uint8Array}} [args.head] head file
 * @param {{id:string, text:string}[]} args.formats available story formats
 */
function build({ sources, modules = [], head = null, formats, cfg, creatorVersion }) {
	const log = makeLogger();
	const started = Date.now();
	const c = { ...DEFAULT_CONFIG, ...cfg };
	for (const key of [...memory.files.keys()]) if (/^(src|mod|head)\//.test(key)) memory.files.delete(key);
	const hidden = (p) => c.skipHidden && p.split('/').some((seg) => seg.startsWith('.'));
	const paths = place('src/', sources).filter((p) => !hidden(p));
	const modulePaths = place('mod/', modules).filter((p) => !hidden(p));
	c.headFile = head ? place('head/', [head])[0] : '';
	try {
		const map = makeFormats(formats);
		for (const w of map.warnings) log.warn(w);
		const { output, story, startName } = compile(paths, modulePaths, c, { formats: map, log, creator: 'NesTwee', creatorVersion, platform: 'linux' });
		const stats = {
			passages: story.counts.passages,
			storyPassages: story.counts.storyPassages,
			words: story.counts.storyWords,
			ms: Date.now() - started,
			format: story.format ? story.format.toJSON() : null,
			startName,
			storyName: story.name,
		};
		if (c.logStats) log.info(`Statistics\n  Total> Passages: ${stats.passages}\n  Story> Passages: ${stats.storyPassages}, Words: ${stats.words}`);
		return { ok: true, output, stats, log: log.entries };
	} catch (err) {
		log.error(err.message || String(err));
		return { ok: false, code: err.code || null, log: log.entries };
	}
}

module.exports = { build, describeFormat, fileKind, newIFID };
