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

   // Set HTTP-only cookies
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 5 * 60 * 1000,
    });

   // Redirect to web portal dashboard with tokens
    res.redirect(`${process.env.WEB_URL}/dashboard?access_token=${accessToken}&refresh_token=${refreshToken}`);
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Authentication failed' });
  }
};

// Refresh tokens
const refreshToken = async (req, res) => {
  const refresh_token = req.cookies?.refresh_token || req.body?.refresh_token;

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

   res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3 * 60 * 1000,
    });

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 5 * 60 * 1000,
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

const getMe = async (req, res) => {
  res.json({
    status: 'success',
    user: {
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      avatar_url: req.user.avatar_url,
    },
  });
};

const cliCallback = async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ status: 'error', message: 'Missing OAuth code' });
  }

  console.log('[CLI] client_id:', process.env.GITHUB_CLI_CLIENT_ID ? 'set' : 'MISSING');
  console.log('[CLI] client_secret:', process.env.GITHUB_CLI_CLIENT_SECRET ? 'set' : 'MISSING');
  console.log('[CLI] code received:', code.slice(0, 8) + '...');

  // Step 1: Exchange code for GitHub access token
  let githubAccessToken;
  try {
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLI_CLIENT_ID,
        client_secret: process.env.GITHUB_CLI_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    console.log('[CLI] GitHub token response:', JSON.stringify(tokenRes.data));
    githubAccessToken = tokenRes.data.access_token;

    if (!githubAccessToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to get GitHub token',
        detail: tokenRes.data.error_description || tokenRes.data.error || 'No access_token in response',
      });
    }
  } catch (err) {
    console.error('[CLI] Token exchange error:', err.message);
    return res.status(502).json({ status: 'error', message: 'GitHub token exchange failed', detail: err.message });
  }

  // Step 2: Fetch GitHub user info
  let githubUser;
  try {
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubAccessToken}` },
    });
    githubUser = userRes.data;
    console.log('[CLI] GitHub user:', githubUser.login);
  } catch (err) {
    console.error('[CLI] GitHub user fetch error:', err.message);
    return res.status(502).json({ status: 'error', message: 'Failed to fetch GitHub user info', detail: err.message });
  }

  const { id, login, email, avatar_url } = githubUser;

  // Step 3: Upsert user in database
  let user;
  try {
    user = await prisma.user.upsert({
      where: { github_id: String(id) },
      update: { username: login, email: email || null, avatar_url: avatar_url || null, last_login_at: new Date() },
      create: {
        github_id: String(id),
        username: login,
        email: email || null,
        avatar_url: avatar_url || null,
        role: 'analyst',
        last_login_at: new Date(),
      },
    });
  } catch (err) {
    console.error('[CLI] DB upsert error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Database error when saving user', detail: err.message });
  }

  // Step 4: Issue JWT + refresh token
  try {
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

    return res.json({
      status: 'success',
      access_token: accessToken,
      refresh_token: newRefreshToken,
      user: { username: user.username, role: user.role },
    });
  } catch (err) {
    console.error('[CLI] Token issuance error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to issue tokens', detail: err.message });
  }
};

module.exports = { githubLogin, githubCallback, refreshToken, logout, cliCallback, getMe };
  