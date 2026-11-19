'use strict';
/*
	Recursive source discovery.

	Mirrors Tweego's filesystem.go: every regular file inside the given folders
	is collected (in lexical order), symlinks are not followed, and the output
	file may never be one of the inputs.
*/

const fs = require('fs');
const path = require('path');
const { BuildError, fileKind } = require('./util');

/**
 * Walk the given paths (files or folders) and return regular files.
 * @param {string[]} pathnames
 * @param {object} opts
 * @param {string} [opts.outFile] absolute or relative output path to guard against
 * @param {(msg:string)=>void} [opts.warn]
 * @param {boolean} [opts.skipHidden] skip dot-files and dot-folders
 */
function getFilenames(pathnames, { outFile = '', warn = () => {}, skipHidden = false } = {}) {
	const absOut = outFile ? path.resolve(outFile) : '';
	const files = [];
	const seen = new Set();

	function walk(p, isRoot) {
		let st;
		try {
			st = fs.lstatSync(p);
		} catch (err) {
			if (isRoot) warn(`path ${p}: ${err.code === 'ENOENT' ? 'No such file or directory' : err.message}`);
			return;
		}
		if (!isRoot && skipHidden && path.basename(p).startsWith('.')) return;
		if (st.isDirectory()) {
			let names;
			try {
				names = fs.readdirSync(p);
			} catch (err) {
				warn(`path ${p}: ${err.message}`);
				return;
			}
			names.sort();
			for (const name of names) walk(path.join(p, name), false);
			return;
		}
		if (!st.isFile()) return;
		const abs = path.resolve(p);
		if (absOut && abs === absOut) {
			throw new BuildError(`path ${p}: The output file cannot be an input source.`);
		}
		if (!seen.has(abs)) {
			seen.add(abs);
			files.push(abs);
		}
	}

	for (const p of pathnames) {
		if (!p || p === '-') {
			if (p === '-') warn('path -: Reading from standard input is unsupported.');
			continue;
		}
		walk(p, true);
	}
	return files;
}

/** Summarize what a recursive scan finds, for the folder picker preview. */
function scanSummary(pathnames, opts = {}) {
	const warnings = [];
	let files;
	try {
		files = getFilenames(pathnames, { ...opts, warn: (m) => warnings.push(m) });
	} catch (err) {
		return { files: [], counts: {}, warnings: [...warnings, err.message], total: 0, ignored: 0 };
	}
	const counts = {};
	const list = [];
	let ignored = 0;
	for (const f of files) {
		const kind = fileKind(f);
		if (!kind) {
			ignored++;
			continue;
		}
		counts[kind] = (counts[kind] || 0) + 1;
		list.push({ path: f, kind });
	}
	return { files: list, counts, warnings, total: list.length, ignored };
}

module.exports = { getFilenames, scanSummary };
