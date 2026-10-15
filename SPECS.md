# Rating Pie Generator – Specification

A small static website that turns a CSV of criterion ratings into the report's radial "24 criteria" diagram, clustered by rating (or by colour/category), and exports the diagram plus its individual pie pieces as SVG files ready for Affinity.

Status: starting point for implementation. Items marked **[OPEN]** still need a decision; each has a proposed default.

---

## 1. Goals

- Produce the report graphic from a CSV in a few clicks, without manual editing in Affinity.
- Run entirely in the browser: no installation, no server, no uploads. It works on any standard Windows or Mac computer.
- Output files open in Affinity as editable vector documents with meaningful layer names.

### Non-goals

- Generating native Affinity files (`.af` / `.afdesign`). The format is closed and undocumented. Users open the SVG in Affinity and save it as `.af` if needed.
- Editing the design (fonts, colours, labels) in the tool. The design lives in the template SVG and is changed in Affinity.
- Accounts, storage or collaboration features.

## 2. Users and usage

- One or two people, creating graphics for a report every couple of weeks.
- Flow: open the page → drop in the CSV (and optionally a different template SVG) → check the preview → download a ZIP.
- PT Sans is installed on the users' computers, so text renders correctly when the SVGs are opened in Affinity.

## 3. Hosting

- Public GitHub repository, published with **GitHub Pages** straight from the repository, with no build step.
- Plain HTML, CSS and JavaScript. No framework or bundler is needed. If a library is used (e.g. for ZIP creation), it is committed to the repo (vendored), not loaded from a CDN, so the tool keeps working long-term.
- Expected usage is far below GitHub Pages limits (1 GB site size, 100 GB/month soft traffic limit, 10 builds/hour soft limit, which only applies to pushes). Using the page doesn't trigger builds; all processing happens in the browser.

## 4. Inputs

### 4.1 Template SVG

- The default template is the current design (`Larissa.svg`), committed to the repo as `template/template.svg` and loaded automatically.
- Users can optionally drop in a different template SVG (e.g. after design changes in Affinity). It must keep the same group structure (see §6).

### 4.2 Ratings CSV

```
criterion;rating
1;3
2;Exemplary
3;4
...
24;5
```

- **Header row** required. The column names `criterion` and `rating` are matched case-insensitively. Other columns are ignored, so a `name` or `comment` column is allowed.
- **Delimiter**: auto-detect `;` (German Excel) or `,`. Also accept tab.
- **Encoding**: UTF-8, with or without BOM. Also try Windows-1252 if UTF-8 decoding fails (Excel exports).
- **criterion**: integer 1–24 (the number shown on the diagram).
- **rating**: number 1–5 or name (case-insensitive):

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
  - invalid ratings (with row number)
- The repo includes `examples/ratings.csv` with the current ratings (see §9) and a downloadable empty template CSV on the page.

## 5. Outputs

All files are offered as **one ZIP download** (e.g. `rating-pie_YYYY-MM-DD.zip`):

```
overview.svg                         full diagram incl. legend
clusters/rating-5-Exemplary.svg      one file per non-empty cluster
clusters/rating-4-Satisfactory.svg
...
slices/01_Objective-realisation.svg  one file per criterion   [OPEN, see §10]
...
ratings.csv                          the input, for traceability
```

- **Overview**: the reordered diagram with the legend, blank centre, and white separator lines between clusters.
- **Cluster files**: only the pieces (wedge, rating rings, number, label) of that cluster. No legend and no frame ring.
- **Slice files**: only one criterion's pieces.
- **Alignment**: all cluster and slice files use the **same viewBox** (a square crop around the chart centre). Stacked in Affinity, they line up exactly with each other. The overview keeps the template's full page.
- **Affinity layer names**: every generated group gets an `affinity:id` attribute (namespace `https://www.affinity.studio/`), which Affinity shows as the layer name:
  - cluster groups: `Exemplary`, `Satisfactory`, … (or the category name in colour mode)
  - criterion groups: `07 Accountability`, containing `Wedge`, `Rings`, `Number`, `Label`
