/**
 * India GeoJSON States Boundary Service
 * Official Simplified GeoJSON for all Indian States & Union Territories
 */
import indiaStatesSimplified from '../data/india-states-simplified.json';

export async function fetchIndiaStatesGeoJson(): Promise<any> {
  return indiaStatesSimplified;
}

/**
 * Normalizes state name strings from GeoJSON feature properties to match app state names
 */
export function normalizeStateName(rawName: string): string {
  if (!rawName) return '';
  const clean = rawName.trim();
  
  // Specific mappings for common naming differences
  const map: Record<string, string> = {
    'NCT of Delhi': 'Delhi-NCR',
    'Delhi': 'Delhi-NCR',
    'National Capital Territory of Delhi': 'Delhi-NCR',
    'Andaman & Nicobar Island': 'Andaman & Nicobar',
    'Andaman and Nicobar Islands': 'Andaman & Nicobar',
    'Dadra and Nagar Haveli and Daman and Diu': 'Dadra & Nagar Haveli and Daman & Diu',
    'Dadra and Nagar Haveli': 'Dadra & Nagar Haveli and Daman & Diu',
    'Daman and Diu': 'Dadra & Nagar Haveli and Daman & Diu',
    'Jammu and Kashmir': 'Jammu & Kashmir',
    'Jammu & Kashmir': 'Jammu & Kashmir',
    'Orissa': 'Odisha',
    'Pondicherry': 'Puducherry',
    'Uttaranchal': 'Uttarakhand',
    'Telengana': 'Telangana'
  };

  if (map[clean]) return map[clean];

  // Fuzzy check
  const lower = clean.toLowerCase();
  if (lower.includes('delhi')) return 'Delhi-NCR';
  if (lower.includes('andaman')) return 'Andaman & Nicobar';
  if (lower.includes('dadra') || lower.includes('daman')) return 'Dadra & Nagar Haveli and Daman & Diu';
  if (lower.includes('jammu')) return 'Jammu & Kashmir';
  if (lower.includes('odisha') || lower.includes('orissa')) return 'Odisha';
  if (lower.includes('puducherry') || lower.includes('pondicherry')) return 'Puducherry';
  if (lower.includes('uttarakhand') || lower.includes('uttaranchal')) return 'Uttarakhand';

  return clean;
}

/**
 * List of dense/small states and UTs that should be clustered at low zoom levels (< zoom 6)
 */
export const SMALL_NORTHEAST_STATES = [
  'Sikkim',
  'Meghalaya',
  'Tripura',
  'Mizoram',
  'Manipur',
  'Nagaland'
];

export const SMALL_UTS = [
  'Delhi-NCR',
  'Chandigarh',
  'Goa',
  'Puducherry',
  'Dadra & Nagar Haveli and Daman & Diu'
];

export const ALL_COMPACT_ZOOM_FILTERED_STATES = [
  ...SMALL_NORTHEAST_STATES,
  ...SMALL_UTS
];

// Northeast cluster centroid
export const NORTHEAST_CLUSTER_CENTROID: [number, number] = [25.50, 92.90];

// Capital Region cluster centroid
export const NORTH_UT_CLUSTER_CENTROID: [number, number] = [29.20, 77.00];
