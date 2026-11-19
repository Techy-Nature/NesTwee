// The small part of Node's `path` the engine uses, for the phone app.
'use strict';
const norm = (p) => String(p).replace(/\\/g, '/');
function basename(p, ext) {
	const b = norm(p).split('/').filter(Boolean).pop() || '';
	return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
}
function dirname(p) {
	const parts = norm(p).split('/');
	parts.pop();
	return parts.join('/') || '.';
}
function extname(p) {
	const b = basename(p);
	const i = b.lastIndexOf('.');
	return i > 0 ? b.slice(i) : '';
}
function join(...parts) {
	return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}
module.exports = { basename, dirname, extname, join, resolve: (p) => norm(p), sep: '/', delimiter: ':' };
