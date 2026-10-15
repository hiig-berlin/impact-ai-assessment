# Rating Pie Generator – Specification

A small static website that turns a CSV of criterion scores into the report's radial "24 criteria" diagram, clustered by category (colour) and by score, and exports the diagram plus its individual pie pieces as SVG, PNG and JPG files ready for Affinity and the report.

Status: starting point for implementation. All decisions so far are listed in §10.

---

## 1. Goals

- Produce the report graphic from a CSV in a few clicks, without manual editing in Affinity.
- Run entirely in the browser: no installation, no server, no uploads. It works on any standard Windows or Mac computer.
- Output files are provided as PNG, JPG and SVG. The SVG files open in Affinity as editable vector documents with meaningful layer names.

### Non-goals

- Generating native Affinity files (`.af` / `.afdesign`). The format is closed and undocumented. Users open the SVG in Affinity and save it as `.af` if needed.
- Uploading a template. The design is built into the site (§4.1); the CSV is the only input.
- Accounts, storage or collaboration features.

### Long-term goals (not in scope for the first version)

- Editing the design (fonts, colours, labels) in the tool. Until then, the design lives in the built-in template and is changed in the repository.

## 2. Users and usage

- A handful of people, creating graphics for a report every couple of weeks.
- Flow: open the page → drop in the CSV → check the preview → download single files or all files as a ZIP.
- PT Sans is installed on the users' computers, so text renders correctly when the SVGs are opened in Affinity.

## 3. Hosting

- Public GitHub repository, published with **GitHub Pages** straight from the repository, with no build step.
- Plain HTML, CSS and JavaScript. No framework or bundler is needed. Libraries (e.g. for ZIP creation) and the PT Sans font files (SIL Open Font License) are committed to the repo (vendored), not loaded from a CDN, so the tool keeps working long-term.
- Expected usage is far below GitHub Pages limits (1 GB site size, 100 GB/month soft traffic limit, 10 builds/hour soft limit, which only applies to pushes). Using the page doesn't trigger builds; all processing happens in the browser.

## 4. Inputs

### 4.1 Built-in template

- The design is the cleaned template `ImpactAssessment_Template_clean.svg`, committed to the repo as `template/template.svg` and loaded automatically. Users never upload or re-import a template.
- Design changes (e.g. new colours) are made by replacing `template/template.svg` in the repository, keeping the structure in §6.

### 4.2 Scores CSV

```
criterion number;criterion name;score
1;Objective & realisation;3
2;Impact achievements;5
3;Relevance of impact achievements;4
...
24;Future perspectives & collaboration;5
```

- **Header row** required. The column names `criterion number`, `criterion name` and `score` are matched case-insensitively. Other columns (e.g. `comment`) are ignored.
- **Delimiter**: auto-detect `;` (German Excel) or `,`. Also accept tab.
- **Encoding**: UTF-8, with or without BOM. Also try Windows-1252 if UTF-8 decoding fails (Excel exports).
- **criterion number**: integer 1–24 (the number shown on the diagram).
- **criterion name**: optional. If present and not empty, it replaces the template's label in the graphic. If empty or missing, the template's label is used (§6.2).
- **score**: number 1–5 or name (case-insensitive):

  | Value | Name |
  |---|---|
  | 5 | Exemplary |
  | 4 | Satisfactory |
  | 3 | Ambivalent |
  | 2 | Weak |
  | 1 | Insufficient |

