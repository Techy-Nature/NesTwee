'use strict';
/*
	Story format discovery and selection.

	Ported from Tweego's formats.go and config.go (search directory rules).
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const semver = require('semver');
const { readText } = require('./util');

const SEARCH_DIRNAMES = [
	'storyformats',
	'.storyformats',
	'story-formats', // deprecated
	'storyFormats', // deprecated
	'targets', // deprecated
];

function isDir(p) {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function isFile(p) {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
}

function parseVersion(v) {
	if (!v) return null;
	return semver.valid(v) ? semver.parse(v) : semver.coerce(v);
}

/** Extract the JSON chunk from a Twine 2 style `format.js`. */
function getStoryFormatData(id, source) {
	const first = source.indexOf('{');
	const last = source.lastIndexOf('}');
	if (first === -1 || last === -1) {
		throw new Error('Could not find Twine 2 style story format JSON chunk.');
	}
	let chunk = source.slice(first, last + 1);
	try {
		return JSON.parse(chunk);
	} catch {
		// Harlowe's chunk ends with a non-JSON `"setup": function…` property.
		if (id.toLowerCase().startsWith('harlowe')) {
			const i = chunk.lastIndexOf(',"setup": function');
			if (i !== -1) {
				chunk = chunk.slice(0, i) + '}';
				try {
					return JSON.parse(chunk);
				} catch {
					/* fall through */
				}
			}
		}
		// Formats such as Duplex wrap their JSON in Object.assign({...}, {...code});
		// fall back to the first balanced JSON object in the file.
		const balanced = firstBalancedObject(source, first);
		if (balanced) {
			try {
				return JSON.parse(balanced);
			} catch {
				/* fall through */
			}
		}
		throw new Error('Could not decode story format JSON chunk.');
	}
}

/** Return the first `{…}` block starting at `start`, honouring JSON strings. */
function firstBalancedObject(text, start) {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			if (c === '\\') i++;
			else if (c === '"') inString = false;
			continue;
		}
		if (c === '"') inString = true;
		else if (c === '{') depth++;
		else if (c === '}') {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

class StoryFormat {
	constructor({ id, filename, twine2 }) {
		this.id = id;
		this.filename = filename;
		this.twine2 = twine2;
		this.name = '';
		this.version = '';
		this.proofing = false;
		this.author = '';
		this.description = '';
		this.license = '';
	}

	isTwine2Style() {
		return this.twine2;
	}

	isTwine1Style() {
		return !this.twine2;
	}

	loadMetadata() {
		if (!this.twine2) {
			this.name = this.id;
			return;
		}
		const data = getStoryFormatData(this.id, readText(this.filename));
		this.name = data.name || '';
		this.version = data.version || '';
		this.proofing = !!data.proofing;
		this.author = typeof data.author === 'string' ? data.author : '';
		this.description = typeof data.description === 'string' ? data.description.replace(/<[^>]*>/g, '') : '';
		this.license = typeof data.license === 'string' ? data.license : '';
	}

	source() {
		const text = readText(this.filename);
		if (this.twine2) {
			const data = getStoryFormatData(this.id, text);
			return String(data.source || '');
		}
		return text;
	}

	toJSON() {
		return {
			id: this.id,
			filename: this.filename,
			twine2: this.twine2,
			name: this.name,
			version: this.version,
			proofing: this.proofing,
			author: this.author,
			description: this.description,
			license: this.license,
		};
	}
}

/**
 * Default search directories, mirroring Tweego: `storyformats` style folders
 * next to the program, in the home folder, and in the working directory,
 * plus anything listed in the TWEEGO_PATH environment variable.
 */
function defaultSearchDirs({ programDirs = [], workingDir = null } = {}) {
	const bases = [];
	for (const p of programDirs) if (p && !bases.includes(p)) bases.push(p);
	const home = os.homedir();
	if (home && !bases.includes(home)) bases.push(home);
	if (workingDir && !bases.includes(workingDir)) bases.push(workingDir);

	const dirs = [];
	for (const base of bases) {
		for (const name of SEARCH_DIRNAMES) {
			const d = path.join(base, name);
			if (isDir(d) && !dirs.includes(d)) dirs.push(d);
		}
	}
	if (process.env.TWEEGO_PATH) {
		for (const d of process.env.TWEEGO_PATH.split(path.delimiter)) {
			if (d && !dirs.includes(d)) dirs.push(d);
		}
	}
	return dirs;
}

class StoryFormatsMap {
	constructor() {
		this.formats = new Map();
		this.warnings = [];
	}

	static discover(searchDirs) {
		const map = new StoryFormatsMap();
		for (const dir of searchDirs) {
			if (!isDir(dir)) continue;
			let names;
			try {
				names = fs.readdirSync(dir).sort();
			} catch {
				continue;
			}
			for (const base of names) {
				const formatDir = path.join(dir, base);
				if (!isDir(formatDir)) continue;
				for (const file of ['format.js', 'header.html']) {
					const filename = path.join(formatDir, file);
					if (!isFile(filename)) continue;
					const f = new StoryFormat({ id: base, filename, twine2: file === 'format.js' });
					try {
						f.loadMetadata();
					} catch (err) {
						map.warnings.push(`format ${base}: Skipping format; ${err.message}`);
						break;
					}
					map.formats.set(base, f); // later directories override earlier ones
					break;
				}
			}
		}
		return map;
	}

	isEmpty() {
		return this.formats.size === 0;
	}

	ids() {
		return [...this.formats.keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
	}

	list() {
		return this.ids().map((id) => this.formats.get(id));
	}

	hasByID(id) {
		return this.formats.has(id);
	}

	getByID(id) {
		return this.formats.get(id);
	}

	getIDFromTwine2Name(name) {
		let found = null;
		let id = '';
		for (const f of this.formats.values()) {
			if (!f.twine2 || f.name !== name) continue;
			const have = parseVersion(f.version);
			if (have && (!found || semver.gt(have, found))) {
				found = have;
				id = f.id;
			}
		}
		return id;
	}

	/** Greatest version with the same major version that is >= the wanted one. */
	getIDFromTwine2NameAndVersion(name, version, warn = () => {}) {
		const wanted = parseVersion(version);
		if (!wanted) warn(`format "${name}": Auto-selecting greatest version; Could not parse version "${version}".`);
		let found = null;
		let id = '';
		for (const f of this.formats.values()) {
			if (!f.twine2 || f.name !== name) continue;
			const have = parseVersion(f.version);
			if (!have) continue;
			if (!wanted || (have.major === wanted.major && semver.gte(have, wanted))) {
				if (!found || semver.gt(have, found)) {
					found = have;
					id = f.id;
				}
			}
		}
		return id;
	}
}

module.exports = { StoryFormat, StoryFormatsMap, defaultSearchDirs, getStoryFormatData, SEARCH_DIRNAMES };
