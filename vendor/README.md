# Vendored files

Third-party files committed to the repository so the site keeps working without a CDN.

| Path | What | Version | Source | Licence |
|---|---|---|---|---|
| `vendor/fflate-0.8.2/fflate.js` | [fflate](https://github.com/101arrowz/fflate) ZIP library, ES module browser build (`esm/browser.js`), unmodified | 0.8.2 | npm `fflate@0.8.2` | MIT, `vendor/fflate-0.8.2/LICENSE` |
| `fonts/pt-sans-regular.woff2`, `fonts/pt-sans-bold.woff2` | PT Sans Regular and Bold (ParaType), Google Fonts release | 2.003W | TTFs from npm `@expo-google-fonts/pt-sans@0.4.1` (Google Fonts files), converted to WOFF2 with fontTools without subsetting or other changes | SIL Open Font License 1.1, `fonts/OFL-PT-Sans.txt` |
| `fonts/instrument-sans-{regular,medium,semibold,bold}.woff2` | Instrument Sans 400/500/600/700 (UI typeface), Google Fonts release | 1.000 | TTFs from npm `@expo-google-fonts/instrument-sans@0.4.2`, converted to WOFF2 with fontTools without subsetting or other changes | SIL Open Font License 1.1, `fonts/OFL-Instrument-Sans.txt` |

To update fflate, replace the folder with the new version's `esm/browser.js` and `LICENSE`, rename the folder to the new version and update the import in `app.js`.
