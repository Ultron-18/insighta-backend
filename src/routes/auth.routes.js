const express = require('express');
const router = express.Router();
const { githubLogin, githubCallback, refreshToken, logout, cliCallback, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
router.get('/github', githubLogin);
router.get('/github/callback', githubCallback);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/cli/callback', cliCallback);  
router.get('/me', authenticate, getMe);



module.exports = router;