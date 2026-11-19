'use strict';
/*
	The build pipeline: gather sources, load them, choose a story format and
	write the requested output. Equivalent to running `tweego` once.

	Ported from Tweego's tweego.go and config.go (mergeStoryConfig)
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const fs = require('fs');
const path = require('path');
const { compile } = require('./core');
const { StoryFormatsMap } = require('./formats');
const { getFilenames } = require('./files');
const { BuildError } = require('./util');
const { MODES, DEFAULT_FORMAT_ID, DEFAULT_CONFIG, makeLogger } = require('./core');

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
	const { output, story, startName, externalFiles } = compile(sourcePaths, modulePaths, c, { ...ctx, formats, log });

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
