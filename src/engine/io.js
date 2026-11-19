'use strict';
/*
	Pluggable file access. Node uses ./io-node (the real file system); the
	phone app installs an in-memory reader with set().
*/

let impl = null;

module.exports = {
	get() {
		if (!impl) impl = require('./io-node');
		return impl;
	},
	set(next) {
		impl = next;
	},
};
