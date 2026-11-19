'use strict';
/*
	NesTwee main process: owns the window, dialogs, settings file and the
	compile engine. The page talks to it only through preload.js.
*/

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme, Menu } = require('electron');
const engine = require('../engine');
const { getStoryFormatData } = require('../engine/formats');
const { Store } = require('./store');
const pkg = require('../../package.json');

const ROOT = path.join(__dirname, '..', '..');
let mainWindow = null;
let store = null;
let activeWatch = null;

function bundledFormatsDir() {
	const packaged = path.join(process.resourcesPath || '', 'storyformats');
	if (app.isPackaged && fs.existsSync(packaged)) return packaged;
	return path.join(ROOT, 'storyformats');
}

function importedFormatsDir() {
	return path.join(app.getPath('userData'), 'storyformats');
}

/**
 * Bundled formats first, then formats imported through the app, then Tweego's
 * usual places, then the user's folders. Later folders win when two hold a
 * format with the same ID, so imports and user folders can replace built-ins.
 */
function formatSearchDirs(extraDirs = []) {
	const dirs = [bundledFormatsDir(), importedFormatsDir()];
	const programDirs = [path.dirname(app.getPath('exe'))];
	for (const d of engine.defaultSearchDirs({ programDirs, workingDir: null })) {
		if (!dirs.includes(d)) dirs.push(d);
	}
	for (const d of extraDirs || []) if (d && !dirs.includes(d)) dirs.push(d);
	return dirs;
}

function discoverFormats(extraDirs) {
	return engine.StoryFormatsMap.discover(formatSearchDirs(extraDirs));
}

