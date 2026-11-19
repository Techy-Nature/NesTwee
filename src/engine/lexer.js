'use strict';
/*
	Twee 3 lexer.

	A JavaScript port of Tweego's internal/tweelexer, which is itself based on
	Rob Pike's "Lexical Scanning in Go" state-function design.
	Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD License.
*/

const ItemType = Object.freeze({
	Error: 'error',
	EOF: 'eof',
	Header: 'header',
	Name: 'name',
	Tags: 'tags',
	Metadata: 'metadata',
	Content: 'content',
});

const EOF = null;

/**
 * Lex a full twee source string into an array of items.
 * Each item is { type, val, line }.
 */
function lex(input) {
	const items = [];
	let start = 0;
	let pos = 0;

	// Line tracking: count newlines incrementally.
	let lineAtStart = 1;
	let lineCursor = 0;
	function lineOf(index) {
		if (index < lineCursor) {
			lineAtStart = 1;
			lineCursor = 0;
		}
		for (; lineCursor < index; lineCursor++) {
			if (input.charCodeAt(lineCursor) === 10) lineAtStart++;
		}
		return lineAtStart;
	}

	function next() {
		if (pos >= input.length) return EOF;
		return input[pos++];
	}
	function peek() {
		return pos >= input.length ? EOF : input[pos];
	}
	function backup() {
		pos--;
	}
	function emit(type) {
		items.push({ type, val: input.slice(start, pos), line: lineOf(start) });
		start = pos;
	}
	function ignore() {
		start = pos;
	}
	function errorf(msg) {
		items.push({ type: ItemType.Error, val: msg, line: lineOf(pos) });
		return null;
	}
	function describe(r) {
		const cp = r.codePointAt(0);
		return `U+${cp.toString(16).toUpperCase().padStart(4, '0')} '${r}'`;
	}

	function acceptQuoted(quote) {
		for (;;) {
			let r = next();
			if (r === '\\') {
				r = next();
				if (r !== '\n' && r !== EOF) continue;
				return 'unterminated quoted string';
			}
			if (r === '\n' || r === EOF) return 'unterminated quoted string';
			if (r === quote) return null;
		}
	}

	// States
	function lexProlog() {
		if (input.startsWith('::', pos)) return lexHeaderDelim;
		const i = input.indexOf('\n::', pos);
		if (i > -1) {
			pos = i + 1;
			ignore();
			return lexHeaderDelim;
		}
		emit(ItemType.EOF);
		return null;
	}

	function lexContent() {
		if (input.startsWith('::', pos)) return lexHeaderDelim;
		const i = input.indexOf('\n::', pos);
		if (i > -1) {
			pos = i + 1;
			emit(ItemType.Content);
			return lexHeaderDelim;
		}
		pos = input.length;
		if (pos > start) emit(ItemType.Content);
		emit(ItemType.EOF);
		return null;
	}

	function lexHeaderDelim() {
		pos += 2;
		emit(ItemType.Header);
		return lexName;
	}

	function lexName() {
		let r;
		for (;;) {
			r = next();
			if (r === '\\') {
				r = next();
				if (r !== '\n' && r !== EOF) continue;
			}
			if (r === '[' || r === ']' || r === '{' || r === '}' || r === '\n' || r === EOF) {
				if (r !== EOF) backup();
				break;
			}
		}
		emit(ItemType.Name);

		switch (r) {
			case '[':
				return lexTags;
			case ']':
				return errorf(`unexpected right square bracket ${describe(r)}`);
			case '{':
				return lexMetadata;
			case '}':
				return errorf(`unexpected right curly brace ${describe(r)}`);
			case '\n':
				pos++;
				ignore();
				return lexContent;
		}
		emit(ItemType.EOF);
		return null;
	}

	function lexNextOptionalBlock() {
		while (peek() === ' ' || peek() === '\t') pos++;
		ignore();
		const r = peek();
		switch (r) {
			case '[':
				return lexTags;
			case ']':
				return errorf(`unexpected right square bracket ${describe(r)}`);
			case '{':
				return lexMetadata;
			case '}':
				return errorf(`unexpected right curly brace ${describe(r)}`);
			case '\n':
				pos++;
				ignore();
				return lexContent;
			case EOF:
				emit(ItemType.EOF);
				return null;
		}
		return errorf(`illegal character ${describe(r)} amid the optional blocks`);
	}

	function lexTags() {
		pos++; // consume '['
		for (;;) {
			let r = next();
			if (r === '\\') {
				r = next();
				if (r !== '\n' && r !== EOF) continue;
			}
			if (r === '\n' || r === EOF) {
				if (r === '\n') backup();
				return errorf('unterminated tag block');
			}
			if (r === ']') break;
			if (r === '[') return errorf(`unexpected left square bracket ${describe(r)}`);
			if (r === '{') return errorf(`unexpected left curly brace ${describe(r)}`);
			if (r === '}') return errorf(`unexpected right curly brace ${describe(r)}`);
		}
		if (pos > start) emit(ItemType.Tags);
		return lexNextOptionalBlock;
	}

	function lexMetadata() {
		pos++; // consume '{'
		let depth = 1;
		for (;;) {
			const r = next();
			if (r === '"') {
				const err = acceptQuoted('"');
				if (err) return errorf(err);
				continue;
			}
			if (r === '\n') {
				backup();
				return errorf('unterminated metadata block');
			}
			if (r === EOF) return errorf('unterminated metadata block');
			if (r === '{') depth++;
			else if (r === '}') {
				depth--;
				if (depth === 0) break;
			}
		}
		if (pos > start) emit(ItemType.Metadata);
		return lexNextOptionalBlock;
	}

	let state = lexProlog;
	while (state) state = state();
	return items;
}

module.exports = { lex, ItemType };
