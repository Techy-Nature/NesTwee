'use strict';
/*
	File reading for Node and Electron. The browser/Android build swaps this
	module for src/web/io-memory.js, which reads from files held in memory.
*/

const fs = require('fs');
const iconv = require('iconv-lite');

class BuildError extends Error {
	constructor(message) {
		super(message);
		this.name = 'BuildError';
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

module.exports = { readText, readBase64 };
