const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const {
  getProfiles,
  getProfileById,
  createProfile,
  searchProfiles,
  exportProfiles,
} = require('../controllers/profile.controller');

router.get('/', getProfiles);
router.get('/search', searchProfiles);
router.get('/export', exportProfiles);
router.get('/:id', getProfileById);
router.post('/', requireAdmin, createProfile);

module.exports = router;