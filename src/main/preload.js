'use strict';
/*
	The only bridge between the window and Node. The page gets a small,
	explicit API and no direct file system access.
*/

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
	const handler = (_event, payload) => callback(payload);
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('nestwee', {
	appInfo: () => ipcRenderer.invoke('app:info'),

	pickFolders: (opts) => ipcRenderer.invoke('dialog:folders', opts),
	pickFiles: (opts) => ipcRenderer.invoke('dialog:files', opts),
	pickSave: (opts) => ipcRenderer.invoke('dialog:save', opts),

	scan: (paths, opts) => ipcRenderer.invoke('files:scan', paths, opts),
	listFormats: (extraDirs) => ipcRenderer.invoke('formats:list', extraDirs),
	charsets: () => ipcRenderer.invoke('engine:charsets'),
	newIFID: () => ipcRenderer.invoke('engine:ifid'),

	build: (config) => ipcRenderer.invoke('build:run', config),
	watchStart: (config) => ipcRenderer.invoke('watch:start', config),
	watchStop: () => ipcRenderer.invoke('watch:stop'),
	onWatchLog: on('watch:log'),
	onWatchState: on('watch:state'),

	loadStore: () => ipcRenderer.invoke('store:load'),
	saveStore: (key, value) => ipcRenderer.invoke('store:set', key, value),

	openPath: (p) => ipcRenderer.invoke('shell:open', p),
	showInFolder: (p) => ipcRenderer.invoke('shell:show', p),
	openExternal: (url) => ipcRenderer.invoke('shell:external', url),
	copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
});