- **Preview**: the page shows the overview before download.

## 6. Template structure (current `Larissa.svg`)

Canvas: `viewBox="0 0 2481 3508"` (A4 at 300 dpi). Top-level groups:

| Group id | Content | Use |
|---|---|---|
| `Legende` | category/rating legend (bottom right) | keep unchanged in overview |
| `_24-Kriterien` → `Kriterienfarben` | 24 inner wedges, category background colour | rotate per criterion |
| `_24-Kriterien` → `Nummerierung---außen` | 24 criterion numbers (PT Sans Bold 37.5) | regenerate per position |
| `_24-Kriterien` → `Kriterienschrift---mittig` | 24 criterion labels (PT Sans 41.667) | regenerate per position |
| `Bewertungsskala-1` … `-5` | rating ring segments, level 1 (inner) to 5 (outer) | rotate + recolour |
| `_5-Cluster` | centre category pie with icons | **remove** (centre stays blank) |
| `Kriterienrahmen` | white ring between wedges and rating rings | keep |

Geometry:

- **Chart centre** (absolute coordinates): approx. `(1240.157, 1472.634)`. Compute it from the template at runtime rather than hard-coding: take two copies of the same ring segment and find the fixed point of the rotation that maps one onto the other.
- **24 positions** of 15° each, numbered clockwise from 12 o'clock. Position *p* spans `p·15°` to `(p+1)·15°`. In the template, criterion *n* sits at position *n−1*.
- **Assign elements to positions by angle, not by id.** Affinity ids are unreliable (e.g. the wedge `Environmental-Sustainability1` is actually an Impact wedge). Compute each element's centroid in absolute coordinates (applying all ancestor `transform`s) and take its angle around the centre.
- Parent groups only scale and translate uniformly, so a rotation about the centre can be expressed in each group's local coordinates.

### 6.1 Categories and colours

Category is read from the wedge fill in `Kriterienfarben`:

| Category | Criteria | Wedge fill | Ring levels 1 → 5 |
|---|---|---|---|
| Impact | 1–5 | `rgb(240,217,236)` | `224,178,217` · `209,140,198` · `193,102,179` · `178,63,160` · `162,25,141` |
| Governance | 6–9 | `rgb(255,244,213)` | `254,233,170` · `253,223,128` · `253,212,85` · `253,201,43` · `252,190,0` |
| Social Sustainability | 10–20 | `rgb(213,233,240)` | `170,211,224` · `128,189,209` · `85,167,194` · `43,145,178` · `0,123,163` |
| Environmental Sustainability | 21–22 | `rgb(244,244,213)` | `233,232,170` · `222,221,127` · `218,217,113` · `210,210,85` · `188,187,0` |
| Economic Sustainability | 23–24 | `rgb(224,248,241)` | `193,242,226` · `162,235,212` · `130,228,197` · `99,222,183` · `68,215,168` |

Rings above the rating are filled `rgb(233,233,233)` (light grey).

Better: read the ring palette from the template's legend (`Legende`) so colour changes in Affinity carry over automatically. Use the table above as a fallback and for tests.

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

Labels and categories come from the template at runtime. This table is for reference and tests.

## 7. Processing

1. **Parse** the template with `DOMParser`. Compute the centre and assign every wedge, ring segment, number and label to a criterion (§6).
2. **Clean up** the template's known mistakes:
   - remove the overlay shapes whose id contains `niedrigere` (two extra ring pieces on criteria 21 and 23)
   - set the stroke of all wedges and ring segments to white (some have grey strokes)
   - remove `_5-Cluster` (blank centre)
3. **Apply ratings**: for criterion with rating *k*, ring level *L* gets the category colour for level *L* if *L ≤ k*, otherwise grey.
4. **Order**:
   - **By rating** (default): Exemplary → Satisfactory → Ambivalent → Weak → Insufficient, clockwise from 12 o'clock. Empty clusters are skipped.
   - **By colour/category** [OPEN, see §10]: Impact → Governance → Social → Environmental → Economic, sorted by rating (best first) inside each category.
   - Inside a cluster: original criterion number ascending [OPEN, see §10].
