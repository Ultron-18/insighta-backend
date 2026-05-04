const fs = require('fs');
const csv = require('csv-parser');
const prisma = require('../lib/prisma');
const { invalidate } = require('../lib/cache');

const VALID_GENDERS = ['male', 'female'];
const CHUNK_SIZE = 1000;

const validateRow = (row) => {
  const errors = [];

  if (!row.name || row.name.trim() === '') {
    errors.push('missing_fields');
    return errors;
  }

  if (row.gender && !VALID_GENDERS.includes(row.gender.toLowerCase())) {
    errors.push('invalid_gender');
  }

  if (row.age !== undefined && row.age !== '') {
    const age = parseInt(row.age);
    if (isNaN(age) || age < 0 || age > 150) {
      errors.push('invalid_age');
    }
  }

  return errors;
};

const processChunk = async (chunk, stats) => {
  const names = chunk.map(r => r.name.trim());

  // Check for existing names in bulk
  const existing = await prisma.profile.findMany({
    where: { name: { in: names } },
    select: { name: true },
  });

  const existingNames = new Set(existing.map(p => p.name));

  const toInsert = [];

  for (const row of chunk) {
    const name = row.name.trim();

    if (existingNames.has(name)) {
      stats.skipped++;
      stats.reasons.duplicate_name = (stats.reasons.duplicate_name || 0) + 1;
      continue;
    }

    const age = row.age ? parseInt(row.age) : null;

    toInsert.push({
      name,
      gender: row.gender?.toLowerCase() || null,
      gender_probability: row.gender_probability ? parseFloat(row.gender_probability) : null,
      age,
      age_group: age ? (age < 18 ? 'minor' : age < 60 ? 'adult' : 'senior') : row.age_group || null,
      country_id: row.country_id?.toUpperCase() || null,
      country_name: row.country_name || null,
      country_probability: row.country_probability ? parseFloat(row.country_probability) : null,
    });
  }

  if (toInsert.length > 0) {
    await prisma.profile.createMany({
      data: toInsert,
      skipDuplicates: true,
    });
    stats.inserted += toInsert.length;
  }
};

const ingestCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'CSV file is required' });
  }

  const stats = {
    total_rows: 0,
    inserted: 0,
    skipped: 0,
    reasons: {},
  };

  const chunk = [];

  const stream = fs.createReadStream(req.file.path)
    .pipe(csv());

  stream.on('data', async (row) => {
    stats.total_rows++;

    // Validate row
    const errors = validateRow(row);

    if (errors.length > 0) {
      stats.skipped++;
      errors.forEach(e => {
        stats.reasons[e] = (stats.reasons[e] || 0) + 1;
      });
      return;
    }

    chunk.push(row);

    // Process in chunks
    if (chunk.length >= CHUNK_SIZE) {
      stream.pause();
      const currentChunk = chunk.splice(0, CHUNK_SIZE);
      try {
        await processChunk(currentChunk, stats);
      } catch (err) {
        console.error('Chunk processing error:', err.message);
      }
      stream.resume();
    }
  });

  stream.on('end', async () => {
    // Process remaining rows
    if (chunk.length > 0) {
      try {
        await processChunk(chunk, stats);
      } catch (err) {
        console.error('Final chunk error:', err.message);
      }
    }

    // Clean up uploaded file
    fs.unlink(req.file.path, () => {});

    // Invalidate cache
    invalidate('profiles');
    invalidate('search');

    res.json({
      status: 'success',
      total_rows: stats.total_rows,
      inserted: stats.inserted,
      skipped: stats.skipped,
      reasons: stats.reasons,
    });
  });

  stream.on('error', (err) => {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ status: 'error', message: 'Failed to process CSV file' });
  });
};

module.exports = { ingestCSV };