const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../lib/prisma');

// Redirect to GitHub OAuth
const githubLogin = (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: 'read:user user:email',
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
};

// Handle GitHub callback
const githubCallback = async (req, res) => {
  const { code } = req.query;

  try {
    // Exchange code for access token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    const githubAccessToken = tokenRes.data.access_token;

    // Get user info from GitHub
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubAccessToken}` },
    });

    const { id, login, email, avatar_url } = userRes.data;

    // Create or update user in database
    const user = await prisma.user.upsert({
      where: { github_id: String(id) },
      update: { username: login, email, avatar_url, last_login_at: new Date() },
      create: {
        github_id: String(id),
        username: login,
        email,
        avatar_url,
        role: 'analyst',
        last_login_at: new Date(),
      },
    });

    // Issue tokens
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user_id: user.id,
        expires_at: expiresAt,
      },
    });

    res.json({
      status: 'success',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        username: user.username,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Authentication failed' });
  }
};

// Refresh tokens
const refreshToken = async (req, res) => {
  const { refresh_token } = req.body;

  try {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: { user: true },
    });

    if (!stored || stored.expires_at < new Date()) {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired refresh token' });
    }

    // Delete old token
    await prisma.refreshToken.delete({ where: { token: refresh_token } });

    // Issue new tokens
    const accessToken = jwt.sign(
      { userId: stored.user.id, role: stored.user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    const newRefreshToken = uuidv4();
    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        user_id: stored.user.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    res.json({
      status: 'success',
      access_token: accessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Token refresh failed' });
  }
};

// Logout
const logout = async (req, res) => {
  const { refresh_token } = req.body;

  try {
    await prisma.refreshToken.delete({ where: { token: refresh_token } });
    res.json({ status: 'success', message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Logout failed' });
  }
};

const cliCallback = async (req, res) => {
  const { code } = req.body;

  try {
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: 'http://localhost:9876/callback',
      },
      { headers: { Accept: 'application/json' } }
    );

    const githubAccessToken = tokenRes.data.access_token;

    if (!githubAccessToken) {
      return res.status(400).json({ status: 'error', message: 'Failed to get GitHub token' });
    }

    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubAccessToken}` },
    });

    const { id, login, email, avatar_url } = userRes.data;

    const user = await prisma.user.upsert({
      where: { github_id: String(id) },
      update: { username: login, email, avatar_url, last_login_at: new Date() },
      create: {
        github_id: String(id),
        username: login,
        email,
        avatar_url,
        role: 'analyst',
        last_login_at: new Date(),
      },
    });

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    const newRefreshToken = uuidv4();
    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    res.json({
      status: 'success',
      access_token: accessToken,
      refresh_token: newRefreshToken,
      user: { username: user.username, role: user.role },
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ status: 'error', message: 'CLI authentication failed' });
  }
};

module.exports = { githubLogin, githubCallback, refreshToken, logout, cliCallback };
