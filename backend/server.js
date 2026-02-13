require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { pool } = require('./db');
const {
  cookieOptions,
  setSession,
  clearSession,
  getSession,
  requireAuth,
} = require('./auth');
const {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getAppAccessToken,
  refreshAccessToken,
  fetchSpotifyProfile,
  fetchSpotifyJson,
} = require('./spotify');

const app = express();
const port = process.env.PORT || 4000;
const defaultOrigin = 'http://127.0.0.1:3000';
const webOriginRaw = process.env.WEB_ORIGIN || defaultOrigin;
const parsedOrigins = webOriginRaw
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const webOrigin = parsedOrigins[0] || defaultOrigin;
const allowedOrigins = new Set(parsedOrigins);
allowedOrigins.add('http://127.0.0.1:3000');
allowedOrigins.add('http://localhost:3000');

const rateLimitWindowMs = 60_000;
const rateLimitMax = 60;
const rateLimitStore = new Map();

const searchCache = new Map();
const albumCache = new Map();
const searchCacheTtlMs = 60_000;
const albumCacheTtlMs = 5 * 60_000;
const cacheMaxEntries = 500;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.connection?.remoteAddress || 'unknown';
  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count += 1;
  res.set('X-RateLimit-Limit', String(rateLimitMax));
  res.set('X-RateLimit-Remaining', String(Math.max(rateLimitMax - entry.count, 0)));
  res.set('X-RateLimit-Reset', String(entry.resetAt));

  if (entry.count > rateLimitMax) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  return next();
}

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(map, key, value, ttlMs) {
  if (map.size > cacheMaxEntries) {
    map.clear();
  }
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function getUserRefreshToken(userId) {
  const result = await pool.query(
    'SELECT refresh_token FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.refresh_token || null;
}

async function getAccessTokenForUser(userId) {
  const refreshToken = await getUserRefreshToken(userId);
  if (!refreshToken) {
    const error = new Error('missing_refresh_token');
    error.code = 'missing_refresh_token';
    throw error;
  }

  const { accessToken, refreshToken: newRefreshToken } =
    await refreshAccessToken(refreshToken);

  if (newRefreshToken) {
    await pool.query(
      'UPDATE users SET refresh_token = $1 WHERE id = $2',
      [newRefreshToken, userId]
    );
  }

  return accessToken;
}

async function getAccessContext(req) {
  const session = getSession(req);
  if (session?.sub) {
    try {
      const accessToken = await getAccessTokenForUser(session.sub);
      return { accessToken, cacheKey: `user:${session.sub}` };
    } catch (err) {
      if (err.code !== 'missing_refresh_token') {
        throw err;
      }
    }
  }

  const accessToken = await getAppAccessToken();
  return { accessToken, cacheKey: 'app' };
}

app.get('/', (req, res) => {
  res.json({ name: 'jukebox-api', status: 'ok' });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'database_unavailable' });
  }
});

app.get('/auth/spotify', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('spotify_oauth_state', state, {
    ...cookieOptions,
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(getAuthorizeUrl(state));
});

app.get('/auth/spotify/callback', async (req, res) => {
  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
  const storedState = req.cookies?.spotify_oauth_state;

  if (!code || !state || !storedState || state !== storedState) {
    return res.status(400).json({ error: 'invalid_state' });
  }

  res.clearCookie('spotify_oauth_state', cookieOptions);

  try {
    const { accessToken, refreshToken: incomingRefreshToken } = await exchangeCodeForToken(code);
    const profile = await fetchSpotifyProfile(accessToken);

    let refreshToken = incomingRefreshToken;
    if (!refreshToken) {
      const existing = await pool.query(
        'SELECT refresh_token FROM users WHERE spotify_id = $1',
        [profile.id]
      );
      refreshToken = existing.rows[0]?.refresh_token || null;
    }

    if (!refreshToken) {
      return res.status(500).json({ error: 'missing_refresh_token' });
    }

    const result = await pool.query(
      `INSERT INTO users (spotify_id, display_name, refresh_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (spotify_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, refresh_token = EXCLUDED.refresh_token
       RETURNING id, spotify_id, display_name`,
      [profile.id, profile.display_name || null, refreshToken]
    );

    setSession(res, result.rows[0]);
    return res.redirect(webOrigin);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_auth_failed' });
  }
});

app.get('/auth/me', async (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ user: null });
  }

  try {
    const result = await pool.query(
      'SELECT id, spotify_id, display_name FROM users WHERE id = $1',
      [session.sub]
    );

    return res.json({ user: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'user_lookup_failed' });
  }
});

