<p align="center">
	<img src="assets/logo.svg" alt="NesTwee logo: a starry blue hawk" width="160">
</p>

<h1 align="center">NesTwee</h1>

<p align="center">A desktop and Android app that does everything <a href="https://github.com/tmedwards/tweego">Tweego</a> does, with buttons instead of command-line flags.</p>

NesTwee compiles Twee and Twine sources into playable HTML stories, makes Twine 1 and Twine 2 archives, decompiles stories back into Twee, and can watch your folders and rebuild every time you save. It has a dark theme by default, a light theme, and an accessibility panel with OpenDyslexic, text sizing and a contrast slider that goes all the way to pure black and white.

![NesTwee's Build page in the dark theme](docs/screenshots/build-dark.png)

| Accessibility panel with live preview | Contrast slider at maximum (light) | Light theme |
| --- | --- | --- |
| ![Accessibility settings with OpenDyslexic in the preview](docs/screenshots/accessibility.png) | ![Preview at maximum contrast: pure black on white](docs/screenshots/contrast-max-light.png) | ![Build page in the light theme](docs/screenshots/build-light.png) |

## What it can do

| Tweego option | Where it lives in NesTwee |
| --- | --- |
| `sources…` (searched recursively) | **Build → Sources → Add folders…** (folder picker, searched recursively, with a live count of what was found) |
| `-o, --output` | **Build → Output file** |
| `-f, --format` | **Build → Story format** (or *Automatic*, which reads your `StoryData` passage) |
| `-s, --start` | **Build → Starting passage** |
| `-t, --test` | **Build → Test mode** |
| `-a, --archive-twine2` / `--archive-twine1` | **Build → What to make** |
| `-d, --decompile-twee3` / `--decompile-twee1` | **Decompile** page |
| `-m, --module` | **Build → Modules, head file & advanced options** |
| `--head` | **Build → Head file** |
| `-c, --charset` | **Build → Input character set** |
| `--no-trim` | **Build → Trim whitespace around passages** |
| `--twee2-compat` | **Build → Twee2 compatibility mode** |
| `-w, --watch` | **Build → Watch & rebuild** |
| `-l, --log-stats` / `--log-files` | **Build → advanced options** (shown in the log panel) |
| `--list-formats` | **Story formats** page |
| `TWEEGO_PATH` and `storyformats` folders | **Story formats → Search folders** (and still honoured automatically) |

Extras that Tweego doesn't have:

- **Presets** for build settings (format, start passage, options and, if you like, your folders) and for accessibility settings. A few built-in presets are included.
- **A missing-IFID helper** that shows the `StoryData` snippet to paste, with copy buttons.
- **Bundled story formats**: SugarCube 2.37.3, Harlowe 3.3.9, Chapbook 1.2.3, Snowman 2.0.2, Duplex 1.8.0 and Paperthin 1.0.0, so it works straight away.
- **Any other format, including proofing formats**: **Import format.js…** copies any Twine 2 story or proofing format into NesTwee, and **Proofing copy** builds your story with a proofing format of your choice.
- **A command-line twin**, `nestwee-cli`, that accepts Tweego's flags (handy for scripts and CI).

## On Android phones and tablets

There are two Android apps, built from the same code:

| **NesTwee** (phones) | **NesTwee Tablet** |
| --- | --- |
| ![The phone app after building a story](docs/screenshots/android-phone.png) | ![The tablet app: the desktop layout with a build log](docs/screenshots/android-tablet.png) |
| One column, big buttons and three tabs at the bottom: Build, Formats and Accessibility. Made for small screens (it fits a 320-pixel-wide phone). | The same layout as the desktop app: sidebar, Build, Decompile, Story formats, Accessibility, presets and the build log. |

Both run the whole compiler on the device, with no internet needed. Add your story folder (give NesTwee permission once, in **Accessibility → Folder permissions** or the first time you tap **Add folder**), or pick a **.zip** of it, or the files themselves. A folder is read again on every build, so your latest edits are always used. **Watch** rebuilds your story whenever a file in your folder changes. Built stories are saved to **Documents/NesTwee**, or to any folder you choose under **Save to**. You can play them straight away with **Preview** or send them anywhere with **Share**. Extra format folders are desktop-only.

Both apps can be installed side by side. See **[Install on Android](docs/GUIDE.md#12-android-phones-and-tablets)** for the step-by-step guide.

## Getting started (step by step)

You need **Node.js 20 or newer** (which includes `npm`). Get it from [nodejs.org](https://nodejs.org/) if you don't have it.

1. **Get the code.**
   ```sh
   git clone https://github.com/Techy-Nature/Nestwee.git
   cd Nestwee
   ```
2. **Install the dependencies.** This also downloads Electron, which can take a minute.
   ```sh
   npm install
   ```
3. **Start the app.**
   ```sh
   npm start
   ```
4. **Build the example story** to check everything works:
   1. On the **Build** page, press **Add folders…** and choose `examples/hello-hawk/src`.
   2. Press **Choose…** next to *Output file* and save it as `hello-hawk.html` anywhere you like.
   3. Press **Build** (or <kbd>Ctrl</kbd>+<kbd>B</kbd>).
   4. Press **Open output** to play it in your browser.

For a deeper walkthrough (watch mode, modules, presets, adding story formats, building installers, troubleshooting), see the **[User guide](docs/GUIDE.md)**.

## Making an installer

### The easy way: let GitHub build them

The repository has a GitHub Actions workflow (`.github/workflows/build.yml`) that builds the Windows, macOS and Linux apps on GitHub's own Windows, Mac and Linux machines.

1. Push to `main`, open a pull request, or start it by hand: **Actions** tab → **Build apps** → **Run workflow**.
2. When it finishes (about 5–10 minutes), open the run and download **NesTwee-Windows**, **NesTwee-macOS**, **NesTwee-Linux** or **NesTwee-Android** (both .apk files) from the **Artifacts** section at the bottom.
3. To publish a release, push a version tag, for example:
   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```
   The apps are then attached to a GitHub Release automatically.

The apps aren't code-signed yet, so Windows SmartScreen and macOS Gatekeeper will warn the first time they're opened (on a Mac: right-click the app → **Open**).

### Building on your own computer

```sh
npm run dist        # for the computer you're on
npm run dist:win    # Windows installer + portable .exe
npm run dist:mac    # macOS .dmg (Apple only allows this on a Mac)
npm run dist:linux  # AppImage + .deb
```

The finished files land in the `dist/` folder.

To build the Android apps yourself you need [Android Studio](https://developer.android.com/studio) (or the Android SDK and Java 21):

```sh
npm run android:phone     # or: npm run android:tablet
cd android
./gradlew assembleDebug                            # phone app
./gradlew assembleDebug -PnestweeVariant=tablet    # tablet app (run after android:tablet)
```

The .apk lands in `android/app/build/outputs/apk/debug/`. You can also open the `android` folder in Android Studio and press **Run**. To try the mobile interface in a desktop browser instead, run `npm run web:phone` (or `web:tablet`) and serve the `mobile/www` folder with any static web server.

## Using the command line version

```sh
npx nestwee-cli -o story.html path/to/src          # compile
npx nestwee-cli -d -o story.twee story.html        # decompile
npx nestwee-cli -w -o story.html path/to/src       # watch
npx nestwee-cli --list-formats
npx nestwee-cli --help
```

## Development

```sh
npm test                        # engine tests (Node's built-in test runner)
node scripts/generate-logo.js   # regenerate assets/logo.svg and assets/icon.svg
```

How the code is laid out:

```
src/engine/    The compiler: a JavaScript port of Tweego (lexer, story model, formats, modules, watch)
src/main/      Electron main process: window, dialogs, settings file, IPC
src/renderer/  The interface: index.html, styles.css, app.js
src/cli.js     Command-line front end with Tweego-compatible flags
mobile/        Android apps: bridge.js (in-browser stand-in for the desktop's file access),
               phone/ (the phone interface), tablet/ (tweaks to the desktop interface), build.mjs
android/       The Capacitor Android project that wraps mobile/www
storyformats/  Bundled story formats
assets/        Logo, app icon and the OpenDyslexic font
```

### Why Electron, and why a port instead of wrapping the `tweego` binary?

- **Electron** gives one codebase for Windows, macOS and Linux, a mature file/folder picker, and the web platform's accessibility features (screen readers, focus handling, font loading) for free.
- **Porting Tweego to JavaScript** instead of bundling the Go binary means there's nothing extra to download per platform, errors come back as structured messages the interface can explain (like the IFID helper), and watch mode, folder scanning and presets all share one engine. The port follows Tweego's source closely (lexer, passage ordering, `StoryData` handling, format selection by name and version, module and head injection), and the test suite checks round-trips between compiling and decompiling.

## Credits and licenses

- NesTwee is released under the BSD 2-Clause license (see [LICENSE.md](LICENSE.md)).
- The compiler is a port of [Tweego](https://github.com/tmedwards/tweego) by Thomas Michael Edwards (BSD 2-Clause).
- Bundled story formats and the OpenDyslexic font keep their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- The hawk logo is an original design for NesTwee.
