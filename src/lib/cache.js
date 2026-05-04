const NodeCache = require('node-cache');

// Cache with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const getOrSet = async (key, fetchFn) => {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const data = await fetchFn();
  cache.set(key, data);
  return data;
};

const invalidate = (pattern) => {
  const keys = cache.keys();
  keys.forEach(key => {
    if (key.startsWith(pattern)) {
      cache.del(key);
    }
  });
};

module.exports = { cache, getOrSet, invalidate };