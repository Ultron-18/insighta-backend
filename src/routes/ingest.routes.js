const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { requireApiVersion } = require('../middleware/apiVersion.middleware');
const { ingestCSV } = require('../controllers/ingest.controller');

// Store uploads temporarily
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname) !== '.csv') {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
});

router.post('/', authenticate, requireApiVersion, requireAdmin, upload.single('file'), ingestCSV);

module.exports = router;