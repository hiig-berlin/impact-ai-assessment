# Rating Pie Generator

A small static website that turns a CSV of criterion scores into the report's radial
"24 criteria" diagram and exports the diagram and its pie pieces as SVG, PNG and JPG,
ready for Affinity and the report. Everything runs in the browser; nothing is uploaded.

The full specification is in [SPECS.md](SPECS.md).

## Usage

1. Open the site (GitHub Pages) or a local copy (see below).
2. Drop a CSV onto the page, or choose one. Use **Use example scores** to try it with
   [`examples/ratings.csv`](examples/ratings.csv); an empty CSV template with all 24
   criteria can be downloaded from the page.
3. Fix any errors shown (they always name the CSV row). Warnings don't block output.
4. Choose the options:
   - **Pie position** for cluster and score files: *original position* (default; the
     files stack exactly onto their overview in Affinity) or *start angle* (each pie on
     its own, starting at the given angle, clockwise from 12 o'clock; default 270°).
   - **PNG/JPG size**: ×1 (1080 px), ×2 (2160 px) or ×4 (4320 px) square side.
5. Check the preview, then download single files (SVG / PNG / JPG) or everything as
   `rating-pie-YYYY-MM-DD.zip`.
6. Open an SVG in Affinity. Layers are named (`Impact`, `07 Accountability`, `Wedge`,
   `Rating 1` … `Rating 5`, `Number`, `Label`) and the text is editable PT Sans. Save as
   `.af` if needed.

### CSV format

```
criterion number;criterion name;score
1;Objective & realisation;3
9;"Inclusion, participation & co-design";3
```

- Header row required; column names are case-insensitive. Other columns are ignored.
- Delimiter `;`, `,` or tab (detected from the header). Quote fields that contain the
  delimiter, quotes or line breaks (`""` for a literal quote).
- UTF-8 (with or without BOM) or Windows-1252.
- `criterion number`: 1–24, each exactly once (later duplicates are ignored with a warning).
- `criterion name`: optional; replaces the label in the graphic, never the file name.
- `score`: whole number 1 (Insufficient) to 5 (Exemplary).

### Output files

```
overview.svg                     category order, centre pie
overview-legend.svg              same, with legend
overview-scores.svg              score order, blank centre, separators
overview-scores-legend.svg       same, with legend
clusters/<category>.svg          e.g. clusters/impact.svg
clusters/<category>-centre.svg   same, plus the category's centre sector and icon
scores/<score>.svg               e.g. scores/5-exemplary.svg (only scores that occur)
slices/<criterion>.svg           e.g. slices/07-accountability.svg
ratings.csv                      the input
```

Each SVG also exists as PNG (transparent) and JPG (white), 72 dpi, with PT Sans embedded.

## Local development

ES modules and `fetch` don't work over `file://`, so serve the repository root:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000> for the tool and <http://localhost:8000/tests/> for the
tests. There is no build step and no dependency to install.

| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js` | UI, file handling, downloads, ZIP |
| `pie.js` | template parsing, geometry, ordering, SVG export (constants at the top) |
| `csv.js` | CSV decoding, parsing and validation |
| `raster.js` | PNG/JPG rendering, font embedding, dpi metadata |
| `names.js` | categories, criteria, scores and slugs |
| `template/template.svg` | built-in design (generated, see below) |
| `fonts/`, `vendor/` | PT Sans and fflate, see [vendor/README.md](vendor/README.md) |
| `tests/` | browser tests and `expected/` snapshots |
| `tools/` | template cleanup scripts (macOS) |

Code style: 2 spaces, semicolons, single quotes ([.prettierrc.json](.prettierrc.json)).

### Tests

`tests/index.html` runs all tests in the browser and shows pass/fail: template check,
CSV parsing and validation, ordering and placement, file and layer names, unique ids,
raster output and snapshots.

The snapshot tests compare the SVGs generated from `examples/ratings.csv` (default
options) with `tests/expected/`. When an output changes on purpose, the test page offers
the new file for download next to the failing test; check it and replace the file in
`tests/expected/` (keep the folder structure: `clusters/`, `scores/`, `slices/`).

Text positions depend on the browser's measurement of PT Sans, so the snapshots can
differ in the last decimals between browsers; the failure message then says
"only numbers differ, by at most …".

## Updating the built-in template

The design lives in `template/template.svg`, generated from the original Affinity export
`template/ImpactAssessment_Template.svg`. Make design changes (e.g. colours) in the
original, keep its layer names, then regenerate on a Mac with PT Sans installed:

```
cd tools && python3 clean_template.py ../template/ImpactAssessment_Template.svg ../template/template.svg
```

The generator reads the palette from the template, so colour changes carry over. Run the
tests afterwards: the template check must pass, and snapshot differences show what changed.
`template/template.svg` can also be edited directly as long as the structure and ids from
SPECS.md §6 are kept (Affinity regenerates ids on export, so restore them before committing).

## Licence

Code: MIT, see [LICENSE](LICENSE). PT Sans: SIL Open Font License 1.1. fflate: MIT.