app.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ status: 'ok' });
});

app.get('/spotify/search', rateLimit, async (req, res) => {
  const query = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10), 1), 20);

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query_required' });
  }

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheId = `${cacheKey}:search:${limit}:${query.trim().toLowerCase()}`;
    const cached = getCached(searchCache, cacheId);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('type', 'album');
    url.searchParams.set('limit', String(limit));

    const data = await fetchSpotifyJson(accessToken, url.toString());
    const albums = (data.albums?.items || []).map((album) => ({
      id: album.id,
      name: album.name,
      artists: album.artists?.map((artist) => artist.name) || [],
      image: album.images?.[1]?.url || album.images?.[0]?.url || null,
      release_date: album.release_date,
      total_tracks: album.total_tracks,
    }));

    const payload = { albums };
    setCached(searchCache, cacheId, payload, searchCacheTtlMs);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_search_failed' });
  }
});

app.get('/spotify/albums/:id', rateLimit, async (req, res) => {
  const albumId = req.params.id;

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheId = `${cacheKey}:album:${albumId}`;
    const cached = getCached(albumCache, cacheId);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const data = await fetchSpotifyJson(
      accessToken,
      `https://api.spotify.com/v1/albums/${albumId}`
    );

    const album = {
      id: data.id,
      name: data.name,
      artists: data.artists?.map((artist) => artist.name) || [],
      images: data.images || [],
      release_date: data.release_date,
      total_tracks: data.total_tracks,
      label: data.label,
      genres: data.genres || [],
      tracks: data.tracks?.items?.map((track) => ({
        id: track.id,
        name: track.name,
        track_number: track.track_number,
        duration_ms: track.duration_ms,
        preview_url: track.preview_url,
      })) || [],
    };

    const payload = { album };
    setCached(albumCache, cacheId, payload, albumCacheTtlMs);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_album_failed' });
  }
});

app.get('/albums/:id/reviews', async (req, res) => {
  const albumId = req.params.id;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10), 1), 100);

  if (!albumId) {
    return res.status(400).json({ error: 'album_id_required' });
  }

  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.body, r.created_at,
              u.id AS user_id, u.display_name, u.spotify_id
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.spotify_album_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [albumId, limit]
    );

    const reviews = result.rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      created_at: row.created_at,
      user: {
        id: row.user_id,
        display_name: row.display_name,
        spotify_id: row.spotify_id,
      },
    }));

    return res.json({ reviews });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'reviews_fetch_failed' });
  }
});

app.post('/albums/:id/reviews', requireAuth, async (req, res) => {
  const albumId = req.params.id;
  const rating = parseInt(req.body?.rating, 10);
  const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const body = bodyRaw.length > 0 ? bodyRaw : null;

  if (!albumId) {
    return res.status(400).json({ error: 'album_id_required' });
  }

  if (Number.isNaN(rating) || rating < 1 || rating > 10) {
    return res.status(400).json({ error: 'rating_invalid' });
  }

  if (body && body.length > 2000) {
    return res.status(400).json({ error: 'body_too_long' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO reviews (user_id, spotify_album_id, rating, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, rating, body, created_at`,
      [req.user.sub, albumId, rating, body]
    );

    const userResult = await pool.query(
      'SELECT id, display_name, spotify_id FROM users WHERE id = $1',
      [req.user.sub]
    );
    const userRow = userResult.rows[0] || {};

    return res.status(201).json({
      review: {
        id: result.rows[0].id,
        rating: result.rows[0].rating,
        body: result.rows[0].body,
        created_at: result.rows[0].created_at,
        user: {
          id: userRow.id || req.user.sub,
          display_name: userRow.display_name || null,
          spotify_id: userRow.spotify_id || null,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'review_create_failed' });
  }
});

app.get('/me/reviews', requireAuth, async (req, res) => {
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10), 1), 100);

  try {
    const result = await pool.query(
      `SELECT id, spotify_album_id, rating, body, created_at
       FROM reviews
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.sub, limit]
    );

    const reviews = result.rows.map((row) => ({
      id: row.id,
      spotify_album_id: row.spotify_album_id,
      rating: row.rating,
      body: row.body,
      created_at: row.created_at,
    }));

    return res.json({ reviews });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'reviews_fetch_failed' });
  }
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