function createWindow() {
	const bounds = store.get('windowBounds', { width: 1280, height: 860 });
	mainWindow = new BrowserWindow({
		...bounds,
		minWidth: 900,
		minHeight: 620,
		title: 'NesTwee',
		backgroundColor: '#0f1520',
		icon: path.join(ROOT, 'assets', 'icon.png'),
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	mainWindow.once('ready-to-show', () => mainWindow.show());
	mainWindow.on('close', () => store.set('windowBounds', mainWindow.getBounds()));
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:/.test(url)) shell.openExternal(url);
		return { action: 'deny' };
	});
	mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
	mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function send(channel, payload) {
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function runBuild(config, sink) {
	const log = engine.makeLogger(sink);
	try {
		const formats = discoverFormats(config.formatDirs);
		const res = engine.build(config, { formats, log, creator: 'NesTwee', creatorVersion: pkg.version });
		log.success(`Built ${path.basename(res.outFile)} in ${res.stats.ms} ms (${res.stats.storyPassages} story passages).`);
		return { ok: true, outFile: res.outFile, stats: res.stats, log: log.entries };
	} catch (err) {
		log.error(err.message || String(err));
		return { ok: false, code: err.code || null, log: log.entries };
	}
}

function stopWatch() {
	if (activeWatch) {
		activeWatch.close();
		activeWatch = null;
	}
	send('watch:state', { watching: false });
}

function registerIpc() {
	ipcMain.handle('app:info', () => ({
		version: pkg.version,
		platform: process.platform,
		electron: process.versions.electron,
		systemDark: nativeTheme.shouldUseDarkColors,
		bundledFormatsDir: bundledFormatsDir(),
	}));

	ipcMain.handle('dialog:folders', async (_e, opts = {}) => {
		const r = await dialog.showOpenDialog(mainWindow, {
			title: opts.title || 'Choose folders',
			properties: ['openDirectory', 'multiSelections', 'createDirectory'],
			defaultPath: opts.defaultPath,
		});
		return r.canceled ? [] : r.filePaths;
	});

	ipcMain.handle('dialog:files', async (_e, opts = {}) => {
		const r = await dialog.showOpenDialog(mainWindow, {
			title: opts.title || 'Choose files',
			properties: ['openFile', ...(opts.multiple === false ? [] : ['multiSelections'])],
			filters: opts.filters,
			defaultPath: opts.defaultPath,
		});
		return r.canceled ? [] : r.filePaths;
	});

	ipcMain.handle('dialog:save', async (_e, opts = {}) => {
		const r = await dialog.showSaveDialog(mainWindow, {
			title: opts.title || 'Save output as',
			defaultPath: opts.defaultPath,
			filters: opts.filters,
		});
		return r.canceled ? '' : r.filePath;
	});

	ipcMain.handle('files:scan', (_e, paths, opts = {}) => engine.scanSummary(paths || [], opts));

	ipcMain.handle('formats:list', (_e, extraDirs) => {
		const dirs = formatSearchDirs(extraDirs);
		const map = engine.StoryFormatsMap.discover(dirs);
		return {
			searchDirs: dirs.map((d) => ({ path: d, exists: fs.existsSync(d), bundled: d === bundledFormatsDir(), imported: d === importedFormatsDir() })),
			importedDir: importedFormatsDir(),
			formats: map.list().map((f) => f.toJSON()),
			warnings: map.warnings,
		};
	});

	ipcMain.handle('formats:import', (_e, file) => {
		try {
			const source = fs.readFileSync(file, 'utf8');
			const data = getStoryFormatData(path.basename(path.dirname(file)), source);
			if (!data.name || !data.version || typeof data.source !== 'string') {
				throw new Error('This file has no name, version or source, so it is not a Twine 2 story format.');
			}
			const major = (String(data.version).match(/^\d+/) || ['1'])[0];
			const id = `${String(data.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${major}`;
			const dest = path.join(importedFormatsDir(), id);
			fs.mkdirSync(dest, { recursive: true });
			fs.copyFileSync(file, path.join(dest, 'format.js'));
			for (const extra of fs.readdirSync(path.dirname(file))) {
				if (/^(licen[cs]e|copying)(\..*)?$|^icon\.svg$|^logo\.svg$/i.test(extra)) {
					fs.copyFileSync(path.join(path.dirname(file), extra), path.join(dest, extra));
				}
			}
			return { ok: true, id, name: data.name, version: data.version, proofing: !!data.proofing, folder: dest };
		} catch (err) {
			return { ok: false, error: err.message };
		}
	});

	ipcMain.handle('formats:removeImported', (_e, id) => {
		const dest = path.join(importedFormatsDir(), path.basename(id));
		fs.rmSync(dest, { recursive: true, force: true });
		return { ok: true };
	});

	ipcMain.handle('engine:charsets', () => engine.supportedCharsets());
	ipcMain.handle('engine:ifid', () => engine.newIFID());

	ipcMain.handle('build:run', (_e, config) => runBuild(config));

	ipcMain.handle('watch:start', (_e, config) => {
		stopWatch();
		const sink = (entry) => send('watch:log', entry);
		const first = runBuild(config, sink);
		const paths = [...(config.sources || []), ...(config.modules || [])];
		if (config.headFile) paths.push(config.headFile);
		activeWatch = engine.watch(paths, {
			outFile: config.outFile,
			onEvent: (ev) => sink({ level: 'info', message: `${ev.type}: ${ev.path}`, time: Date.now() }),
			onChange: () => {
				sink({ level: 'info', message: `BUILDING: ${config.outFile}`, time: Date.now() });
				const r = runBuild(config, sink);
				send('watch:state', { watching: true, lastBuild: { ok: r.ok, time: Date.now(), outFile: r.outFile } });
			},
			onError: (err) => sink({ level: 'error', message: err.message, time: Date.now() }),
		});
		send('watch:state', { watching: true, lastBuild: { ok: first.ok, time: Date.now(), outFile: first.outFile } });
		return { ok: true, watching: activeWatch.count, first };
	});

	ipcMain.handle('watch:stop', () => {
		stopWatch();
		return { ok: true };
	});

	ipcMain.handle('store:load', () => store.all());
	ipcMain.handle('store:set', (_e, key, value) => {
		store.set(key, value);
		return true;
	});

	ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));
	ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));
	ipcMain.handle('shell:external', (_e, url) => {
		if (/^https?:\/\//.test(url)) return shell.openExternal(url);
		return false;
	});
	ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));
}

app.whenReady().then(() => {
	store = new Store(app.getPath('userData'));
	registerIpc();
	if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
	createWindow();
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	stopWatch();
	if (process.platform !== 'darwin') app.quit();
});