5. **Move** each criterion to its new position *p'*:
   - **Wedge and ring segments**: prepend `rotate((p' − p)·15°, centre)` (in the parent group's local coordinates) to the element's transform.
   - **Numbers and labels**: rebuild them from the position-0 template element, rotated by `p'·15°`. Remove `tspan` kerning and keep the plain text.
     - right half (positions 0–11): label `text-anchor: start`, reading outward from the centre
     - left half (positions 12–23): flip by `rotate(180)` about the text's anchor point (baseline − 0.35 × font size) and use `text-anchor: end`, so the text stays upright and still starts at the same distance from the centre
     - numbers use `text-anchor: middle` and the same flip rule
6. **Separators**: a white line (`stroke-width: 18`, in absolute units) at each cluster boundary, from radius ≈ 150 to ≈ 1190.
7. **Export**: build the overview, cluster and slice documents (§5), serialise them with `XMLSerializer`, and zip them.

## 8. User interface

One page, in English (German UI optional):

- drop zone / file picker for the CSV
- optional drop zone for a custom template SVG (default template is preloaded)
- option: cluster by **rating** / **colour (category)** [OPEN, see §10]
- option: include single-criterion files (on/off) [OPEN, see §10]
- live preview of the overview
- validation messages
- **Download ZIP** button
- links: example CSV, empty CSV template, short instructions ("open in Affinity → save as .af")

Accessibility basics: keyboard-usable controls, visible focus, sufficient contrast for UI text.

## 9. Reference data (current report)

Current ratings, use them as `examples/ratings.csv` and as a regression test (the output must match the hand-checked graphic from October 2026):

| Rating | Criteria |
|---|---|
| Exemplary (5) | 2, 4, 5, 6, 10, 12, 14, 15, 18, 20, 21, 22, 23, 24 |
| Satisfactory (4) | 3, 8, 17, 19 |
| Ambivalent (3) | 1, 9, 11, 13, 16 |
| Weak (2) | 7 |
| Insufficient (1) | – |

Expected order by rating, clockwise from 12 o'clock:
`2, 4, 5, 6, 10, 12, 14, 15, 18, 20, 21, 22, 23, 24 | 3, 8, 17, 19 | 1, 9, 11, 13, 16 | 7`

A Python prototype that produced this graphic exists. Its approach is what §6–§7 describe.

## 10. Open decisions

| # | Question | Proposed default |
|---|---|---|
| 1 | Offer both orders (by rating and by colour/category), or only by rating? | Both, with a toggle; rating is the default |
| 2 | Order inside a cluster | Original criterion number ascending |
| 3 | Include single-criterion SVG files? | Yes, as an option that's on by default |
| 4 | Cluster files in colour mode: one per category? | Yes |
| 5 | Should the legend also appear in cluster/slice files? | No |
| 6 | Page language | English |

## 11. Repository layout (proposal)

```
index.html
app.js            UI, file handling, ZIP download
pie.js            template parsing, geometry, reordering, export (no DOM UI code)
style.css
template/template.svg
examples/ratings.csv
vendor/           ZIP library (e.g. fflate or JSZip, pinned version)
tests/            regression test using examples/ratings.csv
README.md         usage + how to update the template
specs.md
```

## 12. Acceptance criteria

- Opening the GitHub Pages URL and dropping `examples/ratings.csv` produces an overview matching §9, with blank centre, white outlines, no stray shapes and readable labels on both halves.
- Cluster and slice files line up exactly when stacked in Affinity.
- All SVGs open in Affinity with named layers and editable text in PT Sans.
- Invalid CSVs (missing criterion, rating 6, unknown name) show a clear error and produce no download.
- Works in current Chrome, Edge, Firefox and Safari without installation, and without a network connection once the page is loaded.
