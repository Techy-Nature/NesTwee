'use strict';
/*
	In-memory file access for the phone app: the files the person picked (or
	unzipped) and the bundled story formats live in a Map of path → bytes.
*/

const files = new Map();

function notFound(path) {
	const err = new Error(`${path}: No such file`);
	err.code = 'ENOENT';
	return err;
}

function bytesOf(path) {
	const b = files.get(path);
	if (!b) throw notFound(path);
	return b;
}

function readText(path, encoding) {
	const buf = bytesOf(path);
	let enc = (encoding || '').trim().toLowerCase() || 'utf-8';
	if (enc === 'utf-8' || enc === 'utf8') {
		if (buf[0] === 0xff && buf[1] === 0xfe) enc = 'utf-16le';
		else if (buf[0] === 0xfe && buf[1] === 0xff) enc = 'utf-16be';
	}
	let text;
	try {
		text = new TextDecoder(enc).decode(buf);
	} catch {
		throw new Error(`Charset "${encoding}" is unsupported.`);
	}
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readBase64(path) {
	const buf = bytesOf(path);
	let bin = '';
	for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
	return btoa(bin);
}

module.exports = { files, readText, readBase64 };
