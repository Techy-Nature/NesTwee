'use strict';
/*
	Passage model and serializers.

	Ported from Tweego's passage.go and passagedata.go
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const { attrEscape, htmlEscape, tiddlerEscape, tweeEscape } = require('./escaping');

const INFO_PASSAGES = new Set([
	// Story formats: Twine 1.4+ vanilla & SugarCube.
	'StoryAuthor', 'StoryInit', 'StoryMenu', 'StorySubtitle', 'StoryTitle',
	// Story formats: SugarCube.
	'PassageReady', 'PassageDone', 'PassageHeader', 'PassageFooter', 'StoryBanner', 'StoryCaption',
	// Story formats: SugarCube (v1 only).
	'MenuOptions', 'MenuShare', 'MenuStory',
	// Story formats: SugarCube (v2 only).
	'StoryInterface', 'StoryShare',
	// Story formats: Twine 1.4+ vanilla.
	'StorySettings',
	// Compilers: Twine 2 & Tweego.
	'StoryData',
	// Compilers: Twine 1.4 & Twee2.
	'StoryIncludes',
]);

const OUT_TWEE3 = 'twee3';
const OUT_TWEE1 = 'twee1';

class Passage {
	constructor(name, tags = [], text = '', metadata = null) {
		this.name = name;
		this.tags = tags;
		this.text = text;
		this.metadata = metadata; // { position, size }
	}

	tagsHas(needle) {
		return this.tags.includes(needle);
	}

	tagsHasAny(...needles) {
		return this.tags.some((t) => needles.includes(t));
	}

	tagsStartsWith(prefix) {
		return this.tags.some((t) => t.startsWith(prefix));
	}

	hasMetadataPosition() {
		return !!(this.metadata && this.metadata.position);
	}

	hasMetadataSize() {
		return !!(this.metadata && this.metadata.size);
	}

	hasAnyMetadata() {
		return this.hasMetadataPosition() || this.hasMetadataSize();
	}

	hasInfoTags() {
		return this.tagsHasAny('annotation', 'script', 'stylesheet', 'widget') || this.tagsStartsWith('Twine.');
	}

	hasInfoName() {
		return INFO_PASSAGES.has(this.name);
	}

	isInfoPassage() {
		return this.hasInfoName() || this.hasInfoTags();
	}

	isStoryPassage() {
		return !this.hasInfoName() && !this.hasInfoTags();
	}

	marshalMetadata() {
		const out = {};
		if (this.metadata && this.metadata.position) out.position = this.metadata.position;
		if (this.metadata && this.metadata.size) out.size = this.metadata.size;
		return JSON.stringify(out);
	}

	unmarshalMetadata(json) {
		const data = JSON.parse(json);
		if (data === null || typeof data !== 'object' || Array.isArray(data)) {
			throw new Error('metadata must be a JSON object');
		}
		this.metadata = {
			position: typeof data.position === 'string' ? data.position : '',
			size: typeof data.size === 'string' ? data.size : '',
		};
	}

	toTwee(outMode) {
		let out;
		if (outMode === OUT_TWEE3) {
			out = ':: ' + tweeEscape(this.name);
			if (this.tags.length) out += ' [' + tweeEscape(this.tags.join(' ')) + ']';
			if (this.hasAnyMetadata()) out += ' ' + this.marshalMetadata();
		} else {
			out = ':: ' + this.name;
			if (this.tags.length) out += ' [' + this.tags.join(' ') + ']';
		}
		out += '\n';
		if (this.text.length) out += this.text + '\n';
		out += '\n\n';
		return out;
	}

	toPassagedata(pid) {
		let position;
		if (this.hasMetadataPosition()) {
			position = this.metadata.position;
		} else {
			let x = pid % 10;
			let y = Math.floor(pid / 10);
			if (x === 0) x = 10;
			else y++;
			position = `${x * 125 - 25},${y * 125 - 25}`;
		}
		const size = this.hasMetadataSize() ? this.metadata.size : '100,100';
		return (
			`<tw-passagedata pid="${pid}" name="${attrEscape(this.name)}" tags="${attrEscape(this.tags.join(' '))}" ` +
			`position="${attrEscape(position)}" size="${attrEscape(size)}">${htmlEscape(this.text)}</tw-passagedata>`
		);
	}

	toTiddler(pid) {
		let position;
		if (this.hasMetadataPosition()) {
			position = this.metadata.position;
		} else {
			let x = pid % 10;
			let y = Math.floor(pid / 10);
			if (x === 0) x = 10;
			else y++;
			position = `${x * 140 - 130},${y * 140 - 130}`;
		}
		return (
			`<div tiddler="${attrEscape(this.name)}" tags="${attrEscape(this.tags.join(' '))}" ` +
			`twine-position="${attrEscape(position)}">${tiddlerEscape(this.text)}</div>`
		);
	}

	// Approximate word count: five characters per "word", ignoring comments.
	countWords() {
		let text = this.text.replace(/\n/g, '');
		text = text.replace(/\/%[\s\S]*?%\/|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '');
		let count = 0;
		for (const ch of text.normalize('NFKD')) {
			if (!/\p{M}/u.test(ch)) count++;
		}
		return Math.ceil(count / 5);
	}
}

module.exports = { Passage, INFO_PASSAGES, OUT_TWEE3, OUT_TWEE1 };
