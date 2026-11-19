'use strict';
/*
	Escaping helpers.

	Ported from Tweego's escaping.go
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

function replacer(pairs) {
	const map = new Map(pairs);
	const re = new RegExp(pairs.map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
	return (s) => (s ? String(s).replace(re, (m) => map.get(m)) : '');
}

const attrEscape = replacer([
	['&', '&amp;'],
	['"', '&quot;'],
	["'", '&#39;'],
]);

const htmlEscape = replacer([
	['&', '&amp;'],
	['<', '&lt;'],
	['>', '&gt;'],
	['"', '&quot;'],
	["'", '&#39;'],
]);

const tiddlerEscape = replacer([
	['&', '&amp;'],
	['<', '&lt;'],
	['>', '&gt;'],
	['"', '&quot;'],
	['\\', '\\s'],
	['\t', '\\t'],
	['\n', '\\n'],
]);

const tiddlerUnescape = replacer([
	['\\n', '\n'],
	['\\t', '\t'],
	['\\s', '\\'],
]);

// Twee escaping: passage names and tags escape \ [ ] { }
const tweeEscape = replacer([
	['\\', '\\\\'],
	['[', '\\['],
	[']', '\\]'],
	['{', '\\{'],
	['}', '\\}'],
]);

// Any backslash escapes the following character.
function tweeUnescape(s) {
	if (!s) return '';
	let out = '';
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '\\') {
			i++;
			if (i >= s.length) break;
		}
		out += s[i];
	}
	return out;
}

module.exports = {
	attrEscape,
	htmlEscape,
	tiddlerEscape,
	tiddlerUnescape,
	tweeEscape,
	tweeUnescape,
};
