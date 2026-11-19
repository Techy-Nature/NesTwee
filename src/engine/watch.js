'use strict';
/*
	Watch mode: rebuild whenever a known source file changes.
	Like Tweego, changes are batched and a build runs at most every 500 ms,
	and the output file itself is ignored.
*/

const fs = require('fs');
const path = require('path');
const { knownFileType } = require('./util');

function watch(paths, { outFile = '', onChange, onEvent = () => {}, onError = () => {}, delay = 500 } = {}) {
	const absOut = outFile ? path.resolve(outFile) : '';
	const watchers = [];
	let timer = null;
	let closed = false;

	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			if (!closed) onChange();
		}, delay);
	};

	for (const p of paths) {
		let st;
		try {
			st = fs.statSync(p);
		} catch (err) {
			onError(new Error(`watch ${p}: ${err.message}`));
			continue;
		}
		const isDir = st.isDirectory();
		try {
			const w = fs.watch(p, { recursive: isDir, persistent: true }, (eventType, filename) => {
				if (closed) return;
				const full = isDir ? (filename ? path.join(p, filename.toString()) : p) : p;
				if (absOut && path.resolve(full) === absOut) return;
				if (!knownFileType(full)) return;
				onEvent({ type: eventType === 'rename' ? 'Rename' : 'Write', path: full });
				schedule();
			});
			w.on('error', (err) => onError(err));
			watchers.push(w);
		} catch (err) {
			onError(new Error(`watch ${p}: ${err.message}`));
		}
	}

	return {
		close() {
			closed = true;
			if (timer) clearTimeout(timer);
			for (const w of watchers) {
				try {
					w.close();
				} catch {
					/* ignore */
				}
			}
		},
		count: watchers.length,
	};
}

module.exports = { watch };
