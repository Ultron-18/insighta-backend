// Normalize natural language query filters into canonical form
const normalizeFilters = (filters) => {
  const normalized = {};

  // Normalize gender
  if (filters.gender) {
    normalized.gender = filters.gender.toLowerCase().trim();
  }

  // Normalize country
  if (filters.country_id) {
    normalized.country_id = filters.country_id.toUpperCase().trim();
  }

  // Normalize age group
  if (filters.age_group) {
    normalized.age_group = filters.age_group.toLowerCase().trim();
  }

  // Normalize age range
  if (filters.age) {
    normalized.age = {};
    if (filters.age.gte !== undefined) normalized.age.gte = parseInt(filters.age.gte);
    if (filters.age.lte !== undefined) normalized.age.lte = parseInt(filters.age.lte);
  }

  // Sort keys alphabetically for consistent cache keys
  return Object.keys(normalized)
    .sort()
    .reduce((acc, key) => {
      acc[key] = normalized[key];
      return acc;
    }, {});
};

// Parse natural language query into filters
const parseNaturalLanguage = (query) => {
  const filters = {};
  const lower = query.toLowerCase().trim();

  // Gender
  if (lower.includes('female') || lower.includes('woman') || lower.includes('women')) {
    filters.gender = 'female';
  } else if (lower.includes('male') || lower.includes('man') || lower.includes('men')) {
    filters.gender = 'male';
  }

  // Countries
  const countryMap = {
    'nigeria': 'NG', 'nigerian': 'NG',
    'ghana': 'GH', 'ghanaian': 'GH',
    'kenya': 'KE', 'kenyan': 'KE',
    'usa': 'US', 'america': 'US', 'american': 'US',
    'uk': 'GB', 'britain': 'GB', 'british': 'GB',
  };

  for (const [keyword, code] of Object.entries(countryMap)) {
    if (lower.includes(keyword)) {
      filters.country_id = code;
      break;
    }
  }

  // Age group
  if (lower.includes('adult')) filters.age_group = 'adult';
  if (lower.includes('minor')) filters.age_group = 'minor';
  if (lower.includes('senior')) filters.age_group = 'senior';

  // Age ranges — "aged 20-45", "between 20 and 45", "20–45"
  const ageRangePatterns = [
    /aged?\s+(\d+)\s*[-–to]+\s*(\d+)/i,
    /between\s+(\d+)\s+and\s+(\d+)/i,
    /(\d+)\s*[-–]\s*(\d+)\s*years?/i,
  ];

  for (const pattern of ageRangePatterns) {
    const match = lower.match(pattern);
    if (match) {
      filters.age = { gte: parseInt(match[1]), lte: parseInt(match[2]) };
      break;
    }
  }

  // Young = under 30
  if (lower.includes('young') && !filters.age) {
    filters.age = { lte: 30 };
  }

  return filters;
};

// Generate deterministic cache key from normalized filters
const generateCacheKey = (prefix, filters, extra = {}) => {
  const normalized = normalizeFilters(filters);
  const combined = { ...normalized, ...extra };
  return `${prefix}:${JSON.stringify(combined)}`;
};

module.exports = { normalizeFilters, parseNaturalLanguage, generateCacheKey };