- **Validation** (show clear messages and don't generate output on errors):
  - every criterion 1–24 present exactly once
  - unknown criterion numbers
  - invalid scores (with row number)
  - warning (not an error) if a criterion name is so long that it would run past the wedge (longer than ≈ 700 px at the label font size)
- The repo includes `examples/ratings.csv` with the sample scores (see §9). The page offers it for download, together with an empty CSV template that already contains the 24 criterion numbers and names.

## 5. Outputs

Every file can be downloaded individually, or all together as **one ZIP** (e.g. `rating-pie_YYYY-MM-DD.zip`). Each SVG is also available as PNG and JPG (§5.1).

```
overview.svg                         full diagram, ordered by category, with centre pie
overview-legend.svg                  same, incl. legend
overview-scores.svg                  full diagram, ordered by score, blank centre
overview-scores-legend.svg           same, incl. legend
clusters/impact.svg                  one file per category, without centre sector
clusters/impact-centre.svg           same, with the category's centre sector and icon
clusters/governance.svg
clusters/governance-centre.svg
...
scores/rating-5-Exemplary.svg        one file per non-empty score
scores/rating-4-Satisfactory.svg
...
slices/01_Objective-realisation.svg  one file per criterion
...
ratings.csv                          the input, for traceability
```

- **Overview**: the diagram in its original category order (criterion *n* at position *n−1*), with wedges, rating rings, numbers, labels and the **category pie with icons** in the centre. No legend.
- **Overview-legend**: same as overview, with the legend included.
- **Overview-scores**: the diagram clustered by score (§7.4), with a **blank centre** (categories are mixed, so the category pie would be misleading) and white separator lines between score clusters. With and without legend.
- **Cluster files**: only the pieces (wedge, rating rings, number, label) of one category, either in its overview position or as an individual pie starting at the start angle (option, §7.1). No legend. Two versions per category: without centre (`impact.svg`) and with that category's centre sector and icon (`impact-centre.svg`).
- **Score files**: only the pieces of one score, either in its score-overview position or as an individual pie starting at the start angle (option, §7.1). No centre, no legend.
- **Slice files**: only one criterion's pieces, in its overview position (category order), so they can be laid onto the overview.
- **Alignment**: all cluster, score and slice files use the **same viewBox** (a square crop around the chart centre, ≈ 2400 × 2400), so every pie has the same centre and size. In the "original position" mode, cluster and slice files line up exactly with the category overview, and score files with the score overview, when stacked in Affinity. In the "start angle" mode, cluster and score files are standalone pies (§7.1); slice files always keep their overview position. The overviews keep the template's full A4 page.
- **Affinity layer names**: every generated group gets an `affinity:id` attribute (namespace `https://www.affinity.studio/`), which Affinity shows as the layer name:
  - cluster groups: `Impact`, `Governance`, … in category order, `Exemplary`, `Satisfactory`, … in score order
  - criterion groups: `07 Accountability`, containing `Wedge`, `Rating 1` … `Rating 5`, `Number`, `Label`
- **Preview**: the page shows both overviews before download.

### 5.1 PNG and JPG

- Rendered in the browser from the SVG (SVG → `<img>` → `<canvas>` → `toBlob`).
- Size: **1920 × 1080 px at 72 dpi** by default, with **×2 (3840 × 2160)** and **×4 (7680 × 4320)** as options. The SVGs stay resolution-independent for print.
- Framing: the raster uses the content, not the A4 page: the chart (plus legend in the `-legend` files) is scaled to fit inside the 16:9 frame with a margin of 5 % and centred. All cropped files (clusters, scores, slices) use the same scale and position, so every pie has the same size and centre in the images.
- The 72 dpi value is written into the file metadata (PNG `pHYs` chunk, JPEG JFIF density), since `canvas.toBlob` doesn't set it.
- PNG has a transparent background, JPG a white one (quality 0.92).
- Fonts: an SVG drawn into a canvas can't use the page's web fonts. Before rasterising, embed the vendored PT Sans Regular and Bold as base64 `@font-face` in the SVG's `<style>`, so PNG/JPG text is correct even on computers without PT Sans. The SVG downloads themselves don't embed the font, so Affinity uses the installed PT Sans.

## 6. Template structure (`template/template.svg`)

The template was cleaned up and rebuilt in October 2026: every shape has exact geometry with no overlaps, all coordinates are absolute (no nested transforms), there are no embedded bitmaps, the outlines are white, and the colour shades are evenly spaced. All rings are coloured in the template ("everything Exemplary"), so it carries the full palette.

Canvas: `viewBox="0 0 2481 3508"` (A4 at 300 dpi). Layer structure (Affinity layer names in brackets):

```
Legende                         legend (bottom right), only in the *-legend files
Diagram  [Diagram]
├─ Impact  [Impact]             one group per category, in category order
│  ├─ C01  [01 Objective & realisation]
│  │  ├─ C01-wedge    [Wedge]      category background, r 156 → 870
│  │  ├─ C01-rating1  [Rating 1]   r 890 → 949.2
│  │  ├─ …                         five rings of equal width (59.2)
│  │  ├─ C01-rating5  [Rating 5]   r 1126.8 → 1186
│  │  ├─ C01-number   [Number]     PT Sans Bold 37.5
│  │  └─ C01-label    [Label]      PT Sans 41.667
│  └─ C02 … C05
├─ Governance  (C06–C09)
├─ Social-Sustainability  (C10–C20)
├─ Environmental-Sustainability  (C21–C22)
└─ Economic-Sustainability  (C23–C24)
Centre  [Centre]                category pie, r 0 → 148
├─ Centre-Impact  [Impact]      Sector (0°–75°) + Icon
├─ Centre-Governance            Sector (75°–135°) + Icon
├─ Centre-Social-Sustainability Sector (135°–300°) + Icon
├─ Centre-Environmental-…       Sector (300°–330°) + Icon
└─ Centre-Economic-…            Sector (330°–360°) + Icon
```

The centre sectors use the level-5 colour of each category, with the icons centred in their sector at radius 102.

Geometry:

- **Chart centre**: `(1240.157, 1472.634)`.
- **24 positions** of 15° each, numbered clockwise from 12 o'clock. Position *p* spans `p·15°` to `(p+1)·15°`. In the template, criterion *n* sits at position *n−1*.
- Wedges and rings are annular sectors (`M … A … L … A … Z`) in absolute coordinates, with a white 4 px stroke. Moving a criterion = rotating its paths by `Δ` about the centre.
- **Text**: the right half (positions 0–11) reads outward, starting 161 px from the centre. The left half (positions 12–23) is turned 180° and reads inward, ending at the same radius. Numbers are centred on their position. All text uses `text-anchor: start` with explicit x positions computed from the measured width, because that's how Affinity exports and imports text reliably. The generator measures widths in the browser (`getComputedTextLength()` with the vendored PT Sans), which also covers labels replaced from the CSV.
- **Finding the parts**: the generator relies on the ids in the built-in template (`C01` … `C24`, `C01-wedge`, `C01-rating1` … `C01-rating5`, `C01-number`, `C01-label`, `Centre-…`). If the template is ever edited and re-exported from Affinity, Affinity regenerates the ids from the layer names. Restore them before committing, or regenerate the template (§11, `tools/`).

### 6.1 Categories and colours

Category comes from the category group a criterion sits in. Colours of the template:

| Category | Criteria | Wedge fill (level 0) | Ring levels 1 → 5 |
|---|---|---|---|
| Impact | 1–5 | `rgb(240,217,236)` | `224,179,217` · `209,140,198` · `193,102,179` · `178,63,160` · `162,25,141` |
| Governance | 6–9 | `rgb(255,244,213)` | `254,233,170` · `254,222,128` · `253,212,85` · `253,201,43` · `252,190,0` |
| Social Sustainability | 10–20 | `rgb(213,233,240)` | `170,211,225` · `128,189,209` · `85,167,194` · `43,145,178` · `0,123,163` |
| Environmental Sustainability | 21–22 | `rgb(244,244,213)` | `233,233,170` · `222,221,128` · `210,210,85` · `199,198,43` · `188,187,0` |
| Economic Sustainability | 23–24 | `rgb(224,248,241)` | `193,241,226` · `162,235,212` · `130,228,197` · `99,222,183` · `68,215,168` |

- All shades are evenly spaced: level *L* = wedge colour + (level-5 colour − wedge colour) × *L*/5, rounded. The legend uses the same values.
- Rings above the score are filled `rgb(233,233,233)` (light grey).
- The generator reads the palette from the template's ring fills, so a colour change in the template carries over automatically. The table is for reference and tests.

### 6.2 Criteria

| # | Label | Category |
|---|---|---|
| 1 | Objective & realisation | Impact |
| 2 | Impact achievements | Impact |
| 3 | Relevance of impact achievements | Impact |
| 4 | Potential harm & mitigation | Impact |
| 5 | Harm-management | Impact |
| 6 | Necessity & proportionality | Governance |
| 7 | Accountability | Governance |
| 8 | Decision process & design | Governance |
| 9 | Inclusion, participation & co-design | Governance |
| 10 | IT security | Social |
| 11 | Sovereignty & power relations | Social |
| 12 | Accessibility | Social |
| 13 | Non-discrimination | Social |
| 14 | Data protection | Social |
| 15 | Human oversight | Social |
| 16 | Self-determined use | Social |
| 17 | AI literacy | Social |
| 18 | Open for validation & contestation | Social |
| 19 | Technical transparency | Social |
| 20 | User transparency | Social |
| 21 | Complexity, energy & emissions | Environmental |
| 22 | Natural resources | Environmental |
| 23 | Model & dataset sharing | Economic |
| 24 | Future perspectives & collaboration | Economic |

These are the template's labels. A `criterion name` in the CSV replaces them (§4.2). A criterion's category always comes from the template.

## 7. Processing

1. **Load** `template/template.svg` with `fetch` and parse it with `DOMParser`. Find the 24 criterion groups, their parts and the `Centre` layer (§6).
2. **Check** the template (a developer safeguard, covered by the tests): 24 criteria, each with a wedge, 5 rings, a number and a label, plus 5 centre sectors.
3. **Parse and validate the CSV** (§4.2).
4. **Apply scores and names**: for a criterion with score *k*, ring level *L* gets the category colour for level *L* if *L ≤ k*, otherwise grey. If the CSV has a criterion name, replace the label text and recompute its x position from the measured width.
5. **Category order** (overview, cluster files, slices): criteria keep their template order (1 → 24); the `Centre` layer is kept and turns with the diagram.
6. **Score order** (overview-scores, score files):
   - Exemplary → Satisfactory → Ambivalent → Weak → Insufficient, clockwise from 12 o'clock. Empty scores are skipped.
   - Inside a score cluster: original criterion number ascending.
   - Remove the `Centre` layer.
   - Separators: a white line (`stroke-width: 18`) at each cluster boundary, from radius 150 to 1190.
7. **Place** every criterion at its final angle: overviews from 12 o'clock, individual cluster and score pies from the start angle (§7.1), with text oriented as in §7.1.
8. **Export**: build the documents listed in §5, serialise them with `XMLSerializer`, rasterise PNG/JPG (§5.1), and offer them individually and as a ZIP.

### 7.1 Start angle of the individual pies, and text orientation

- **Overviews are fixed**: both overviews (category and score order) always start at **12 o'clock** and run clockwise, as in the template.
- **Pie position option** for the individual pies (cluster files and score files):
  - **Original position** (default): each pie keeps its position from the overview it belongs to (cluster files: category overview, score files: score overview), so the files can be stacked onto the overview.
  - **Start angle** (e.g. for presentations): each pie is laid out on its own, like a dashboard gauge. Its first criterion starts at the **start angle** and the rest follow clockwise. With the default **270°**, the Impact pie starts at 9 o'clock and runs up to 12 o'clock and on towards 3 o'clock.
- **Angle convention**: degrees clockwise from 12 o'clock (0° = 12 o'clock, 90° = 3 o'clock, 180° = 6 o'clock, 270° = 9 o'clock). Any whole number 0–359 is accepted. One setting applies to all cluster and score files of a run, and is only used in the "start angle" mode.
- **Slice files** keep their overview position, so they can still be laid onto the overview.
- **Placement** in the "start angle" mode: the criterion at index *i* (0, 1, 2 … within that cluster) spans `start + i·15°` to `start + (i+1)·15°`. Wedge and ring paths are rotated about the centre from their template angle to that span. In `*-centre` files the category's centre sector and icon are rotated by the same amount, so they still sit under their criteria.
- **Text orientation**, to keep labels and numbers readable (applies to every file, overviews included): take the mid-angle φ of the criterion's span (mod 360).
  - **0° ≤ φ < 180°** (right half): text reads outward from the centre, like criterion 1 in the template.
  - **180° ≤ φ < 360°** (left half): text is turned 180° and reads inward, ending at the same distance from the centre, like criterion 13 in the template.
  - So text flips at **0°** (12 o'clock) and **180°** (6 o'clock). In a gauge starting at 270°, the labels left of 12 o'clock read inward and those right of it read outward.
  - Implementation: take the template text transform of criterion 1 (right half) or criterion 13 (left half), rotate it about the centre from that criterion's template mid-angle to φ, and set x from the measured text width (§6). Numbers are handled the same way and stay centred.
- With a start angle that isn't a multiple of 15°, a criterion can sit across 12 or 6 o'clock; its mid-angle decides the side.

## 8. User interface

One page, in English:

- drop zone / file picker for the CSV
- live preview of both overviews (category order and score order) and of one individual pie
- validation messages and warnings
- list of all output files, each with SVG / PNG / JPG download buttons
- **Download all (ZIP)** button, with a choice of formats (SVG, PNG, JPG; all selected by default)
- raster size option: 1920 × 1080 (default), ×2, ×4
- position of the individual pies (cluster and score files): **original position** (default) / **start angle**
- start angle, enabled in the "start angle" mode: number field 0–359° (default 270°) with quick buttons 0° / 90° / 180° / 270°, and a preview of one individual pie (e.g. Impact) that updates live
- links: example CSV, empty CSV template, short instructions ("open the SVG in Affinity → save as .af")

Accessibility basics: keyboard-usable controls, visible focus, sufficient contrast for UI text.

## 9. Reference data (sample report)

Sample scores, used as `examples/ratings.csv` and as a regression test (the output must match the hand-checked graphic from October 2026):

| Score | Criteria |
|---|---|
| Exemplary (5) | 2, 4, 5, 6, 10, 12, 14, 15, 18, 20, 21, 22, 23, 24 |
| Satisfactory (4) | 3, 8, 17, 19 |
| Ambivalent (3) | 1, 9, 11, 13, 16 |
| Weak (2) | 7 |
| Insufficient (1) | – |

Expected score order in the score overview, clockwise from 12 o'clock:
`2, 4, 5, 6, 10, 12, 14, 15, 18, 20, 21, 22, 23, 24 | 3, 8, 17, 19 | 1, 9, 11, 13, 16 | 7`

The clustering and template cleanup were prototyped in Python; the approach is what §6–§7 describe.

## 10. Open decisions

No open decisions at the moment.

Decided: overviews start at 12 o'clock; cluster and score files can keep their overview position (default) or be laid out as standalone gauge-style pies with a start-angle setting (compass degrees, clockwise from 12 o'clock, default 270° = 9 o'clock); text flips at 0° and 180°; slice files keep their overview position; both overviews (category order and score order) are generated, each with and without legend; cluster files come in two versions, with and without centre sector; PNG/JPG at 1920 × 1080 px, 72 dpi, with ×2 and ×4 options; both orders are always generated; inside a cluster, criteria keep their original number order; single-criterion files are always generated; no legend in cluster, score and slice files; page language English; no template upload.

## 11. Repository layout (proposal)

```
index.html
app.js            UI, file handling, downloads, ZIP
pie.js            template parsing, geometry, ordering, SVG export (no DOM UI code)
raster.js         PNG/JPG rendering incl. font embedding
style.css
template/template.svg
fonts/            PT Sans Regular + Bold (.woff2), OFL licence
examples/ratings.csv
vendor/           ZIP library (e.g. fflate, pinned version)
tests/            regression test using examples/ratings.csv
tools/            script that regenerated the clean template (for future design changes)
README.md         usage + how to update the built-in template
specs.md
```

## 12. Acceptance criteria

- Opening the GitHub Pages URL and dropping `examples/ratings.csv` produces:
  - an overview in category order with the centre pie, and
  - an overview in score order matching §9, with a blank centre and separators,
  - both with white outlines, no stray shapes and readable labels on both halves.
- The score-order overview matches the hand-checked graphic from October 2026 (§9).
- Both overviews start at 12 o'clock. In the "original position" mode, cluster files line up with the category overview and score files with the score overview. In the "start angle" mode with the default 270°, the Impact cluster file starts at 9 o'clock and runs clockwise over the top; the same goes for every cluster and score file.
- For any start angle, all labels and numbers are upright (right half reading outward, left half reading inward).
- A criterion name in the CSV replaces the label in all outputs, positioned correctly on both halves.
- Slice files line up exactly with the category overview when stacked in Affinity.
- All SVGs open in Affinity with named layers and editable text in PT Sans.
- PNG and JPG files show PT Sans correctly, also on a computer without PT Sans installed.
- Every file can be downloaded individually and as part of the ZIP.
- Invalid CSVs (missing criterion, score 6, unknown name) show a clear error and produce no download.
- Works in current Chrome, Edge, Firefox and Safari without installation, and without a network connection once the page is loaded.
