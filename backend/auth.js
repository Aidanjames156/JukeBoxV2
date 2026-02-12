const jwt = require('jsonwebtoken');

const cookieName = 'jukebox_session';
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

function setSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, spotifyId: user.spotify_id },
    jwtSecret,
    { expiresIn: '7d' }
  );

  res.cookie(cookieName, token, {
    ...cookieOptions,
    maxAge: sessionDurationMs,
  });
}

function clearSession(res) {
  res.clearCookie(cookieName, cookieOptions);
}

function getSession(req) {
  const token = req.cookies?.[cookieName];
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, jwtSecret);
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  req.user = session;
  return next();
}

module.exports = {
  cookieName,
  cookieOptions,
  setSession,
  clearSession,
  getSession,
  requireAuth,
};
