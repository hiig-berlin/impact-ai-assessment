// Categories, criteria and scores: the tables in SPECS.md §6.1–§6.3.
// File and layer names always come from here, never from the CSV.

// §6.1. The colours are for reference and tests; the generator reads the
// palette from the template's ring fills.
export const CATEGORIES = [
  {
    name: 'Impact',
    slug: 'impact',
    id: 'Impact',
    first: 1,
    last: 5,
    colours: [
      '240,217,236',
      '224,179,217',
      '209,140,198',
      '193,102,179',
      '178,63,160',
      '162,25,141',
    ],
  },
  {
    name: 'Governance',
    slug: 'governance',
    id: 'Governance',
    first: 6,
    last: 9,
    colours: ['255,244,213', '254,233,170', '254,222,128', '253,212,85', '253,201,43', '252,190,0'],
  },
  {
    name: 'Social Sustainability',
    slug: 'social-sustainability',
    id: 'Social-Sustainability',
    first: 10,
    last: 20,
    colours: ['213,233,240', '170,211,225', '128,189,209', '85,167,194', '43,145,178', '0,123,163'],
  },
  {
    name: 'Environmental Sustainability',
    slug: 'environmental-sustainability',
    id: 'Environmental-Sustainability',
    first: 21,
    last: 22,
    colours: ['244,244,213', '233,233,170', '222,221,128', '210,210,85', '199,198,43', '188,187,0'],
  },
  {
    name: 'Economic Sustainability',
    slug: 'economic-sustainability',
    id: 'Economic-Sustainability',
    first: 23,
    last: 24,
    colours: [
      '224,248,241',
      '193,241,226',
      '162,235,212',
      '130,228,197',
      '99,222,183',
      '68,215,168',
    ],
  },
];

// §6.2: [number, template label, file slug]
const CRITERIA_TABLE = [
  [1, 'Objective & realisation', '01-objective-realisation'],
  [2, 'Impact achievements', '02-impact-achievements'],
  [3, 'Relevance of impact achievements', '03-relevance-of-impact-achievements'],
  [4, 'Potential harm & mitigation', '04-potential-harm-mitigation'],
  [5, 'Harm-management', '05-harm-management'],
  [6, 'Necessity & proportionality', '06-necessity-proportionality'],
  [7, 'Accountability', '07-accountability'],
  [8, 'Decision process & design', '08-decision-process-design'],
  [9, 'Inclusion, participation & co-design', '09-inclusion-participation-co-design'],
  [10, 'IT security', '10-it-security'],
  [11, 'Sovereignty & power relations', '11-sovereignty-power-relations'],
  [12, 'Accessibility', '12-accessibility'],
  [13, 'Non-discrimination', '13-non-discrimination'],
  [14, 'Data protection', '14-data-protection'],
  [15, 'Human oversight', '15-human-oversight'],
  [16, 'Self-determined use', '16-self-determined-use'],
  [17, 'AI literacy', '17-ai-literacy'],
  [18, 'Open for validation & contestation', '18-open-for-validation-contestation'],
  [19, 'Technical transparency', '19-technical-transparency'],
  [20, 'User transparency', '20-user-transparency'],
  [21, 'Complexity, energy & emissions', '21-complexity-energy-emissions'],
  [22, 'Natural resources', '22-natural-resources'],
  [23, 'Model & dataset sharing', '23-model-dataset-sharing'],
  [24, 'Future perspectives & collaboration', '24-future-perspectives-collaboration'],
];

export const CRITERIA = CRITERIA_TABLE.map(([number, label, slug]) => ({
  number,
  label,
  slug,
  category: CATEGORIES.find((c) => number >= c.first && number <= c.last),
}));

export const CRITERION_COUNT = CRITERIA.length;

// §6.3, in score order (Exemplary first).
export const SCORES = [
  { score: 5, name: 'Exemplary', slug: '5-exemplary' },
  { score: 4, name: 'Satisfactory', slug: '4-satisfactory' },
  { score: 3, name: 'Ambivalent', slug: '3-ambivalent' },
  { score: 2, name: 'Weak', slug: '2-weak' },
  { score: 1, name: 'Insufficient', slug: '1-insufficient' },
];

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

export function criterion(number) {
  return CRITERIA[number - 1];
}

export function scoreInfo(score) {
  return SCORES.find((s) => s.score === score);
}

export function pad2(number) {
  return String(number).padStart(2, '0');
}

// Slug rule from §6.2 (the table above is authoritative; this is for tests).
export function slugify(number, label) {
  const words = label
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${pad2(number)}-${words}`;
}

// Affinity layer name of a criterion group, e.g. "07 Accountability".
export function criterionLayerName(number, label) {
  return `${pad2(number)} ${label}`;
}

// The template id of a criterion group, e.g. "C07".
export function criterionId(number) {
  return `C${pad2(number)}`;
}
