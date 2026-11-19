'use strict';
/*
	Shared helpers: media types, extensions, IFIDs, slugs, file reading.

	Media type tables and IFID rules ported from Tweego (util.go, ifid.go).
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const iconv = require('iconv-lite');

class BuildError extends Error {
	constructor(message) {
		super(message);
		this.name = 'BuildError';
	}
}

function normalizedFileExt(filename) {
	const ext = path.extname(filename);
	return ext ? ext.slice(1).toLowerCase() : '';
}

function mediaTypeFromExt(ext) {
	switch (ext) {
		case 'aac': case 'flac': case 'ogg': case 'wav':
			return 'audio/' + ext;
		case 'mp3': return 'audio/mpeg';
		case 'm4a': return 'audio/mp4';
		case 'oga': case 'opus': return 'audio/ogg';
		case 'wave': return 'audio/wav';
		case 'weba': return 'audio/webm';
		case 'otf': case 'ttf': case 'woff': case 'woff2':
			return 'font/' + ext;
		case 'gif': case 'jpeg': case 'png': case 'tiff': case 'webp':
			return 'image/' + ext;
		case 'jpg': return 'image/jpeg';
		case 'svg': return 'image/svg+xml';
		case 'tif': return 'image/tiff';
		case 'vtt': return 'text/vtt';
		case 'mp4': case 'webm':
			return 'video/' + ext;
		case 'ogv': return 'video/ogg';
	}
	return '';
}

function mediaTypeFromFilename(filename) {
	return mediaTypeFromExt(normalizedFileExt(filename));
}

const FILE_KINDS = {
	twee: ['tw', 'twee'],
	twee2: ['tw2', 'twee2'],
	html: ['htm', 'html'],
	css: ['css'],
	js: ['js'],
	font: ['otf', 'ttf', 'woff', 'woff2'],
	image: ['gif', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp'],
	audio: ['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'wave', 'weba'],
	video: ['mp4', 'ogv', 'webm'],
	vtt: ['vtt'],
};

const EXT_TO_KIND = {};
for (const [kind, exts] of Object.entries(FILE_KINDS)) {
	for (const ext of exts) EXT_TO_KIND[ext] = kind;
}

function fileKind(filename) {
	return EXT_TO_KIND[normalizedFileExt(filename)] || null;
}

function knownFileType(filename) {
	return fileKind(filename) !== null;
}

// Replace runs of characters that are illegal in an HTML id with '_'.
function slugify(original) {
	// eslint-disable-next-line no-control-regex
	return original.replace(/[\x00-\x20!-/:-@[-^\x60{-\x9f]+/g, '_');
}

function newIFID() {
	const b = crypto.randomBytes(16);
	b[6] = (b[6] & 0x0f) | 0x40; // version 4
	b[8] = (b[8] & 0x3f) | 0x80; // variant 10
	const h = b.toString('hex').toUpperCase();
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function validateIFID(ifid) {
	if (ifid.length === 36 + 9) {
		if (ifid.slice(0, 7).toUpperCase() !== 'UUID://' || ifid.slice(43) !== '//') {
			throw new Error('invalid IFID UUID://…// format');
		}
		ifid = ifid.slice(7, 43);
	} else if (ifid.length !== 36) {
		throw new Error(`invalid IFID length: ${ifid.length}`);
	}
	for (let i = 0; i < ifid.length; i++) {
		const c = ifid[i];
		if (i === 8 || i === 13 || i === 18 || i === 23) {
			if (c !== '-') throw new Error(`invalid IFID character '${c}' at position ${i + 1}`);
		} else if (i === 14) {
			if (c < '1' || c > '5') throw new Error(`invalid version '${c}' at position ${i + 1}`);
		} else if (i === 19) {
			if (!'89abAB'.includes(c)) throw new Error(`invalid variant '${c}' at position ${i + 1}`);
		} else if (!/[0-9a-fA-F]/.test(c)) {
			throw new Error(`invalid IFID hex value '${c}' at position ${i + 1}`);
		}
	}
}

/**
 * Read a text file, decoding with the given charset (blank = auto),
 * stripping any BOM and normalizing line endings to LF.
 */
function readText(filename, encoding) {
	const buf = fs.readFileSync(filename);
	let text;
	const enc = (encoding || '').trim();
	if (enc && !/^utf-?8$/i.test(enc)) {
		if (!iconv.encodingExists(enc)) throw new BuildError(`Charset "${enc}" is unsupported.`);
		text = iconv.decode(buf, enc);
	} else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
		text = iconv.decode(buf, 'utf-16le');
	} else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
		text = iconv.decode(buf, 'utf-16be');
	} else {
		text = buf.toString('utf8');
	}
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readBase64(filename) {
	return fs.readFileSync(filename).toString('base64');
}

function fontHint(ext) {
	if (ext === 'ttf') return 'truetype';
	if (ext === 'otf') return 'opentype';
	return ext;
}

function supportedCharsets() {
	return [
		'utf-8', 'utf-16le', 'utf-16be',
		'iso-8859-1', 'iso-8859-2', 'iso-8859-15',
		'windows-1250', 'windows-1251', 'windows-1252',
		'koi8-r', 'shift_jis', 'euc-jp', 'gbk', 'big5', 'euc-kr',
	];
}

module.exports = {
	BuildError,
	normalizedFileExt,
	mediaTypeFromExt,
	mediaTypeFromFilename,
	fileKind,
	knownFileType,
	FILE_KINDS,
	slugify,
	newIFID,
	validateIFID,
	readText,
	readBase64,
	fontHint,
	supportedCharsets,
};
