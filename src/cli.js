#!/usr/bin/env node
'use strict';
/*
	nestwee-cli: a command line front end for the NesTwee engine that accepts
	the same options as Tweego. Handy for scripts and CI.
*/

const path = require('path');
const engine = require('./engine');
const pkg = require('../package.json');

const USAGE = `Usage: nestwee-cli [options] sources...

  sources                  Input sources (files and/or folders, searched recursively).

Options:
  -a, --archive-twine2     Output Twine 2 archive, instead of compiled HTML.
      --archive-twine1     Output Twine 1 archive, instead of compiled HTML.
  -c, --charset=NAME       Name of the input character set (default: "utf-8", fallback: "windows-1252").
  -d, --decompile-twee3    Output Twee 3 source code, instead of compiled HTML.
      --decompile-twee1    Output Twee 1 source code, instead of compiled HTML.
  -f, --format=NAME        ID of the story format (default: "sugarcube-2").
  -h, --help               Print this help, then exit.
      --head=FILE          Name of the file whose contents will be appended as-is to the <head> element.
      --list-charsets      List the supported input character sets, then exit.
      --list-formats       List the available story formats, then exit.
      --log-files          Log the processed input files.
  -l, --log-stats          Log various story statistics.
  -m, --module=SRC         Module sources (repeatable).
      --no-trim            Do not trim whitespace surrounding passages.
  -o, --output=FILE        Name of the output file (required).
  -s, --start=NAME         Name of the starting passage (default: "Start").
  -t, --test               Compile in test mode; only for story formats in the Twine 2 style.
      --twee2-compat       Enable Twee2 source compatibility mode.
  -v, --version            Print version information, then exit.
  -w, --watch              Start watch mode; watch input sources for changes, rebuilding the output as necessary.
      --formats-dir=DIR    Extra story formats search folder (repeatable).
`;

function parseArgs(argv) {
	const cfg = { sources: [], modules: [] };
	const flags = { formatDirs: [] };
	const takeValue = (arg, i) => {
		const eq = arg.indexOf('=');
		if (eq !== -1) return [arg.slice(eq + 1), i];
		if (i + 1 >= argv.length) throw new Error(`option ${arg} requires a value`);
		return [argv[i + 1], i + 1];
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const name = arg.split('=')[0];
		let v;
		switch (name) {
			case '-a': case '--archive-twine2': cfg.mode = 'archive-twine2'; break;
			case '--archive-twine1': cfg.mode = 'archive-twine1'; break;
			case '-d': case '--decompile-twee3': case '--decompile': cfg.mode = 'twee3'; break;
			case '--decompile-twee1': cfg.mode = 'twee1'; break;
			case '-c': case '--charset': [v, i] = takeValue(arg, i); cfg.encoding = v; break;
			case '-f': case '--format': [v, i] = takeValue(arg, i); cfg.format = v; break;
			case '--head': [v, i] = takeValue(arg, i); cfg.headFile = v; break;
			case '-h': case '--help': flags.help = true; break;
			case '--list-charsets': flags.listCharsets = true; break;
			case '--list-formats': flags.listFormats = true; break;
			case '--log-files': cfg.logFiles = true; break;
			case '-l': case '--log-stats': cfg.logStats = true; break;
			case '-m': case '--module': [v, i] = takeValue(arg, i); cfg.modules.push(v); break;
			case '--no-trim': cfg.trim = false; break;
			case '-o': case '--output': [v, i] = takeValue(arg, i); cfg.outFile = v; break;
			case '-s': case '--start': [v, i] = takeValue(arg, i); cfg.start = v; break;
			case '-t': case '--test': cfg.test = true; break;
			case '--twee2-compat': cfg.twee2Compat = true; break;
			case '-v': case '--version': flags.version = true; break;
			case '-w': case '--watch': flags.watch = true; break;
			case '--formats-dir': [v, i] = takeValue(arg, i); flags.formatDirs.push(v); break;
			default:
				if (arg.startsWith('-') && arg !== '-') throw new Error(`unknown option ${arg}`);
				cfg.sources.push(arg);
		}
	}
	return { cfg, flags };
}

function formatDirs(extra) {
	return [
		...engine.defaultSearchDirs({ programDirs: [path.join(__dirname, '..')], workingDir: process.cwd() }),
		...extra,
	];
}

function printLog(entry) {
	const prefix = entry.level === 'info' || entry.level === 'success' ? '' : `${entry.level}: `;
	const stream = entry.level === 'error' || entry.level === 'warn' ? process.stderr : process.stdout;
	stream.write(prefix + entry.message + '\n');
}

function main() {
	let parsed;
	try {
		parsed = parseArgs(process.argv.slice(2));
	} catch (err) {
		process.stderr.write(`error: ${err.message}\n\n${USAGE}`);
		process.exit(1);
	}
	const { cfg, flags } = parsed;
	if (flags.help) return process.stdout.write(USAGE);
	if (flags.version) return process.stdout.write(`nestwee-cli, ${pkg.version}\n`);
	if (flags.listCharsets) return process.stdout.write(engine.supportedCharsets().join('\n') + '\n');

	const formats = engine.StoryFormatsMap.discover(formatDirs(flags.formatDirs));
	if (flags.listFormats) {
		for (const f of formats.list()) {
			process.stdout.write(`${f.id.padEnd(16)} ${f.twine2 ? `${f.name} ${f.version}` : 'Twine 1 style'}${f.proofing ? ' (proofing)' : ''}\n`);
		}
		return;
	}
	if (!cfg.sources.length) {
		process.stderr.write(`error: Input sources not specified.\n\n${USAGE}`);
		process.exit(1);
	}
	if (!cfg.outFile) {
		process.stderr.write('error: An output file is required (-o FILE).\n');
		process.exit(1);
	}

	const run = () => {
		const log = engine.makeLogger(printLog);
		try {
			engine.build(cfg, { formats, log, creatorVersion: pkg.version });
			return true;
		} catch (err) {
			printLog({ level: 'error', message: err.message });
			return false;
		}
	};

	if (flags.watch) {
		run();
		engine.watch([...cfg.sources, ...cfg.modules], {
			outFile: cfg.outFile,
			onEvent: (e) => process.stdout.write(`${e.type}: ${path.relative(process.cwd(), e.path)}\n`),
			onChange: () => {
				process.stdout.write(`BUILDING: ${cfg.outFile}\n`);
				run();
			},
			onError: (err) => process.stderr.write(`error: ${err.message}\n`),
		});
		process.stdout.write('\nWatch mode started.  Press CTRL+C to stop.\n\n');
		return;
	}
	if (!run()) process.exit(1);
}

if (require.main === module) main();

module.exports = { parseArgs };
