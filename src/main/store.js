'use strict';
/*
	Tiny JSON settings store kept in the user's app-data folder.
	Holds the current settings plus saved presets.
*/

const fs = require('fs');
const path = require('path');

class Store {
	constructor(dir, name = 'nestwee-settings.json') {
		this.file = path.join(dir, name);
		this.data = {};
		try {
			this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {};
		} catch {
			this.data = {};
		}
	}

	get(key, fallback) {
		return key in this.data ? this.data[key] : fallback;
	}

	all() {
		return this.data;
	}

	set(key, value) {
		this.data[key] = value;
		this.save();
	}

	save() {
		fs.mkdirSync(path.dirname(this.file), { recursive: true });
		const tmp = this.file + '.tmp';
		fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
		fs.renameSync(tmp, this.file);
	}
}

module.exports = { Store };
