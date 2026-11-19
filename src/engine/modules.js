'use strict';
/*
	Modules (CSS, JS and fonts injected into <head>) and the head file option.

	Ported from Tweego's module.go and io.go (modifyHead)
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const path = require('path');
const { BuildError, normalizedFileExt, mediaTypeFromExt, slugify, readText, readBase64, fontHint } = require('./util');

function loadModuleTagged(tag, filename, encoding) {
	const source = readText(filename, encoding).trim();
	if (!source) return '';
	const id = `${tag}-module-${slugify(path.basename(filename).split('.')[0])}`;
	const mime = tag === 'script' ? 'text/javascript' : 'text/css';
	return `<${tag} id="${id}" type="${mime}">${source}</${tag}>`;
}

function loadModuleFont(filename) {
	const family = path.basename(filename).split('.')[0];
	const ext = normalizedFileExt(filename);
	const id = `style-module-${slugify(family)}`;
	return (
		`<style id="${id}" type="text/css">@font-face {\n\tfont-family: ${JSON.stringify(family)};\n` +
		`\tsrc: url("data:${mediaTypeFromExt(ext)};base64,${readBase64(filename)}") format(${JSON.stringify(fontHint(ext))});\n}</style>`
	);
}

function loadModules(filenames, encoding, { warn = () => {}, onFile = () => {} } = {}) {
	const processed = new Set();
	const tags = [];
	for (const filename of filenames) {
		if (processed.has(filename)) {
			warn(`load ${filename}: Skipping duplicate.`);
			continue;
		}
		let source;
		try {
			switch (normalizedFileExt(filename)) {
				case 'css':
					source = loadModuleTagged('style', filename, encoding);
					break;
				case 'js':
					source = loadModuleTagged('script', filename, encoding);
					break;
				case 'otf':
				case 'ttf':
				case 'woff':
				case 'woff2':
					source = loadModuleFont(filename);
					break;
				default:
					continue;
			}
		} catch (err) {
			throw new BuildError(`load ${filename}: ${err.message}`);
		}
		if (source) tags.push(source);
		processed.add(filename);
		onFile(filename);
	}
	return tags.join('\n');
}

/** Insert module tags and the head file's contents right before </head>. */
function modifyHead(html, modulePaths, headFile, encoding, hooks = {}) {
	const tags = [];
	if (modulePaths.length) {
		const src = loadModules(modulePaths, encoding, hooks).trim();
		if (src) tags.push(src);
	}
	if (headFile) {
		let src;
		try {
			src = readText(headFile, encoding).trim();
		} catch (err) {
			throw new BuildError(`load ${headFile}: ${err.message}`);
		}
		if (src) tags.push(src);
		if (hooks.onFile) hooks.onFile(headFile);
	}
	if (!tags.length) return html;
	tags.push('</head>');
	const i = html.indexOf('</head>');
	if (i === -1) return html;
	return html.slice(0, i) + tags.join('\n') + html.slice(i + '</head>'.length);
}

module.exports = { loadModules, modifyHead };
