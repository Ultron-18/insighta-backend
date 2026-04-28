const prisma = require('../lib/prisma');
const axios = require('axios');

// Helper: fetch profile data from external APIs
const fetchProfileData = async (name) => {
  const [genderRes, ageRes, countryRes] = await Promise.allSettled([
    axios.get(`https://api.genderize.io?name=${name}`),
    axios.get(`https://api.agify.io?name=${name}`),
    axios.get(`https://api.nationalize.io?name=${name}`),
  ]);

  const gender = genderRes.status === 'fulfilled' ? genderRes.value.data : {};
  const age = ageRes.status === 'fulfilled' ? ageRes.value.data : {};
  const country = countryRes.status === 'fulfilled' ? countryRes.value.data : {};

  const topCountry = country.country?.[0] || {};

  return {
    gender: gender.gender || null,
    gender_probability: gender.probability || null,
    age: age.age || null,
    age_group: age.age ? (age.age < 18 ? 'minor' : age.age < 60 ? 'adult' : 'senior') : null,
    country_id: topCountry.country_id || null,
    country_probability: topCountry.probability || null,
  };
};

// GET /api/profiles
const getProfiles = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      gender,
      country,
      age_group,
      min_age,
      max_age,
      sort_by = 'created_at',
      order = 'desc',
    } = req.query;

    const where = {};
    if (gender) where.gender = gender;
    if (country) where.country_id = country;
    if (age_group) where.age_group = age_group;
    if (min_age || max_age) {
      where.age = {};
      if (min_age) where.age.gte = parseInt(min_age);
      if (max_age) where.age.lte = parseInt(max_age);
    }

    const total = await prisma.profile.count({ where });
    const total_pages = Math.ceil(total / limit);
    const profiles = await prisma.profile.findMany({
      where,
      orderBy: { [sort_by]: order },
      skip: (page - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    res.json({
      status: 'success',
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      total_pages,
      links: {
        self: `/api/profiles?page=${page}&limit=${limit}`,
        next: page < total_pages ? `/api/profiles?page=${parseInt(page) + 1}&limit=${limit}` : null,
        prev: page > 1 ? `/api/profiles?page=${parseInt(page) - 1}&limit=${limit}` : null,
      },
      data: profiles,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch profiles' });
  }
};

// GET /api/profiles/:id
const getProfileById = async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: req.params.id },
    });

    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }

    res.json({ status: 'success', data: profile });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch profile' });
  }
};

// POST /api/profiles (admin only)
const createProfile = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ status: 'error', message: 'Name is required' });
    }

    const profileData = await fetchProfileData(name);

    const profile = await prisma.profile.create({
      data: { name, ...profileData },
    });

    res.json({ status: 'success', data: profile });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to create profile' });
  }
};

// GET /api/profiles/search
const searchProfiles = async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ status: 'error', message: 'Search query required' });
    }

    // Natural language parsing
    const where = {};
    const lower = q.toLowerCase();

    if (lower.includes('male') && !lower.includes('female')) where.gender = 'male';
    if (lower.includes('female')) where.gender = 'female';
    if (lower.includes('nigeria') || lower.includes('ng')) where.country_id = 'NG';
    if (lower.includes('adult')) where.age_group = 'adult';
    if (lower.includes('minor')) where.age_group = 'minor';
    if (lower.includes('senior')) where.age_group = 'senior';
    if (lower.includes('young')) where.age = { lte: 30 };

    const total = await prisma.profile.count({ where });
    const total_pages = Math.ceil(total / parseInt(limit));

    const profiles = await prisma.profile.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    res.json({
      status: 'success',
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      total_pages,
      links: {
        self: `/api/profiles/search?q=${q}&page=${page}&limit=${limit}`,
        next: page < total_pages ? `/api/profiles/search?q=${q}&page=${parseInt(page) + 1}&limit=${limit}` : null,
        prev: page > 1 ? `/api/profiles/search?q=${q}&page=${parseInt(page) - 1}&limit=${limit}` : null,
      },
      data: profiles,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Search failed' });
  }
};

// GET /api/profiles/export
const exportProfiles = async (req, res) => {
  try {
    const { gender, country, age_group, min_age, max_age, sort_by = 'created_at', order = 'desc' } = req.query;

    const where = {};
    if (gender) where.gender = gender;
    if (country) where.country_id = country;
    if (age_group) where.age_group = age_group;
    if (min_age || max_age) {
      where.age = {};
      if (min_age) where.age.gte = parseInt(min_age);
      if (max_age) where.age.lte = parseInt(max_age);
    }

    const profiles = await prisma.profile.findMany({
      where,
      orderBy: { [sort_by]: order },
    });

    const headers = ['id', 'name', 'gender', 'gender_probability', 'age', 'age_group', 'country_id', 'country_name', 'country_probability', 'created_at'];
    const rows = profiles.map(p => headers.map(h => p[h] ?? '').join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    const timestamp = Date.now();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="profiles_${timestamp}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Export failed' });
  }
};

module.exports = { getProfiles, getProfileById, createProfile, searchProfiles, exportProfiles };