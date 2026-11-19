# NesTwee user guide

This guide walks through everything NesTwee can do, one step at a time. If you just want to get it running, the short version is in the [README](../README.md#getting-started-step-by-step).

- [1. Install and run](#1-install-and-run)
- [2. Build a story](#2-build-a-story)
- [3. Watch mode](#3-watch-mode)
- [4. Modules and the head file](#4-modules-and-the-head-file)
- [5. Decompile a story back to Twee](#5-decompile-a-story-back-to-twee)
- [6. Story formats](#6-story-formats)
- [7. Accessibility settings](#7-accessibility-settings)
- [8. Presets](#8-presets)
- [9. Build an installer](#9-build-an-installer)
- [10. Troubleshooting](#10-troubleshooting)
- [11. Where things are saved](#11-where-things-are-saved)
- [12. Android phones and tablets](#12-android-phones-and-tablets)

---

## 1. Install and run

1. Install **Node.js 20 or newer** from [nodejs.org](https://nodejs.org/). The installer includes `npm`.
2. Open a terminal (on Windows: *PowerShell* or *Terminal*; on macOS: *Terminal*).
3. Download NesTwee and go into its folder:
   ```sh
   git clone https://github.com/Techy-Nature/Nestwee.git
   cd Nestwee
   ```
4. Install what it needs (this downloads Electron, about 100 MB):
   ```sh
   npm install
   ```
5. Start it:
   ```sh
   npm start
   ```

Next time, you only need step 5 (from inside the `Nestwee` folder).

---

## 2. Build a story

The **Build** page is the main screen.

1. **Add your sources.** Press **Add folders…** and pick the folder that holds your story. You can pick several folders at once. NesTwee searches every folder *recursively* (all the folders inside it, too) and shows what it found, for example *“Found 12 usable files: 8 Twee, 2 CSS, 1 JS, 1 Images”*. Press **Show files** to see the full list.
   - Use **Add files…** to add single files instead.
   - These file types are used: `.tw` `.twee` `.tw2` `.twee2` (Twee), `.html` `.htm` (compiled stories or Twine archives), `.css` (stylesheets), `.js` (scripts), fonts, images, audio, video and `.vtt` captions. Anything else is ignored.
   - Turn on **Skip hidden files and folders** (under advanced options) if you keep things like `.git` or `.backup` folders inside your project.
2. **Choose the output.** Pick **Playable HTML** (a story you can open in a browser), **Twine 2 archive** (to import into Twine 2) or **Twine 1 archive**. Then press **Choose…** next to *Output file* and pick where to save it.
3. **Choose the story format.** Leave it on **Automatic** to use the format named in your `StoryData` passage (or SugarCube 2 if there isn't one), or pick a specific one.
4. **Starting passage.** Leave it empty to use `StoryData`'s `"start"` (or a passage named `Start`), or type a passage name.
5. Press **Build** (or <kbd>Ctrl</kbd>+<kbd>B</kbd>; <kbd>Cmd</kbd>+<kbd>B</kbd> on a Mac).
6. Messages appear in the **Log** at the bottom. Warnings are amber with a ⚠, errors are orange-red with a ✖, and successes are teal with a ✔.
7. Press **Open output** to play it, or **Show in folder** to find the file.

### “Your story needs an IFID”

Every Twine 2 story needs a unique ID called an IFID. If yours doesn't have one, the build stops and NesTwee shows a box with a freshly made IFID and the exact `StoryData` passage to paste in. Use **Copy snippet**, paste it at the top of one of your `.twee` files, and build again. Keep that IFID forever; it identifies your story.

### Test mode

Tick **Test mode** to turn on the story format's debugging tools (for example SugarCube's debug bar). Don't publish a test build.

---

## 3. Watch mode

Watch mode rebuilds your story automatically every time you save a source file.

1. Set up your sources and output file as above.
2. Press **Watch & rebuild**. NesTwee builds once straight away, then waits.
3. A **Watching** badge appears at the top. Edit and save any Twee, CSS, JS or media file inside your source folders, and the story rebuilds within half a second. The log shows which file changed.
4. Press **Stop watching** when you're done.

Modules and the head file are watched too. The output file is ignored, so saving into your project folder won't cause a loop (NesTwee refuses to use the output file as an input anyway).

---

## 4. Modules and the head file

Open **Modules, head file & advanced options** on the Build page.

- **Modules** are CSS, JavaScript and font files that get added to the story's `<head>` *as separate tags*, before the story format's own code runs. They're good for libraries that must load early. Add folders (searched recursively) or single files.
- The **head file** is a file whose contents are pasted into `<head>` exactly as-is. Use it for things like `<meta>` tags, analytics snippets or external font links.
- **Input character set**: leave on *Automatic (UTF-8)* unless your files were saved in an older encoding such as Windows-1252.
- **Trim whitespace around passages** is on by default, like Tweego. Turn it off to keep leading and trailing blank lines.
- **Twee2 compatibility mode** understands Twee2's `:: Passage [tags] <x,y>` position syntax. Files ending in `.tw2` or `.twee2` always use it.

---

## 5. Decompile a story back to Twee

1. Open the **Decompile** page.
2. Press **Choose…** next to the first box and pick a compiled story or a Twine archive (`.html`). Twine 1 and Twine 2 files both work.
3. NesTwee suggests a `.twee` file next to it; press **Choose…** on the second box to change that.
4. Pick **Twee 3** (recommended; keeps passage positions and sizes) or **Twee 1**.
5. Pick line endings if you share files between Windows and macOS/Linux, then press **Decompile**.

---

## 6. Story formats

The **Story formats** page lists every format NesTwee can use, with its version and where it lives.

NesTwee comes with SugarCube 2, Harlowe 3, Chapbook 1, Snowman 2, Duplex 1 and Paperthin 1 (a proofing format). You're not limited to those or to the built-in presets.

### Import a single format (easiest)

1. Download the format you want. You need its `format.js` file (story formats, proofing formats and editing formats all come as a `format.js`).
2. On the **Story formats** page press **Import format.js…** (the Build page has an **Import a format…** button too) and choose the file.
3. NesTwee copies it into its own formats folder, names it after the format and its major version (for example `dotgraph-2`), and lists it straight away, marked as **Story** or **Proofing**. A license or icon file next to it is copied too.
4. Importing a newer version of a format that NesTwee already has (for example SugarCube 2.38) replaces the built-in one, because imported formats win over bundled ones.
5. **Remove** next to an imported format deletes it again; the bundled one comes back.

### Make a proofing copy

A proofing format turns your story into something to read and check rather than play (for example Paperthin prints every passage in order).

1. On the Build page choose **Proofing copy** under *What to make*.
2. Pick the proofing format in the **Proofing format** menu. Only proofing formats are listed there.
3. Choose an output file (it's suggested as `proof.html`) and press **Build**.

You can also pick a proofing format directly in the normal **Format** menu, where formats are grouped into *Story formats* and *Proofing formats*.

### Use a whole folder of formats

1. Make a folder for formats, for example `Documents/storyformats`.
2. Inside it, make one folder per format, such as `sugarcube-2.38`, and put the format's `format.js` in it (Twine 2 style). Twine 1 style formats use a `header.html` instead.
3. On the Story formats page, press **Add folder…** and choose the folder from step 1.
4. The new formats appear in the list and in the Build page's format menu. If two folders hold a format with the same folder name, the one in the folder listed last wins.

Like Tweego, NesTwee also checks `storyformats` (and `.storyformats`) folders in your home folder and next to the app, and the folders in the `TWEEGO_PATH` environment variable, so an existing Tweego setup is picked up automatically.

When the format is on **Automatic**, NesTwee picks the newest installed version with the same name and major version as the one in your `StoryData` that is at least as new as it.

---

## 7. Accessibility settings

Open **Accessibility** from the left menu or the button in the top right. Every change shows up in the **Live preview** on the right first; nothing changes in the rest of the app until you press **Apply**. **Undo changes** puts the controls back to what's currently applied, and **Reset to defaults** goes back to the original dark setup.

- **Theme**: Dark (default) or Light. The 🌙/☀️ button at the top switches straight away, without the preview step.
- **Font**: Sans-serif, **OpenDyslexic**, or Serif. OpenDyslexic is bundled with the app (it's free under the SIL Open Font License). If it can't be loaded for some reason, a warning tells you to install it from [opendyslexic.org](https://opendyslexic.org) and the app uses a plain sans-serif font until then. If OpenDyslexic is already installed on your computer, that copy is used.
- **Text size**: 80% to 200%. Use the slider or the small/large **A** buttons. Shortcuts that work anywhere: <kbd>Ctrl</kbd>+<kbd>=</kbd> bigger, <kbd>Ctrl</kbd>+<kbd>-</kbd> smaller, <kbd>Ctrl</kbd>+<kbd>0</kbd> back to 100%.
- **Contrast**: slide right for more contrast. Backgrounds move toward pure black (dark theme) or pure white (light theme), and text, borders, buttons, links and warnings move toward the opposite. At the far right, everything is strictly black and white. Warnings and errors keep their ⚠ and ✖ symbols so they're still easy to tell apart.
- **Extra letter and line spacing**, **Always underline links** and **Reduce motion** (turns off animations).

---

## 8. Presets

Both the Build page and the Accessibility page have a presets bar at the top.

**To save a preset:**

1. Set things up the way you like.
2. Type a name in **New preset name**.
3. Press **Save as preset** (or <kbd>Enter</kbd>).
   - On the Build page, **Include paths** decides whether your source folders, modules, head file and output file are saved with the preset. Untick it to save only the format and options, so the preset works for any project.

**To use a preset:** pick it from the menu. Build presets apply immediately. Accessibility presets load into the preview, then you press **Apply**.

**To change or remove one:** pick it, then press **Update** (saves the current settings over it) or **Delete**. Built-in presets can't be changed or deleted.

---

## 9. Build an installer

From the `Nestwee` folder:

The easiest way to get Windows and Mac apps is to let GitHub build them; see [Making an installer](../README.md#making-an-installer) in the README. To build on your own computer:

| Command | Makes |
| --- | --- |
| `npm run dist` | An installer for the system you're on |
| `npm run dist:win` | Windows installer and a portable `.exe` |
| `npm run dist:mac` | macOS `.dmg` (Apple only allows this on a Mac, which is why GitHub's Mac machines are handy) |
| `npm run dist:linux` | Linux AppImage and `.deb` |

The results go in `dist/`. Unsigned macOS and Windows builds will show a security prompt the first time they're opened; that's normal for apps that aren't code-signed.

---

## 10. Troubleshooting

| Problem | What to do |
| --- | --- |
| `npm install` fails while downloading Electron | Check your internet connection and run `npm install` again. Behind a proxy, set `HTTPS_PROXY` first. |
| “Story format "…" is not available” | Open the Story formats page to see what's installed. Either pick one of those on the Build page, or add a folder with the format your `StoryData` asks for. |
| “Starting passage "Start" not found” | Type your first passage's name in **Starting passage**, or add `"start": "Your Passage"` to `StoryData`. |
| “Special passage "StoryTitle" not found” | Add a `:: StoryTitle` passage with your story's name. |
| “The output file cannot be an input source” | Save the output outside your source folders, or into a folder you didn't add as a source. |
| Watch mode doesn't notice changes on a network drive | Some network drives don't report changes. Build manually, or keep the project on a local drive. |
| Text is too big to fit | Lower the text size, or make the window wider. Everything reflows at any size. |

---

## 11. Where things are saved

Your settings and presets are saved in one file, `nestwee-settings.json`, in the app's data folder:

- **Windows:** `%APPDATA%\NesTwee`
- **macOS:** `~/Library/Application Support/NesTwee`
- **Linux:** `~/.config/NesTwee`
- **Android:** inside the app itself (cleared if you uninstall it or clear its storage)

Delete that file to start fresh. Your stories are never stored there.

---

## 12. Android phones and tablets

There are two Android apps. **NesTwee** is simplified for phones. **NesTwee Tablet** looks and works like the desktop app. You can install either one, or both.

### Install

The apps aren't on the Play Store, so you install the .apk file yourself ("sideloading"). This is safe for apps you trust and only needs doing once per update.

1. On your phone or tablet, open the GitHub page for the latest **Build apps** run (Actions tab), or the latest release, and download **NesTwee-Android**. It's a .zip holding two files:
   - `NesTwee-…-android.apk` for phones
   - `NesTwee-Tablet-…-android.apk` for tablets
2. Open the Files app (or your browser's downloads), open the .zip, and tap the .apk you want.
3. Android asks whether to allow installing apps from this source. Tap **Settings**, turn on **Allow from this source**, then go back.
4. Tap **Install**. If Play Protect warns that it doesn't recognise the app, tap **More details → Install anyway**.
5. Open **NesTwee** (or **NesTwee Tablet**) from your app drawer.

**Updating:** install the new .apk over the old one. If Android says **"App not installed"** or that the package conflicts, uninstall the old version first. (Each build is signed with a temporary key, so Android sometimes can't tell it's the same app.) Uninstalling also removes your presets and imported formats, so note down any presets you want to keep.

### Give NesTwee permission to your story folders

Android doesn't let apps read your folders until you say so. You only need to do this once per folder.

1. Open the **Accessibility** tab (phone) or the **Accessibility** page (tablet).
2. Scroll to **Folder permissions** and tap **Give folder permission…**.
3. Android's folder picker opens. Go to the folder that holds your story (for example *Documents/Stories/my-story*) and tap **Use this folder**, then **Allow**.
4. The folder now appears in the list. NesTwee can read it and everything inside it, every time you build.

To take permission away, tap **Remove** next to the folder. (You can also skip this section: tapping **Add folder** on the Build page asks for permission the same way.)

> Android won't give permission for the very top of your storage or for the Download folder itself. Put your story in a folder inside them, such as *Documents/Stories*.

### Build a story on a phone

1. On the **Build** tab, tap **Add folder**. Pick one of the folders you gave permission to, or **Choose another folder…**.
   - Or tap **Pick .zip** to use a zip of your story folder, or **Pick files** to choose `.twee`, `.tw`, `.html`, `.css` and `.js` files directly.
2. Under **What to make**, pick *Playable story*, *Proofing copy*, *Twine 2 archive* or *Twee source*.
3. Tap **Build** at the bottom.
4. Tap **Preview** to play the story inside the app, or **Share** to send the file to Drive, email, Discord and so on.

Folders are read fresh on every build, so after editing your story in another app, just tap **Build** again. A .zip or picked files are a snapshot: pick them again after changes.

Built stories are saved in **Documents/NesTwee** on your device unless you choose another folder (see *Choose where builds are saved* below). On Android 10 and older the app asks once for storage permission. If you say no, the file is kept inside the app and **Share** is the way to get it out.

### Watch & rebuild on Android

1. Add your story with **Add folder** (watch mode follows folders; a .zip or picked files never change).
2. Tap **Watch** next to **Build** (phone) or **Watch & rebuild** (tablet). NesTwee builds once straight away.
3. Edit your story in another app and save. Within a couple of seconds NesTwee notices and rebuilds. The bar above the buttons (phone) or the log (tablet) shows when it last built.
4. Tap **Stop** (phone) or **Stop watching** (tablet) when you're done.

Android pauses apps you aren't looking at, so NesTwee checks for changes as soon as you switch back to it.

### Choose where builds are saved (export folder)

By default, builds go to **Documents/NesTwee**. To save them somewhere else, such as next to your story or in a folder that syncs to your computer:

- **Phone:** open **More options**, then pick a folder under **Save to**. Choose **Choose a folder…** to give permission to a new one.
- **Tablet:** press **Choose…** next to *Output file* and pick **Documents/NesTwee**, one of your folders, or **Choose another folder…**.

The built file replaces any older file with the same name in that folder. If you save into your story folder, NesTwee skips its own output when reading your story, so it won't build your story into itself.

### Build a story on a tablet

The tablet app works like the desktop one (see sections 2 to 8), with these differences:

| Desktop | Tablet |
| --- | --- |
| **Add folders…** | **Add folder…** (one folder at a time, from the folders you gave permission to or Android's folder picker) |
| **Add files…** | **Add files or .zip…** (a .zip counts as a whole folder) |
| **Open output** | **Preview** (plays the story in the app) |
| **Show in folder** | **Share** |
| Output file anywhere | **Documents/NesTwee**, or any folder you've given permission to |
| Watch mode | Works with folders added with **Add folder** |
| Extra format folders | Not available on Android (use **Import format.js…**) |

### Story formats on Android

All the built-in formats (SugarCube, Harlowe, Chapbook, Snowman, Duplex and Paperthin) are included. To add another, download its `format.js` to your device, then tap **Import format.js** on the Formats page and pick it.

### Troubleshooting on Android

| Problem | What to do |
| --- | --- |
| "App not installed" | Uninstall the older NesTwee first, then install again. |
| "NesTwee no longer has permission for this folder" | Give permission again in **Accessibility → Folder permissions**, or remove the folder from your sources and add it again. This happens if the folder was moved, renamed or deleted. |
| The folder picker says "Can't use this folder" | Android blocks the top of your storage and the Download folder. Pick a folder inside them instead. |
| The summary shows no Twee files | Make sure the zip holds `.twee` or `.tw` files (any subfolder is fine). If they're in a folder whose name starts with a dot, turn off **Skip hidden files**. |
| A story doesn't play right in Preview | Tap **Share** and open the file in Chrome to play it as a normal web page. |
| Text is too small or too big | Use the Accessibility tab. Text size goes from 80% to 200%. |

