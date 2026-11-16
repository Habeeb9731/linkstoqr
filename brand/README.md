# Links to QR: logo guidelines

![Links to QR](png/linkstoqr-horizontal.png)

## 1. The logo

**Idea:** a QR code's corner square (its "finder eye") whose centre square steps out through the corner and becomes the
tail of a Q. Your content goes out into the world as a code that works anywhere. The same orange square is the tail of
the Q in the wordmark, so the symbol and the name share one detail.

| Version | File | Use it for |
|---|---|---|
| Horizontal | `linkstoqr-horizontal.svg` | The default: site header, README, documents |
| Stacked | `linkstoqr-stacked.svg` | Square or narrow spaces: stickers, social images |
| Symbol | `linkstoqr-symbol.svg` | Avatars, app icon, anywhere the name is already nearby |
| Wordmark | `linkstoqr-wordmark.svg` | Rare: only where the symbol already appears close by |

Each of these has an `-on-dark.svg` version (white frame and letters, orange square) for dark backgrounds. The
`horizontal/`, `stacked/`, `symbol/` and `wordmark/` folders hold one-colour versions (black, white and Escape Orange),
and `png/` holds PNG copies for tools that can't use SVG.

## 2. Clear space

Keep a clear zone around the logo equal to **the escaping orange square** (the symbol's width ÷ 2.6) on every side. The
zone scales with the logo.

## 3. Minimum size

| Version | Screen | Print |
|---|---|---|
| Horizontal | 120 px wide | 25 mm wide |
| Stacked | 64 px wide | 15 mm wide |
| Symbol | 16 px (use `symbol/favicon.svg` or `symbol/favicon.ico`) | 5 mm |

Below 120 px wide, use the symbol on its own: the Q's tail gets too small to read.

## 4. Colour

| Name | HEX | RGB | CMYK (approx.) | Pantone (approx.) | Use |
|---|---|---|---|---|---|
| Ink | `#17181A` | 23 24 26 | 0 0 0 95 | Neutral Black C | The frame, the letters, text |
| Escape Orange | `#E8431A` | 232 67 26 | 0 85 95 0 | 172 C | Only the escaping square, and app-icon tiles |

Contrast: Escape Orange is 4.0 : 1 on white, 3.6 : 1 on the site's paper background (`#F6F4EF`) and 4.7 : 1 on its
dark background (`#121315`). CMYK and Pantone values are starting points: check them against a printed swatch before
any print run.

**Approved logo and background pairs**

- Full colour on white or paper.
- The on-dark version on Ink or any near-black.
- All white on Escape Orange (this is what the app icon uses).
- All black on white, for one-colour print.
- On photos, use the all-white or all-black version over a calm area.

Never put the full-colour logo on orange: the square disappears.

## 5. Typography

- **Wordmark:** Inter Bold, outlined, with a custom Q. Never retype the name in a font to make the logo.
  Inter is licensed under the SIL Open Font License 1.1, which allows logo use.
- **Website:** the site's existing system font stack (`ui-sans-serif, system-ui, …`) works well alongside the logo.

## 6. Don'ts

- Don't stretch, squash or rotate the logo.
- Don't move the orange square, close the gap, or put the square back inside the frame.
- Don't recolour it with colours outside the palette, or turn the frame orange.
- Don't add shadows, outlines, gradients or other effects.
- Don't change the size or spacing of the parts of a lockup.
- Don't place the full-colour version on a busy photo or on orange.

## 7. Web icons

`symbol/` contains the complete icon set:

- `favicon.ico` (16, 32 and 48 px)
- `favicon.svg`, which switches its frame to white when the browser is in dark mode
- `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `maskable-512.png`
- `site.webmanifest`
- `head-snippet.html`, the tags to paste into the page's `<head>`

The app icon is the all-white symbol on an Escape Orange tile.

## 8. Source

`presentation.html` and `slides/` show the logo in use. `source/` holds the scripts that outline the wordmark
(`wordmark.py`, which needs `fonttools` and `Inter-Bold.ttf` from Inter 4.1) and compose every master file
(`compose.py`). Run them in that order to rebuild the artwork.

Trademark: no trademark search has been done. Get a professional clearance search before registering the logo or
investing in print. In testing, the closest existing mark found was Pagekit's square-outline P.
