'use strict';
/*
	The build pipeline: gather sources, load them, choose a story format and
	write the requested output. Equivalent to running `tweego` once.

	Ported from Tweego's tweego.go and config.go (mergeStoryConfig)
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const fs = require('fs');
const path = require('path');
const { Story, DEFAULT_START_NAME } = require('./story');
const { StoryFormatsMap } = require('./formats');
const { getFilenames } = require('./files');
const { modifyHead } = require('./modules');
const { BuildError, readText } = require('./util');
const { OUT_TWEE3, OUT_TWEE1 } = require('./passage');

const DEFAULT_FORMAT_ID = 'sugarcube-2';

const MODES = Object.freeze({
	HTML: 'html',
	TWEE3: 'twee3',
	TWEE1: 'twee1',
	ARCHIVE_TWINE2: 'archive-twine2',
	ARCHIVE_TWINE1: 'archive-twine1',
});

const DEFAULT_CONFIG = Object.freeze({
	sources: [],
	modules: [],
	headFile: '',
	outFile: '',
	mode: MODES.HTML,
	format: '', // blank = use StoryData, then sugarcube-2
	start: '', // blank = use StoryData, then "Start"
	encoding: '',
	trim: true,
	twee2Compat: false,
	test: false,
	logFiles: false,
	logStats: false,
	skipHidden: false,
	lineEndings: 'auto', // twee output only: auto | lf | crlf
});

function makeLogger(sink) {
	const entries = [];
	const push = (level) => (message) => {
		const e = { level, message, time: Date.now() };
		entries.push(e);
		if (sink) sink(e);
	};
	return { entries, info: push('info'), warn: push('warn'), error: push('error'), success: push('success') };
}

function formatList(formats) {
	if (!formats || formats.isEmpty()) return 'No story formats were found. Add a story formats folder on the Story Formats page.';
	return (
		'Available formats:\n' +
		formats
			.list()
			.map((f) => `  ${f.id}  (${f.twine2 ? `${f.name} ${f.version}` : 'Twine 1 style'})`)
			.join('\n')
	);
}

/**
 * Run one build.
 * @param {object} cfg see DEFAULT_CONFIG
 * @param {object} ctx { formats: StoryFormatsMap | formatDirs: string[], log, creator, creatorVersion, platform }
 */
function build(cfg, ctx = {}) {
	const c = { ...DEFAULT_CONFIG, ...cfg };
	const log = ctx.log || makeLogger();
	const started = Date.now();

	if (!c.sources || !c.sources.length) throw new BuildError('No input sources were chosen. Add at least one source folder or file.');
	if (!c.outFile) throw new BuildError('No output file was chosen.');

	const formats = ctx.formats || StoryFormatsMap.discover(ctx.formatDirs || []);
	for (const w of formats.warnings || []) log.warn(w);

	const sourcePaths = getFilenames(c.sources, { outFile: c.outFile, warn: log.warn, skipHidden: c.skipHidden });
	const modulePaths = getFilenames(c.modules || [], { outFile: c.outFile, warn: log.warn, skipHidden: c.skipHidden });
	const externalFiles = [];

	const story = new Story({ log, creator: ctx.creator || 'NesTwee', creatorVersion: ctx.creatorVersion || '0.0.0' });
	story.load(sourcePaths, { encoding: c.encoding, trim: c.trim, twee2Compat: c.twee2Compat });

	// Merge configuration with the story's own StoryData (the GUI wins).
	const isHTML = c.mode === MODES.HTML;
	let formatID;
	if (c.format) {
		formatID = c.format;
	} else if (story.twine2.format) {
		formatID = formats.getIDFromTwine2NameAndVersion(story.twine2.format, story.twine2.formatVersion, log.warn);
		if (!formatID && isHTML) {
			throw new BuildError(
				`Story format named "${story.twine2.format}" at version "${story.twine2.formatVersion}" is not available.\n${formatList(formats)}`
			);
		}
	} else {
		formatID = DEFAULT_FORMAT_ID;
	}
	if (formatID && formats.hasByID(formatID)) {
		story.format = formats.getByID(formatID);
	} else if (isHTML) {
		throw new BuildError(`Story format "${formatID}" is not available.\n${formatList(formats)}`);
	}

	const startName = c.start || story.twine2.start || DEFAULT_START_NAME;
	if (c.test) story.twine2.options.debug = true;

	let output;
	switch (c.mode) {
		case MODES.TWEE3:
		case MODES.TWEE1: {
			output = story.toTwee(c.mode === MODES.TWEE3 ? OUT_TWEE3 : OUT_TWEE1);
			const platform = ctx.platform || process.platform;
			if (c.lineEndings === 'crlf' || (c.lineEndings === 'auto' && platform === 'win32')) {
				output = output.replace(/\n/g, '\r\n');
			}
			break;
		}
		case MODES.ARCHIVE_TWINE2:
			output = story.toTwine2Archive(startName);
			break;
		case MODES.ARCHIVE_TWINE1:
			output = story.toTwine1Archive(startName);
			break;
		case MODES.HTML: {
			if (!story.has(startName)) throw new BuildError(`Starting passage "${startName}" not found.`);
			if ((story.format.isTwine1Style() || !story.name) && !story.has('StoryTitle')) {
				throw new BuildError('Special passage "StoryTitle" not found.');
			}
			let html;
			if (story.format.isTwine2Style()) {
				html = story.toTwine2HTML(startName);
			} else {
				html = story.toTwine1HTML(startName, {
					readComponent(file, optional = false) {
						try {
							return readText(file);
						} catch (err) {
							if (optional && err.code === 'ENOENT') return null;
							throw new BuildError(err.message);
						}
					},
				});
			}
			output = modifyHead(html, modulePaths, c.headFile, c.encoding, {
				warn: log.warn,
				onFile: (f) => externalFiles.push(f),
			});
			break;
		}
		default:
			throw new BuildError(`Unknown output mode "${c.mode}".`);
	}

	fs.mkdirSync(path.dirname(path.resolve(c.outFile)), { recursive: true });
	fs.writeFileSync(c.outFile, output, 'utf8');

	const stats = {
		passages: story.counts.passages,
		storyPassages: story.counts.storyPassages,
		words: story.counts.storyWords,
		projectFiles: story.projectFiles,
		externalFiles,
		bytes: Buffer.byteLength(output, 'utf8'),
		ms: Date.now() - started,
		format: story.format ? story.format.toJSON() : null,
		startName,
		storyName: story.name,
		ifid: story.ifid,
	};

	if (c.logFiles) {
		log.info(
			`Processed files (in order)\n  Project files: ${stats.projectFiles.length}\n` +
				stats.projectFiles.map((f) => `    ${f}`).join('\n') +
				`\n  External files: ${externalFiles.length}` +
				(externalFiles.length ? '\n' + externalFiles.map((f) => `    ${f}`).join('\n') : '')
		);
	}
	if (c.logStats) {
		log.info(`Statistics\n  Total> Passages: ${stats.passages}\n  Story> Passages: ${stats.storyPassages}, Words: ${stats.words}`);
	}
	return { outFile: path.resolve(c.outFile), stats, log: log.entries };
}

module.exports = { build, makeLogger, MODES, DEFAULT_CONFIG, DEFAULT_FORMAT_ID };
