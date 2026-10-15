# Impact AI Assessment Wheel – Specification

A small static website that turns a CSV of criterion scores into the radial "24 criteria" diagram of the [Impact AI assessment method](https://doi.org/10.5281/zenodo.23186663), clustered by category (colour) and by score, and exports the diagram plus its individual pie pieces as SVG, PNG and JPG files ready for Affinity, reports and presentations.

The repository and code keep the working name "Rating Pie Generator" (`rating-pie` in file names); "Impact AI Assessment Wheel" is the name shown to users.

Status: version 1 (`v0.1.0-alpha`) is implemented. Round 2 (application layout, §8; legend position, §5.2) is specified and ready for implementation.

---

## 1. Goals

- Produce the report graphic from a CSV in a few clicks, without manual editing in Affinity.
- Run entirely in the browser: no installation, no server-side code, no uploads. It works on any standard Windows or Mac computer.
- Provide every output as SVG, PNG and JPG. The SVGs open in Affinity as editable vector documents with meaningful layer names.

### Non-goals

- Generating native Affinity files (`.af` / `.afdesign`). The format is closed and undocumented. Users open the SVG in Affinity and save it as `.af` if needed.
- Uploading a template. The design is built into the site (§4.1); the CSV is the only input.
- Accounts, storage or collaboration features.
- Offline use. The tool is used online via GitHub Pages.

### Long-term goals (not in the first version)

- Editing the design (fonts, colours, labels) in the tool. Until then, the design lives in the built-in template and is changed in the repository (§4.1).

## 2. Users and usage

- The research group that developed the Impact AI method: a handful of people, creating graphics for a report every couple of weeks.
- Third parties who apply the published method in their own assessments, for their reports and presentations.
- Flow: open the page → drop in the CSV → check the preview → download single files or all files as a ZIP.
- PT Sans is installed on the users' computers, so text renders correctly when the SVGs are opened in Affinity.

## 3. Hosting and development

- Public GitHub repository, published with **GitHub Pages** straight from the repository, with no build step.
- Plain HTML, CSS and JavaScript. No framework or bundler. Libraries (e.g. for ZIP creation) and the PT Sans font files (SIL Open Font License) are committed to the repo (vendored), not loaded from a CDN, so the tool keeps working long-term.
- Expected usage is far below GitHub Pages limits (1 GB site size, 100 GB/month soft traffic limit). Using the page doesn't trigger builds; all processing happens in the browser.
- **Local development**: ES modules and `fetch` don't work over `file://`. Serve the repository root locally:

  ```
  python3 -m http.server 8000      # then open http://localhost:8000 (tests: /tests/)
  ```

## 4. Inputs

### 4.1 Built-in template

- `template/template.svg` is the cleaned template. It is loaded automatically; users never upload or re-import a template.
- It is generated from `template/ImpactAssessment_Template.svg` (the original Affinity export) by `tools/clean_template.py` (§10). Design changes (e.g. new colours) are made in the original, then the clean template is regenerated:

  ```
  cd tools && python3 clean_template.py ../template/ImpactAssessment_Template.svg ../template/template.svg
  ```

  The tool runs on macOS only (`measure.swift` measures text widths with CoreText) and needs PT Sans installed. It keys on the original's layer names, so those must be kept.
- Alternatively, `template/template.svg` can be edited directly, as long as the structure and ids in §6 are kept. Affinity regenerates ids from layer names on export, so ids must be restored before committing.

### 4.2 Scores CSV

```
criterion number;criterion name;score
1;Objective & realisation;3
2;Impact achievements;5
...
9;"Inclusion, participation & co-design";3
...
24;Future perspectives & collaboration;5
```

- **Header row** required. The column names `criterion number`, `criterion name` and `score` are matched case-insensitively, ignoring surrounding spaces. Other columns (e.g. `comment`) are ignored.
- **Delimiter**: auto-detected from the header row: `;` (German Excel), `,` or tab.
- **Quoting** (RFC 4180): fields may be wrapped in double quotes, and must be when they contain the delimiter, a quote or a line break. Inside a quoted field, `""` is a literal quote. Several names contain commas (criteria 9 and 21), so comma-delimited files rely on this.
- **Encoding**: UTF-8, with or without BOM. If strict UTF-8 decoding fails, fall back to Windows-1252 (older Excel exports).
- **Empty rows** (no values, or only delimiters and whitespace) are ignored silently. They often appear at the end of Excel/Sheets exports.
- **criterion number**: integer 1–24 (the number shown on the diagram).
- **criterion name**: optional. If present and not empty, it replaces the template's label in the graphic. If empty or missing, the template's label is used (§6.2). A name never causes an error.
- **score**: integer 1–5 (§6.3). Score names, decimals (`4.5`) and other values are invalid.
- **Duplicate criterion numbers**: the first row wins; later rows with the same number are ignored, with a warning.

Validation messages (always with the CSV row number). Errors block all output; warnings don't:

| Check | Level |
|---|---|
| Required column `criterion number` or `score` missing | error |
| Criterion number not an integer 1–24 | error |
| Score not an integer 1–5 | error |
| Criterion 1–24 missing | error |
| Duplicate criterion number (row ignored) | warning |
| Criterion name wider than ≈ 700 px at the label font size, so it would run past the wedge | warning |

The repo includes `examples/ratings.csv` with the sample scores (§9). The page offers it for download, together with an empty CSV template that contains the 24 criterion numbers and names and an empty score column.

## 5. Outputs

File and layer names come from the tables in §6.1–§6.3 and never from CSV names, so they stay stable from report to report. Each SVG also exists as PNG and JPG, with the same path and name and a different extension.

```
overview.svg                     full diagram, category order, centre pie, no legend
overview-legend.svg              same, with legend
overview-scores.svg              full diagram, score order, blank centre, no legend
overview-scores-legend.svg       same, with legend
clusters/<category>.svg          one per category, e.g. clusters/impact.svg
clusters/<category>-centre.svg   same, plus the category's centre sector and icon
scores/<score>.svg               one per score that occurs, e.g. scores/5-exemplary.svg
slices/<criterion>.svg           one per criterion, e.g. slices/07-accountability.svg
ratings.csv                      the input, for traceability
```

Everything can be downloaded individually, or as one ZIP named `rating-pie-YYYY-MM-DD.zip` with the same folder structure.

| File | Order | Contains | Centre | Legend |
|---|---|---|---|---|
| `overview` | category | all 24 criteria | category pie with icons | – |
| `overview-legend` | category | all 24 criteria | category pie with icons | yes |
| `overview-scores` | score | all 24 criteria, plus separators | blank | – |
| `overview-scores-legend` | score | all 24 criteria, plus separators | blank | yes |
| `clusters/<category>` | category | the category's criteria | – | – |
| `clusters/<category>-centre` | category | the category's criteria | the category's sector + icon | – |
| `scores/<score>` | score | the score's criteria (no separators) | – | – |
| `slices/<criterion>` | category | one criterion | – | – |

"Criteria" always means all of a criterion's parts: wedge, rating rings, number and label. The score overview has a blank centre because categories are mixed there, so the category pie would be misleading.

- **Position**: both overviews always start at 12 o'clock. Cluster and score files follow the *pie position* option (§7.1); slice files always keep their category-overview position.
- **Canvas**: the overviews keep the template's full A4 page. All cluster, score and slice files use the same square crop around the chart centre, `viewBox="40.157 272.634 2400 2400"` (centre ± 1200), so every pie has the same centre and size. In the "original position" mode they line up exactly with their overview when stacked in Affinity.
- **Affinity layer names**: every generated group gets an `affinity:id` attribute (namespace `https://www.affinity.studio/`), which Affinity shows as the layer name. Cluster groups use the category or score name (`Impact`, `Exemplary`, …). Criterion groups use number and displayed label (`07 Accountability`, or the CSV name), containing `Wedge`, `Rating 1` … `Rating 5`, `Number`, `Label`.
- **ids**: every output document has unique `id`s.

### 5.1 PNG and JPG

- Rendered in the browser from the SVG (SVG → `<img>` → `<canvas>` → `toBlob`).
- **Framing**: the raster shows the content, not the A4 page.
  - Files without legend: a **square** image, **1080 × 1080 px** by default. The square crop from §5 (2400 × 2400) fills it with a margin of 5 % on each side, so the pie is the same size and in the same place in every image, overviews included.
  - Files with legend: A4 portrait or 16:9 landscape depending on the legend position, with the same pie size (§5.2).
- **Size option**: ×1 (1080 px, default), ×2 (2160 px), ×4 (4320 px) for the square side. The SVGs stay resolution-independent for print.
- **72 dpi** is written into the file metadata (PNG `pHYs` chunk, JPEG JFIF density), since `canvas.toBlob` doesn't set it.
- **Background**: PNG transparent, JPG white (quality 0.92).
- **Fonts**: an SVG drawn into a canvas can't use the page's web fonts. Before rasterising, embed the vendored PT Sans Regular and Bold as base64 `@font-face` (family `PT Sans`, weights 400 and 700) in the SVG's `<style>`, so PNG/JPG text is correct even on computers without PT Sans. The SVG downloads don't embed the font, so Affinity uses the installed PT Sans.
- **Memory**: for the ZIP, raster files are created one after another and released after compression, so ×4 doesn't need all images in memory at once.

### 5.2 Legend position

Only the two overviews have a legend (`overview-legend`, `overview-scores-legend`). Cluster, score and slice files never have one.

- **Option**: legend position **left / right / top / bottom**, default **bottom** (one setting per run). It applies to the `-legend` files in all three formats.
- **ZIP**: always contains both versions of each overview, with and without legend; the legend versions use the chosen position.
- **Bottom** is the template's own position: the SVG is the same as in version 1 (the PNG/JPG get the A4 shape, see below).
- **Other positions**: the generator moves the legend by prepending `translate(dx,dy)` to the `Legend` group's `transform`; the legend itself is otherwise unchanged (§6). The legend keeps the same distance to the chart's square crop as in the template, turned to the chosen side, and is aligned to the same end:
  - right / left: beside the crop square, bottom edges aligned;
  - top: above the crop square, right edges aligned (mirroring bottom).
- **Page shape** follows the use: left and right are for slides, top and bottom for reports.

  | Legend | Shape | SVG `viewBox` | PNG/JPG at ×1 |
  |---|---|---|---|
  | bottom | A4 portrait | the template page, `0 0 2481 3508` (as in version 1) | 1080 × 1527 |
  | top | A4 portrait | 2481 × 3508, shifted up so the legend has the same distance from the page top as the chart has in the bottom layout | 1080 × 1527 |
  | left, right | 16:9 landscape | 4741 × 2667: the crop square plus the raster margin (§5.1) in height | 1920 × 1080 |

  ×2 and ×4 scale these sizes (A4: 2160 × 3055 and 4320 × 6109, rounded). In every shape the pie has the same size as in the square images (the 2400 crop at 90 % of 1080 px), so pies match across all files. In the 16:9 shape, the chart and the legend are centred horizontally as one group; in the A4 shape, the chart keeps its horizontal position from the template.
- **PNG/JPG framing** for the `-legend` files (replaces the "extended canvas" rule of version 1). The frame starts from the square raster frame of §5.1 (crop square plus 5 % margin):
  - A4 (top, bottom): same width, extended to the A4 ratio (height = width × √2), downwards for bottom and upwards for top;
  - 16:9 (left, right): same height, extended to 16:9 width, with chart and legend centred horizontally as in the SVG.
  - So the A4 rasters have the margins of the square images, not the SVG page's margins. Areas without content are transparent (PNG) or white (JPG).
- Exact offsets and the fit of the legend in each shape are checked by eye before the snapshots are committed.

## 6. Template structure (`template/template.svg`)

The template was rebuilt from the original in October 2026: the wedges, rings and centre sectors have exact geometry in absolute coordinates with no overlaps, there are no embedded bitmaps, the outlines are white, and the colour shades are evenly spaced. All rings are coloured in the template ("everything Exemplary"), so it carries the full palette.

Canvas: `viewBox="0 0 2481 3508"` (A4 at 300 dpi). Structure, with ids and the Affinity layer names in brackets:

```
Legend  [Legend]                              bottom of the page; only kept in *-legend files
└─ Legend-Tiles  [Tiles]
   ├─ Legend-Impact  [Impact]                 one group per category, same for the other four
   │  ├─ Legend-Impact-level0 … -level5       colour tiles [Level 0 … Level 5]
   │  └─ Legend-Impact-label  [Label]         category name + icon
   ├─ Legend-Grey  [Grey]
   │  ├─ Legend-Grey-tile1 … -tile5           grey tiles [Tile 1 … Tile 5]
   │  └─ Legend-Score-Names  [Score names]    Insufficient … Exemplary
   └─ Legend-Governance, Legend-Social-Sustainability, …
Diagram  [Diagram]
├─ Impact  [Impact]                           one group per category, in category order
│  ├─ C01  [01 Objective & realisation]
│  │  ├─ C01-wedge    [Wedge]      category background, r 156 → 870
│  │  ├─ C01-rating1  [Rating 1]   r 890 → 949.2
│  │  ├─ …                         five rings of equal width (59.2)
│  │  ├─ C01-rating5  [Rating 5]   r 1126.8 → 1186
│  │  ├─ C01-number   [Number]     PT Sans Bold 37.5
│  │  └─ C01-label    [Label]      PT Sans 41.667
│  └─ C02 … C05
├─ Governance                      (C06–C09)
├─ Social-Sustainability           (C10–C20)
├─ Environmental-Sustainability    (C21–C22)
└─ Economic-Sustainability         (C23–C24)
Centre  [Centre]                   category pie, r 0 → 148
├─ Centre-Impact  [Impact]         Sector (0°–75°) + Icon
├─ Centre-Governance               Sector (75°–135°) + Icon
├─ Centre-Social-Sustainability    Sector (135°–300°) + Icon
├─ Centre-Environmental-Sustainability   Sector (300°–330°) + Icon
└─ Centre-Economic-Sustainability        Sector (330°–360°) + Icon
```

The centre sectors use the level-5 colour of their category; the icons are centred in their sector at radius 102.

**Transforms** (where coordinates are not absolute):

- Wedge, ring and centre-sector paths: absolute coordinates, no transform.
- Number and label texts: one rotation `matrix(…)` directly on each `<text>`; `x`/`y` are in that rotated frame. Numbers and labels of the same criterion have different matrices.
- Centre icons: `translate(…)` on the icon group, plus a `matrix(…)` on each icon path.
- Legend: the original Affinity export with nested transforms. The generator never edits the legend; it only keeps or removes it. Its ids and texts are cleaned (unique English ids, plain text without letter-split `<tspan>`s or ligature characters).

**Geometry**:

- **Chart centre**: `(1240.157, 1472.634)`.
- **24 positions** of 15° each, numbered clockwise from 12 o'clock. Position *p* spans `p·15°` to `(p+1)·15°`. In the template, criterion *n* sits at position *n−1*.
- Wedges and rings are annular sectors (`M … A … L … A … Z`) with a white 4 px stroke. Moving a criterion means rotating its paths about the centre.
- **Text**: all text uses `text-anchor: start` with an explicit x computed from the measured width, because that's how Affinity exports and imports text reliably. In the text's local frame: label x = `1658.0` (right half, reads outward) or `2371.8 − width` (left half, reads inward, ending at the same radius); number x = `1684.45 − width/2` (centred). Widths are measured in the browser (§7), which also covers labels replaced from the CSV.

**Finding the parts**: the generator looks up parts by the ids above (`C01` … `C24`, `C01-wedge`, `C01-rating1` … `C01-rating5`, `C01-number`, `C01-label`, `Centre-…`, `Legend`). Category groups are taken as the children of `#Diagram`, never by a document-wide id lookup.

### 6.1 Categories and colours

| Category | Slug / id | Criteria | Wedge fill (level 0) | Ring levels 1 → 5 |
|---|---|---|---|---|
| Impact | `impact` / `Impact` | 1–5 | `rgb(240,217,236)` | `224,179,217` · `209,140,198` · `193,102,179` · `178,63,160` · `162,25,141` |
| Governance | `governance` / `Governance` | 6–9 | `rgb(255,244,213)` | `254,233,170` · `254,222,128` · `253,212,85` · `253,201,43` · `252,190,0` |
| Social Sustainability | `social-sustainability` / `Social-Sustainability` | 10–20 | `rgb(213,233,240)` | `170,211,225` · `128,189,209` · `85,167,194` · `43,145,178` · `0,123,163` |
| Environmental Sustainability | `environmental-sustainability` / `Environmental-Sustainability` | 21–22 | `rgb(244,244,213)` | `233,233,170` · `222,221,128` · `210,210,85` · `199,198,43` · `188,187,0` |
| Economic Sustainability | `economic-sustainability` / `Economic-Sustainability` | 23–24 | `rgb(224,248,241)` | `193,241,226` · `162,235,212` · `130,228,197` · `99,222,183` · `68,215,168` |

- The slug is used for file names (`clusters/<slug>.svg`); the id is the template group id. The category name is the Affinity layer name.
- All shades are evenly spaced: level *L* = wedge colour + (level-5 colour − wedge colour) × *L*/5, rounded. The legend uses the same values.
- Rings above the score are filled `rgb(233,233,233)` (light grey).
- The generator reads the palette from the template's ring fills, so a colour change in the template carries over automatically. The table is for reference and tests.

### 6.2 Criteria

| # | Label (template) | Slug (file name) | Category |
|---|---|---|---|
| 1 | Objective & realisation | `01-objective-realisation` | Impact |
| 2 | Impact achievements | `02-impact-achievements` | Impact |
| 3 | Relevance of impact achievements | `03-relevance-of-impact-achievements` | Impact |
| 4 | Potential harm & mitigation | `04-potential-harm-mitigation` | Impact |
| 5 | Harm-management | `05-harm-management` | Impact |
| 6 | Necessity & proportionality | `06-necessity-proportionality` | Governance |
| 7 | Accountability | `07-accountability` | Governance |
| 8 | Decision process & design | `08-decision-process-design` | Governance |
| 9 | Inclusion, participation & co-design | `09-inclusion-participation-co-design` | Governance |
| 10 | IT security | `10-it-security` | Social Sustainability |
| 11 | Sovereignty & power relations | `11-sovereignty-power-relations` | Social Sustainability |
| 12 | Accessibility | `12-accessibility` | Social Sustainability |
| 13 | Non-discrimination | `13-non-discrimination` | Social Sustainability |
| 14 | Data protection | `14-data-protection` | Social Sustainability |
| 15 | Human oversight | `15-human-oversight` | Social Sustainability |
| 16 | Self-determined use | `16-self-determined-use` | Social Sustainability |
| 17 | AI literacy | `17-ai-literacy` | Social Sustainability |
| 18 | Open for validation & contestation | `18-open-for-validation-contestation` | Social Sustainability |
| 19 | Technical transparency | `19-technical-transparency` | Social Sustainability |
| 20 | User transparency | `20-user-transparency` | Social Sustainability |
| 21 | Complexity, energy & emissions | `21-complexity-energy-emissions` | Environmental Sustainability |
| 22 | Natural resources | `22-natural-resources` | Environmental Sustainability |
| 23 | Model & dataset sharing | `23-model-dataset-sharing` | Economic Sustainability |
| 24 | Future perspectives & collaboration | `24-future-perspectives-collaboration` | Economic Sustainability |

- A `criterion name` in the CSV replaces the label in the graphic and in the layer name, but not in the file name. A criterion's category always comes from the template.
- Slug rule (for reference and tests; the table is authoritative): lowercase, `&` removed, every run of other non-alphanumeric characters → `-`, no leading or trailing `-`, two-digit number prefix.

### 6.3 Scores

| Score | Name (layer name) | Slug (file name) |
|---|---|---|
| 5 | Exemplary | `5-exemplary` |
| 4 | Satisfactory | `4-satisfactory` |
| 3 | Ambivalent | `3-ambivalent` |
| 2 | Weak | `2-weak` |
| 1 | Insufficient | `1-insufficient` |

## 7. Processing

1. **Load** `template/template.svg` with `fetch` and parse it with `DOMParser`. Find the criterion groups, their parts, `Centre` and `Legend` (§6).
2. **Check** the template (a developer safeguard, covered by the tests): 5 category groups under `#Diagram`, 24 criteria, each with a wedge, 5 rings, a number and a label, plus 5 centre sectors and the legend.
3. **Parse and validate the CSV** (§4.2).
4. **Apply scores and names**: for a criterion with score *k*, ring level *L* gets the category colour for level *L* if *L ≤ k*, otherwise grey. If the CSV has a criterion name, replace the label text and the criterion group's layer name.
5. **Order**:
   - Category order (overviews, cluster files, slice files): template order 1 → 24.
   - Score order (score overview, score files): Exemplary → Satisfactory → Ambivalent → Weak → Insufficient, clockwise from 12 o'clock; scores that don't occur are skipped. Inside a score cluster: criterion number ascending.
6. **Place** every criterion at its final angle and orient its text (§7.1).
7. **Separators** (score overview only): a white line (`stroke-width: 18`) from radius 150 to 1190 at every boundary between two score clusters, including the boundary at 12 o'clock. With only one score cluster there are no separators.
8. **Measure text**: render label and number texts in a hidden, attached SVG with the vendored PT Sans, after `document.fonts.ready`, and read `getComputedTextLength()`. Set x as in §6.
9. **Export**: build the documents listed in §5, serialise them with `XMLSerializer`, rasterise PNG/JPG (§5.1), and offer them individually and as a ZIP.

### 7.1 Placement and text orientation

- **Angle convention**: degrees clockwise from 12 o'clock (0° = 12 o'clock, 90° = 3 o'clock, 180° = 6 o'clock, 270° = 9 o'clock).
- **Overviews** start at 0° and run clockwise.
- **Pie position option** for cluster and score files (one setting per run):
  - **Original position** (default): each pie keeps its position from its overview (cluster files: category overview, score files: score overview), so the files can be stacked onto the overview.
  - **Start angle** (e.g. for presentations): each pie is laid out on its own, like a dashboard gauge. The criterion at index *i* (0, 1, 2 … within the cluster) spans `start + i·15°` to `start + (i+1)·15°`. Any whole number 0–359 is accepted; default **270°**, so the Impact pie starts at 9 o'clock and runs over 12 o'clock towards 3 o'clock.
- **Moving a criterion**: rotate its wedge and ring paths about the centre from the template span to the target span. In `*-centre` files the category's centre sector and icon are rotated by the same amount, so they stay under their criteria.
- **Text orientation** (every file, overviews included): take the mid-angle φ of the criterion's span (mod 360).
  - **0° ≤ φ < 180°** (right half): text reads outward, like criterion 1 in the template.
  - **180° ≤ φ < 360°** (left half): text is turned 180° and reads inward, like criterion 13 in the template.
  - So text flips at 12 and 6 o'clock. With a start angle that isn't a multiple of 15°, a criterion can sit across 12 or 6 o'clock; its mid-angle decides the side.
  - Implementation, separately for number and label: take the template transform of criterion 1 (right half) or criterion 13 (left half), rotate it about the centre by φ minus that criterion's template mid-angle (7.5° or 187.5°), and set x as in §6.

## 8. User interface

One page, in English, laid out like an application. The mockup from October 2026 is the visual reference.

**Header bar** (full width):

- left: the HIIG emblem (`assets/hiig-emblem.svg`: the building and the I/O squares from the HIIG logo, without lettering, in one grey `#55555c` so the attention stays on the graphics; links to https://www.hiig.de/en/), title **Impact AI Assessment Wheel**, subtitle "Turn assessment scores into report-ready graphics · v<version>";
- right: icon links, each with a visible tooltip and an `aria-label`:
  - Impact AI project page: https://www.hiig.de/en/project/impact-ai/
  - method documentation on Zenodo, shown as "DOI": https://doi.org/10.5281/zenodo.23186663
  - FAQ: https://www.hiig.de/en/impact-ai-faq/
  - source code: https://github.com/hiig-berlin/impact-ai-assessment
- far right: **Download all (ZIP)**, disabled until a valid CSV is loaded.

**Two columns** below the header. The left column is about 340–420 px wide; the right column takes the rest. On narrow screens they stack, left column first.

Left column:

1. **Scores CSV** card:
   - before loading: drop zone with **Choose file…** and **Use example**;
   - after loading: a status line with the file name, "24 criteria · N scores · K warnings" and **Replace…**;
   - errors and warnings (§4.2) are listed in this card;
   - links to the empty CSV template and the example CSV.
2. **Options** card:
   - pie position: **Original** (default) / **Start angle**, with a number field 0–359° (default 270°) and quick buttons 0° / 90° / 180° / 270° that are only active in "start angle" mode;
   - legend: an on/off switch (default off) and position **Left / Right / Top / Bottom** (default bottom; only active when the switch is on). The switch decides whether the overview preview and the single-file downloads of the overviews show the `-legend` version; the ZIP always has both (§5.2);
   - PNG/JPG size: ×1 (1080 px, default) / ×2 (2160 px) / ×4 (4320 px);
   - formats in the ZIP: SVG, PNG, JPG (all selected by default).
3. Short help, headed "Editing the files": "Open the SVG files in a vector graphics program such as Affinity or Illustrator: the layers are named and the text stays editable. To keep working on a graphic later, save it in the program's own format or as SVG."

Right column, the **preview**:

- **Tabs**: Overviews (2), Clusters (5), Scores (the number that occur), Slices (24), each showing its file count.
- **View switch**: **Gallery** (default) / **Grid**.
  - Gallery: one large preview, with thumbnails of the current tab's files below. Clicking a thumbnail selects it. The toolbar has a file menu and SVG / PNG / JPG download buttons for the selected file.
  - Grid: all files of the current tab as cards (preview, title, path). Clicking a card opens it in the gallery. Above the grid, "Download <group> (<n> files)" downloads the current tab as `rating-pie-YYYY-MM-DD-<group>.zip`, with all variants of its files (legend and centre versions) in the selected ZIP formats.
- **Clusters tab**: a "With centre sector" checkbox switches between `clusters/<category>` and `clusters/<category>-centre`. The full ZIP always has both.
- **Previews** are framed like the PNG files (square, or extended for the legend), with embedded fonts, on a light checkerboard so transparent areas are visible. They update when options change.
- **Empty state** before a CSV is loaded: a placeholder in the preview area, and the downloads disabled.

**Visual style**: contemporary and calm, so the graphics stay the focus (see the mockup).

- light neutral page (`#f5f6f7`) with white panels and soft shadows instead of borders;
- moderate radii for rectangles (12 px panels, 10 px preview stage and tiles, 8 px tracks, 6 px segment thumbs and tabs); buttons, chips, checkboxes, badges and the switch are fully rounded;
- segmented controls (tabs, pie position, legend position, size, view switch) as a light grey track with a white "thumb" for the selected option;
- pill-shaped buttons and format chips; tinted (not solid) selected states;
- the preview on a light dot-grid stage, with a floating bar for the file menu and downloads;
- a sticky, slightly translucent header.

**Typefaces** (both SIL Open Font License, vendored):

- Instrument Sans for headings, the title, buttons, tabs, control labels and other UI elements;
- PT Sans for running text (descriptions, help text, status and validation messages), as in the graphics themselves.

**Colours**: primary colour `#007ba3` (the Social Sustainability level-5 blue) for primary buttons, selected states, the active tab, the legend switch and links; `#00617f` for hover. White text on `#007ba3` has a contrast of 4.8 : 1. The other UI colours are neutral greys.

Accessibility basics: keyboard-usable controls, visible focus, sufficient contrast for UI text. Tabs use the ARIA tab pattern (arrow keys move between tabs), the legend switch is `role="switch"`, and icon-only buttons and links have `aria-label`s.

## 9. Reference data and tests

Sample scores, used as `examples/ratings.csv` and as the regression input:

| Score | Criteria |
|---|---|
| Exemplary (5) | 2, 5, 10, 12, 15, 18, 20, 22, 23 |
| Satisfactory (4) | 3, 8, 17 |
| Ambivalent (3) | 1, 9, 11, 13, 16 |
| Weak (2) | 4, 7, 19, 21 |
| Insufficient (1) | 6, 14, 24 |

Expected score order in the score overview, clockwise from 12 o'clock:
`2, 5, 10, 12, 15, 18, 20, 22, 23 | 3, 8, 17 | 1, 9, 11, 13, 16 | 4, 7, 19, 21 | 6, 14, 24`

**Tests** run in the browser, because the generator needs `DOMParser`, `XMLSerializer` and real text measurement: `tests/index.html` (served locally, §3) runs all tests and shows pass/fail, with no test framework needed. They cover:

- template check (§7 step 2)
- CSV parsing: delimiters, quoting, BOM, Windows-1252, empty rows, duplicates, each validation message in §4.2
- ordering: the expected score order above, gauge placement for start angles 0°, 270° and 7°, text side for each criterion
- legend position: placement of the legend for each side (§5.2), raster framing for each side, legend only in the two `-legend` overview files
- file and layer names against the tables in §6.1–§6.3; unique ids in every output
- **snapshots**: the SVGs generated from `examples/ratings.csv` are compared with `tests/expected/`. The expected files are created once by the first implementation, checked by eye against the hand-checked graphic from October 2026, and committed. Any later change to the output shows up as a diff and is either fixed or approved by replacing the expected file.

## 10. Repository layout

```
index.html
app.js            UI, file handling, downloads, ZIP
pie.js            template parsing, geometry, ordering, SVG export (no UI code)
csv.js            CSV decoding, parsing and validation (pure functions)
raster.js         PNG/JPG rendering incl. font embedding and dpi metadata
names.js          categories, criteria, scores, slugs (the tables in §6.1–§6.3)
style.css
template/template.svg                    cleaned template (generated)
template/ImpactAssessment_Template.svg   original Affinity export (source)
fonts/            PT Sans Regular + Bold (.woff2) for the graphics, Instrument Sans for the UI; OFL licence
assets/           HIIG emblem (hiig-emblem.svg)
examples/ratings.csv
vendor/           ZIP library (e.g. fflate, pinned version) + its licence
tests/            index.html, test modules, expected/ snapshots
tools/            template cleanup (Python + Swift, macOS)
LICENSE
README.md         usage, local development, how to update the built-in template
SPECS.md
```

## 11. Coding standards

- **JavaScript**: modern ES modules (`<script type="module">`), no transpiling, no runtime dependencies besides the vendored ZIP library. Target the current versions of Chrome, Edge, Firefox and Safari.
- **Separation**: `csv.js`, `names.js` and `pie.js` contain no UI code and take data in and give strings or DOM documents out, so they are testable on their own. Only `app.js` touches the page.
- **Constants**: radii, angles, centre, text x positions and colours of grey live in one place (top of `pie.js`), with the values from §6. No magic numbers elsewhere.
- **Deterministic output**: the same input gives byte-identical SVGs: coordinates with 3 decimals, matrices with 6 (as in the template), stable element and attribute order. This keeps the snapshot tests meaningful.
- **Safety**: CSV text is inserted only via `textContent` / `setAttribute`, never via `innerHTML` or string concatenation into markup.
- **Naming**: camelCase for JS identifiers, kebab-case for files and slugs, ids in the template as listed in §6.
- **Errors**: user-facing problems (CSV) become validation messages; template problems throw with a clear developer message. No silent failures.
- **Style**: 2-space indentation, semicolons, single quotes; short comments where the geometry isn't obvious. A Prettier config is committed for consistency; no CI build step.
- **Vendored files**: pinned version and licence noted in `vendor/README.md`.

## 12. Acceptance criteria

- Opening the GitHub Pages URL and dropping `examples/ratings.csv` produces:
  - an overview in category order with the centre pie, and
  - an overview in score order matching §9, with a blank centre and separators,
  - both with white outlines, no stray shapes and readable labels on both halves.
- All snapshot tests in `tests/index.html` pass (§9).
- In the "original position" mode, cluster and slice files line up with the category overview and score files with the score overview when stacked in Affinity. In the "start angle" mode with 270°, the Impact cluster file starts at 9 o'clock and runs clockwise over the top; the same goes for every cluster and score file.
- For any start angle, all labels and numbers are upright (right half reading outward, left half reading inward).
- A criterion name in the CSV replaces the label in all outputs, positioned correctly on both halves; file names don't change.
- All SVGs open in Affinity with named layers and editable text in PT Sans.
- PNG and JPG files are square without legend, and A4 portrait (legend top/bottom) or 16:9 landscape (legend left/right) with legend (§5.1, §5.2), and show PT Sans correctly, also on a computer without PT Sans installed.
- With the legend at left, right, top or bottom, the overview `-legend` files show the legend on that side, next to a pie of unchanged size; the bottom SVG matches version 1.
- The page works as described in §8: header links and ZIP button, CSV and options on the left, preview with tabs, gallery and grid views on the right; it stacks on a phone-width screen.
- Every file can be downloaded individually and as part of the ZIP.
- Invalid CSVs (missing criterion, score `6`, score `4.5`, score `Good`) show a clear error with the row number and produce no download. Empty rows and duplicate rows don't block output.
- Works in current Chrome, Edge, Firefox and Safari without installation.
