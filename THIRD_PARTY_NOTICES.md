# Third-party notices

NesTwee includes or is derived from the following third-party work. Each keeps its own license.

## Tweego

The compiler in `src/engine/` is a JavaScript port of [Tweego](https://github.com/tmedwards/tweego).
Copyright © 2014–2020 Thomas Michael Edwards. Simplified BSD (2-Clause) License, the same license as NesTwee (see `LICENSE.md`).

## Bundled story formats (`storyformats/`)

| Format | Version | Author | License |
| --- | --- | --- | --- |
| SugarCube | 2.37.3 | Thomas Michael Edwards | BSD 2-Clause (`storyformats/sugarcube-2/LICENSE`) |
| Harlowe | 3.3.9 | Leon Arnott | Zlib |
| Chapbook | 1.2.3 | Chris Klimas | MIT (`storyformats/chapbook-1/LICENSE`) |
| Snowman | 2.0.2 | Chris Klimas, Dan Cox | MIT |
| Duplex | 1.8.0 | Adularia for Neston | MIT (`storyformats/duplex-1/LICENSE`) |
| Paperthin | 1.0.0 | Chris Klimas | Zlib/libpng |

These are unmodified `format.js` files, as distributed with Twine 2 and Tweego, and (for Duplex) from the `1.8.0` tag of [Techy-Nature/duplex-story-format](https://github.com/Techy-Nature/duplex-story-format).

### Zlib license (Harlowe, Paperthin)

> This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.
>
> Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:
>
> 1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.
> 2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.
> 3. This notice may not be removed or altered from any source distribution.

### MIT license (Snowman)

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## OpenDyslexic font (`assets/fonts/opendyslexic/`)

OpenDyslexic by Abbie Gonzalez, licensed under the SIL Open Font License 1.1. The full license is in `assets/fonts/opendyslexic/OFL.txt`. The font files are unmodified.

## npm dependencies

- [parse5](https://github.com/inikulin/parse5): MIT
- [semver](https://github.com/npm/node-semver): ISC
- [iconv-lite](https://github.com/ashtuchkin/iconv-lite): MIT
- [Electron](https://www.electronjs.org/) and [electron-builder](https://www.electron.build/) (development and packaging): MIT
- [Capacitor](https://capacitorjs.com/) with @capacitor/filesystem and @capacitor/share (Android apps): MIT
- [fflate](https://github.com/101arrowz/fflate) (reading .zip files on Android): MIT
- [esbuild](https://esbuild.github.io/) (bundling the Android apps): MIT
