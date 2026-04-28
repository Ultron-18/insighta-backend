const express = require('express');
const router = express.Router();
const { githubLogin, githubCallback, refreshToken, logout, cliCallback } = require('../controllers/auth.controller');

router.get('/github', githubLogin);
router.get('/github/callback', githubCallback);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/cli/callback', cliCallback);

module.exports = router;