# PactAI brand files

Everything here is served publicly, so any of it can be linked straight from a
deck, a form, or a README:

`https://pactai-nine.vercel.app/brand/<filename>`

## What to use where

| File | Use it for |
|---|---|
| `logo-mark.svg` / `logo-mark-512.png` / `-1024.png` | The mark alone, transparent. Anywhere the name is already written next to it. |
| `logo-square.svg` / `logo-square-512.png` / `-1024.png` | Mark on the dark rounded square. Avatars, app icons, favicons — anywhere the platform crops to a square. |
| `logo-wordmark-dark.svg` / `-1520.png` | Mark plus name, light type. **For dark backgrounds.** |
| `logo-wordmark-light.svg` / `-1520.png` | Mark plus name, dark type. **For light backgrounds** — slides, print, a white page. |

PNGs have transparent backgrounds, so pick the variant that matches what you
are placing it on rather than expecting one file to work everywhere. Prefer the
SVGs wherever they are accepted: they stay sharp at any size and weigh a
fraction of the PNGs.

## Colours

| | Dark backgrounds | Light backgrounds |
|---|---|---|
| Arcs (the two parties) | `#4d9fff` | `#2f7fd6` |
| Ring (the escrow) | `#ffb454` | `#d1861f` |
| Dot (released value) | `#3ddc97` | `#17a86a` |
| Page background | `#0b0e14` | — |
| Wordmark type | `#e8ecf4` | `#0b0e14` |

The light-background variants are darkened so they keep enough contrast on
white; the shapes are identical.

## What the mark means

Two halves reaching for each other, with value held in the gap between them.
Two parties who do not trust each other, and money that waits until the work is
proven. The ring is amber because that is the escrow colour everywhere in the
app, and the dot is mint because that is the colour of a release.

## The wordmark's type

The wordmark SVGs set the same system font stack the site uses, so the name
renders in the viewer's own UI font. That keeps it consistent with the live
product but means it is not pixel-identical across machines. The PNGs have the
type baked in. If you ever need a fixed typeface in the SVG too, the letters
have to be converted to outlines — ask and it can be done.
