'use strict';
/*
	Story model: loading sources and producing output.

	Ported from Tweego's story.go, storydata.go, storyload.go and storyout.go
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const path = require('path');
const parse5 = require('parse5');
const { lex, ItemType } = require('./lexer');
const { Passage, OUT_TWEE3 } = require('./passage');
const { tweeUnescape, tiddlerUnescape, htmlEscape, attrEscape } = require('./escaping');
const { toV3: twee2ToV3 } = require('./twee2compat');
const {
	BuildError,
	normalizedFileExt,
	mediaTypeFromFilename,
	mediaTypeFromExt,
	validateIFID,
	newIFID,
	readText,
	readBase64,
	fontHint,
	fileKind,
} = require('./util');

const DEFAULT_START_NAME = 'Start';

class Story {
	constructor({ log, creator = 'NesTwee', creatorVersion = '0.0.0' } = {}) {
		this.name = '';
		this.ifid = '';
		this.passages = [];
		this.legacyIFID = '';
		this.twine1 = { settings: {} };
		this.twine2 = {
			format: '',
			formatVersion: '',
			options: {},
			start: '',
			tagColors: {},
			zoom: 1,
		};
		this.format = null;
		this.processed = new Set();
		this.projectFiles = [];
		this.counts = { passages: 0, storyPassages: 0, storyWords: 0 };
		this.creator = creator;
		this.creatorVersion = creatorVersion;
		this.log = log || { info() {}, warn() {}, error() {} };
	}

	// ---- collection helpers ----------------------------------------------

	has(name) {
		return this.index(name) !== -1;
	}

	index(name) {
		return this.passages.findIndex((p) => p.name === name);
	}

	get(name) {
		return this.passages.find((p) => p.name === name) || null;
	}

	_count(p) {
		this.counts.passages++;
		if (p.isStoryPassage()) {
			this.counts.storyPassages++;
			this.counts.storyWords += p.countWords();
		}
	}

	append(p) {
		const i = this.index(p.name);
		if (i === -1) {
			this.passages.push(p);
			this._count(p);
		} else {
			this.log.warn(`Replacing existing passage "${p.name}" with duplicate.`);
			this.passages[i] = p;
		}
	}

	prepend(p) {
		const i = this.index(p.name);
		if (i === -1) {
			this.passages.unshift(p);
			this._count(p);
		} else {
			this.log.warn(`Replacing existing passage "${p.name}" with duplicate.`);
			this.passages[i] = p;
		}
	}

	add(p) {
		switch (p.name) {
			case 'StoryIncludes':
				this.log.warn(
					'Ignoring "StoryIncludes" compiler special passage; it is recommended that you remove it. ' +
						'NesTwee searches every source folder you add recursively, so you only need to add the project\'s root folder.'
				);
				break;
			case 'StoryData':
				this.unmarshalStoryData(p.text);
				if (this.ifid) {
					try {
						validateIFID(this.ifid);
					} catch (err) {
						throw new BuildError(`Cannot validate IFID; ${err.message}.`);
					}
				}
				p.text = this.marshalStoryData();
				break;
			case 'StorySettings':
				this.unmarshalStorySettings(p.text);
				break;
			case 'StoryTitle':
				p.text = p.text.trim();
				this.name = p.text;
				break;
		}
		this.append(p);
	}

	// ---- StoryData / StorySettings ------------------------------------------

	marshalStoryData() {
		const data = {};
		if (this.ifid) data.ifid = this.ifid;
		if (this.twine2.format) data.format = this.twine2.format;
		if (this.twine2.formatVersion) data['format-version'] = this.twine2.formatVersion;
		const opts = Object.keys(this.twine2.options).filter((k) => this.twine2.options[k]);
		if (opts.length) data.options = opts;
		if (this.twine2.start) data.start = this.twine2.start;
		const tagColors = this.twine2.tagColors || {};
		if (Object.keys(tagColors).length) {
			data['tag-colors'] = Object.fromEntries(Object.keys(tagColors).sort().map((k) => [k, tagColors[k]]));
		}
		if (this.twine2.zoom) data.zoom = this.twine2.zoom;
		return JSON.stringify(data, null, '\t');
	}

	unmarshalStoryData(text) {
		let data;
		try {
			data = JSON.parse(text);
		} catch (err) {
			throw new BuildError(`Cannot unmarshal "StoryData" compiler special passage; ${err.message}.`);
		}
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			throw new BuildError('Cannot unmarshal "StoryData" compiler special passage; it must be a JSON object.');
		}
		this.ifid = String(data.ifid || '').toUpperCase();
		this.twine2.format = data.format || '';
		this.twine2.formatVersion = data['format-version'] || '';
		this.twine2.options = {};
		for (const o of Array.isArray(data.options) ? data.options : []) this.twine2.options[o] = true;
		this.twine2.start = data.start || '';
		this.twine2.tagColors = data['tag-colors'] && typeof data['tag-colors'] === 'object' ? data['tag-colors'] : {};
		if (data.zoom) this.twine2.zoom = Number(data.zoom) || 1;
	}

	unmarshalStorySettings(text) {
		const obsolete = [];
		for (let line of text.split('\n')) {
			line = line.trim();
			if (!line) continue;
			const i = line.indexOf(':');
			if (i === -1) {
				this.log.warn(`Malformed "StorySettings" entry; skipping "${line}".`);
				continue;
			}
			const key = line.slice(0, i).trim().toLowerCase();
			const val = line.slice(i + 1).trim().toLowerCase();
			if (key === 'ifid') {
				try {
					validateIFID(val);
					this.legacyIFID = val.toUpperCase();
				} catch {
					/* ignore */
				}
				obsolete.push('"ifid"');
				continue;
			}
			if (key === 'zoom') {
				obsolete.push('"zoom"');
				continue;
			}
			this.twine1.settings[key] = val;
		}
		if (obsolete.length) {
			const one = obsolete.length === 1;
			this.log.warn(
				`Detected obsolete "StorySettings" ${one ? 'entry' : 'entries'}: ${obsolete.join(', ')}. ` +
					`Please remove ${one ? 'it' : 'them'} from the "StorySettings" special passage. ` +
					'If doing so leaves the passage empty, please remove it as well.'
			);
		}
	}

	// ---- loading ------------------------------------------------------------

	load(filenames, { encoding = '', trim = true, twee2Compat = false } = {}) {
		for (const filename of filenames) {
			if (this.processed.has(filename)) {
				this.log.warn(`load ${filename}: Skipping duplicate.`);
				continue;
			}
			const ext = normalizedFileExt(filename);
			const kind = fileKind(filename);
			try {
				switch (kind) {
					case 'twee':
						this.loadTwee(filename, encoding, trim, twee2Compat);
						break;
					case 'twee2':
						this.loadTwee(filename, encoding, trim, true);
						break;
					case 'html':
						this.loadHTML(filename, encoding);
						break;
					case 'css':
						this.loadTagged('stylesheet', filename, encoding);
						break;
					case 'js':
						this.loadTagged('script', filename, encoding);
						break;
					case 'font':
						this.loadFont(filename, ext);
						break;
					case 'image':
						this.loadMedia('Twine.image', filename);
						break;
					case 'audio':
						this.loadMedia('Twine.audio', filename);
						break;
					case 'video':
						this.loadMedia('Twine.video', filename);
						break;
					case 'vtt':
						this.loadMedia('Twine.vtt', filename);
						break;
					default:
						continue;
				}
			} catch (err) {
				if (err instanceof BuildError) throw new BuildError(`load ${filename}: ${err.message}`);
				throw new BuildError(`load ${filename}: ${err.message}`);
			}
			this.processed.add(filename);
			this.projectFiles.push(filename);
		}

		if (this.name && !this.has('StoryTitle')) {
			this.prepend(new Passage('StoryTitle', [], this.name));
		}
	}

	loadTwee(filename, encoding, trim, twee2Compat) {
		let source = readText(filename, encoding);
		this.loadTweeSource(source, { trim, twee2Compat, filename });
	}

	loadTweeSource(source, { trim = true, twee2Compat = false, filename = '(source)' } = {}) {
		if (twee2Compat) source = twee2ToV3(source);
		const items = lex(source);
		let p = null;
		let pCount = 0;
		let lastType = null;
		for (const item of items) {
			switch (item.type) {
				case ItemType.Error:
					throw new BuildError(`line ${item.line}: Malformed twee source; ${item.val}.`);
				case ItemType.EOF:
					if (pCount > 0 && p) this.add(p);
					return;
				case ItemType.Header:
					pCount++;
					if (pCount > 1 && p) this.add(p);
					p = new Passage('', [], '');
					break;
				case ItemType.Name:
					p.name = tweeUnescape(item.val).trim();
					if (!p.name) throw new BuildError(`line ${item.line}: Malformed twee source; passage with no name.`);
					break;
				case ItemType.Tags:
					if (lastType !== ItemType.Name) {
						throw new BuildError(
							`line ${item.line}: Malformed twee source; optional tags block must immediately follow the passage name.`
						);
					}
					p.tags = tweeUnescape(item.val.slice(1, -1)).split(/\s+/).filter(Boolean);
					break;
				case ItemType.Metadata:
					if (lastType !== ItemType.Name && lastType !== ItemType.Tags) {
						throw new BuildError(
							`line ${item.line}: Malformed twee source; optional metadata block must immediately follow the passage name or tags block.`
						);
					}
					try {
						p.unmarshalMetadata(item.val);
					} catch (err) {
						this.log.warn(
							`load ${filename}: line ${item.line}: Malformed twee source; could not decode metadata (reason: ${err.message}).`
						);
					}
					break;
				case ItemType.Content:
					p.text = trim ? item.val.trim() : item.val;
					break;
			}
			lastType = item.type;
		}
	}

	loadHTML(filename, encoding) {
		this.loadHTMLSource(readText(filename, encoding).trim());
	}

	loadHTMLSource(source) {
		const doc = parse5.parse(source);
		const storyData = findElement(doc, (n) => n.nodeName === 'tw-storydata');
		if (storyData) {
			let startnode = 0;
			for (const a of storyData.attrs) {
				switch (a.name) {
					case 'name':
						this.name = a.value;
						break;
					case 'startnode': {
						const n = parseInt(a.value, 10);
						if (Number.isNaN(n)) this.log.warn(`Cannot parse "tw-storydata" attribute "startnode" as an integer; value "${a.value}".`);
						else startnode = n;
						break;
					}
					case 'ifid':
						this.ifid = a.value.toUpperCase();
						break;
					case 'zoom': {
						const z = parseFloat(a.value);
						if (Number.isNaN(z)) this.log.warn(`Cannot parse "tw-storydata" attribute "zoom" as a float; value "${a.value}".`);
						else this.twine2.zoom = z;
						break;
					}
					case 'format':
						this.twine2.format = a.value;
						break;
					case 'format-version':
						this.twine2.formatVersion = a.value;
						break;
					case 'options':
						for (const o of a.value.split(/\s+/).filter(Boolean)) this.twine2.options[o] = true;
						break;
				}
			}

			for (const node of storyData.childNodes || []) {
				if (!node.tagName) continue;
				let name;
				let tags = [];
				let content = '';
				let metadata = null;
				let pid = 0;
				switch (node.tagName) {
					case 'style':
					case 'script': {
						const text = textOf(node).trim();
						if (!text) continue;
						if (node.tagName === 'style') {
							name = 'Story Stylesheet';
							tags = ['stylesheet'];
						} else {
							name = 'Story JavaScript';
							tags = ['script'];
						}
						content = text;
						break;
					}
					case 'tw-tag': {
						const tn = attr(node, 'name');
						const tc = attr(node, 'color');
						this.twine2.tagColors[tn || ''] = tc || '';
						continue;
					}
					case 'tw-passagedata': {
						metadata = { position: '', size: '' };
						for (const a of node.attrs) {
							switch (a.name) {
								case 'pid': {
									const n = parseInt(a.value, 10);
									if (Number.isNaN(n)) this.log.warn(`Cannot parse "tw-passagedata" attribute "pid" as an integer; value "${a.value}".`);
									else pid = n;
									break;
								}
								case 'name':
									name = a.value;
									break;
								case 'tags':
									tags = a.value.split(/\s+/).filter(Boolean);
									break;
								case 'position':
									metadata.position = a.value;
									break;
								case 'size':
									metadata.size = a.value;
									break;
							}
						}
						if (pid === startnode) this.twine2.start = name;
						content = textOf(node);
						break;
					}
					default:
						continue;
				}
				this.add(new Passage(name, tags, content.trim(), metadata));
			}

			this.prepend(new Passage('StoryData', [], this.marshalStoryData()));
			return;
		}

		const storeArea = findElement(doc, (n) => /store(?:-a|A)rea/.test(attr(n, 'id') || ''));
		if (storeArea) {
			for (const node of storeArea.childNodes || []) {
				if (node.tagName !== 'div' || attr(node, 'tiddler') === null) continue;
				const name = attr(node, 'tiddler');
				const tags = (attr(node, 'tags') || '').split(/\s+/).filter(Boolean);
				const metadata = { position: attr(node, 'twine-position') || '', size: '' };
				const content = tiddlerUnescape(textOf(node));
				this.add(new Passage(name, tags, content.trim(), metadata));
			}
			return;
		}

		throw new BuildError('Malformed HTML source; story data not found.');
	}

	loadTagged(tag, filename, encoding) {
		this.add(new Passage(path.basename(filename), [tag], readText(filename, encoding)));
	}

	loadMedia(tag, filename) {
		const name = path.basename(filename).split('.')[0];
		this.add(new Passage(name, [tag], `data:${mediaTypeFromFilename(filename)};base64,${readBase64(filename)}`));
	}

	loadFont(filename, ext) {
		const name = path.basename(filename);
		const family = name.split('.')[0];
		this.add(
			new Passage(
				name,
				['stylesheet'],
				`@font-face {\n\tfont-family: ${JSON.stringify(family)};\n\tsrc: url("data:${mediaTypeFromExt(ext)};base64,${readBase64(
					filename
				)}") format(${JSON.stringify(fontHint(ext))});\n}`
			)
		);
	}

	// ---- output -------------------------------------------------------------

	toTwee(outMode = OUT_TWEE3) {
		return this.passages.map((p) => p.toTwee(outMode)).join('');
	}

	toTwine2Archive(startName) {
		return this.getTwine2DataChunk(startName) + '\n';
	}

	toTwine1Archive() {
		const { data, count } = this.getTwine1PassageChunk();
		return `<div id="storeArea" data-size="${count}" hidden>${data}</div>\n`;
	}

	toTwine2HTML(startName) {
		let template = this.format.source();
		if (template.includes('{{STORY_NAME}}')) {
			template = template.split('{{STORY_NAME}}').join(htmlEscape(this.name));
		}
		const marker = template.indexOf('{{STORY_DATA}}');
		if (marker !== -1) {
			template = template.slice(0, marker) + this.getTwine2DataChunk(startName) + template.slice(marker + '{{STORY_DATA}}'.length);
		}
		return template;
	}

	toTwine1HTML(startName, { readComponent }) {
		const formatDir = path.dirname(this.format.filename);
		const parentDir = path.dirname(formatDir);
		let template = this.format.source();
		const { data, count } = this.getTwine1PassageChunk();
		const replaceOnce = (search, replacement) => {
			const i = template.indexOf(search);
			if (i !== -1) template = template.slice(0, i) + replacement + template.slice(i + search.length);
		};

		if (template.includes('<a href="http://twinery.org/"')) {
			replaceOnce('<a href="http://twinery.org/"', '<a href="https://github.com/Techy-Nature/Nestwee"');
			replaceOnce('>Twine</a>', '>NesTwee</a>');
		}
		if (template.includes('"USER_LIB"')) {
			const c = readComponent(path.join(formatDir, 'userlib.js'), true);
			if (c !== null) replaceOnce('"USER_LIB"', c);
		}
		if (template.includes('"ENGINE"')) replaceOnce('"ENGINE"', readComponent(path.join(parentDir, 'engine.js')));
		for (const pattern of ['"SUGARCANE"', '"JONAH"']) {
			if (template.includes(pattern)) replaceOnce(pattern, readComponent(path.join(formatDir, 'code.js')));
		}
		if (this.twine1.settings.jquery === 'on' && template.includes('"JQUERY"')) {
			replaceOnce('"JQUERY"', readComponent(path.join(parentDir, 'jquery.js')));
		}
		if (this.twine1.settings.modernizr === 'on' && template.includes('"MODERNIZR"')) {
			replaceOnce('"MODERNIZR"', readComponent(path.join(parentDir, 'modernizr.js')));
		}

		if (startName === DEFAULT_START_NAME) startName = '';
		replaceOnce('"VERSION"', `Compiled with ${this.creator}, ${this.creatorVersion}`);
		replaceOnce('"TIME"', `Built on ${new Date().toUTCString()}`);
		replaceOnce('"START_AT"', JSON.stringify(startName));
		replaceOnce('"STORY_SIZE"', `"${count}"`);
		if (template.includes('"STORY"')) {
			replaceOnce('"STORY"', data);
		} else {
			const footer = readComponent(path.join(formatDir, 'footer.html'), true);
			template += data + (footer !== null ? footer : '</div>\n</body>\n</html>\n');
		}

		if (this.ifid) {
			if (template.includes('<div id="store-area"')) {
				replaceOnce('<div id="store-area"', `<!-- UUID://${this.ifid}// --><div id="store-area"`);
			} else {
				replaceOnce('<div id="storeArea"', `<!-- UUID://${this.ifid}// --><div id="storeArea"`);
			}
		}
		return template;
	}

	/** Build the message shown when a project has no IFID yet. */
	missingIFIDMessage() {
		const ifid = this.legacyIFID || newIFID();
		let line = `"ifid": "${ifid}"`;
		const intro = this.legacyIFID
			? 'Story IFID not found; you can reuse the "ifid" entry from the "StorySettings" special passage.'
			: 'Story IFID not found; NesTwee generated one for your project.';
		if (this.has('StoryData')) {
			line += ',';
			const example = this.marshalStoryData().replace('{', '{\n\t' + line);
			return (
				`${intro}\n\nCopy the following line into the "StoryData" special passage's JSON block (at the top):\n\n\t${line}\n\n` +
				`E.g., it should look something like the following:\n\n:: StoryData\n${example}\n`
			);
		}
		return `${intro}\n\nCopy the following "StoryData" special passage into one of your project's twee source files:\n\n:: StoryData\n{\n\t${line}\n}\n`;
	}

	getTwine2DataChunk(startName) {
		if (!this.ifid) {
			const err = new BuildError(this.missingIFIDMessage());
			err.code = 'MISSING_IFID';
			throw err;
		}

		const scripts = [];
		const stylesheets = [];
		for (const p of this.passages) {
			if (p.tagsHas('Twine.private')) continue;
			if (p.tagsHas('script')) scripts.push(p);
			else if (p.tagsHas('stylesheet')) stylesheets.push(p);
		}

		const joinUser = (list, label) => {
			if (list.length === 1) return list[0].text;
			let out = '';
			list.forEach((p, i) => {
				if (i > 0 && !out.endsWith('\n')) out += '\n';
				out += `/* ${label} #${i + 1}: ${JSON.stringify(p.name)} */\n` + p.text;
			});
			return out;
		};

		let data = '';
		data += '<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css">';
		data += joinUser(stylesheets, 'twine-user-stylesheet');
		data += '</style>';
		data += '<script role="script" id="twine-user-script" type="text/twine-javascript">';
		data += joinUser(scripts, 'twine-user-script');
		data += '</script>';

		for (const [tag, color] of Object.entries(this.twine2.tagColors || {})) {
			data += `<tw-tag name="${attrEscape(tag)}" color="${attrEscape(color)}"></tw-tag>`;
		}

		let pid = 1;
		let startID = '';
		for (const p of this.passages) {
			if (p.name === 'StoryTitle' || p.name === 'StoryData' || p.tagsHasAny('script', 'stylesheet', 'Twine.private')) continue;
			if (p.name === 'StorySettings' && Object.keys(this.twine1.settings).length === 0) continue;
			data += p.toPassagedata(pid);
			if (startName === p.name) startID = String(pid);
			pid++;
		}

		const options = Object.keys(this.twine2.options).filter((k) => this.twine2.options[k]).join(' ');
		const head =
			`<!-- UUID://${this.ifid}// -->` +
			`<tw-storydata name="${attrEscape(this.name)}" startnode="${startID}" creator="${attrEscape(this.creator)}" ` +
			`creator-version="${attrEscape(this.creatorVersion)}" ifid="${attrEscape(this.ifid)}" zoom="${attrEscape(
				String(this.twine2.zoom)
			)}" ` +
			`format="${attrEscape(this.format ? this.format.name : this.twine2.format)}" format-version="${attrEscape(
				this.format ? this.format.version : this.twine2.formatVersion
			)}" ` +
			`options="${attrEscape(options)}" hidden>`;
		return head + data + '</tw-storydata>';
	}

	getTwine1PassageChunk() {
		let data = '';
		let count = 0;
		for (const p of this.passages) {
			if (p.tagsHas('Twine.private')) continue;
			count++;
			data += p.toTiddler(count);
		}
		return { data, count };
	}
}

// ---- parse5 helpers ---------------------------------------------------------

function findElement(node, pred) {
	if (!node) return null;
	if (node.tagName && pred(node)) return node;
	const kids = node.childNodes || (node.content && node.content.childNodes) || [];
	for (const child of kids) {
		const r = findElement(child, pred);
		if (r) return r;
	}
	return null;
}

function attr(node, name) {
	if (!node.attrs) return null;
	const a = node.attrs.find((x) => x.name === name);
	return a ? a.value : null;
}

// Text of the first child (matches Tweego's use of FirstChild.Data).
function textOf(node) {
	const first = node.childNodes && node.childNodes[0];
	if (!first) return '';
	if (first.nodeName === '#text') return first.value;
	return '';
}

module.exports = { Story, DEFAULT_START_NAME };
