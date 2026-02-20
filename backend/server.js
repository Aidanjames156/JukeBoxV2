require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
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

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
      const safeExt = allowedExts.has(ext) ? ext : '';
      cb(null, `${crypto.randomBytes(16).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('invalid_file_type'));
  },
});

app.use('/uploads', express.static(uploadsDir));

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

function isValidSpotifyId(value) {
  return /^[A-Za-z0-9]{22}$/.test(value);
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
      console.warn('Falling back to app token for Spotify access.', err?.message);
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
       DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name),
                     refresh_token = EXCLUDED.refresh_token
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

app.get('/me/profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, spotify_id, display_name, avatar_url, bio,
              favorite_genres, favorite_album_ids
       FROM users
       WHERE id = $1`,
      [req.user.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'profile_not_found' });
    }

    return res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'profile_fetch_failed' });
  }
});

app.patch('/me/profile', requireAuth, async (req, res) => {
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'display_name')) {
    const displayNameRaw =
      typeof req.body.display_name === 'string' ? req.body.display_name.trim() : '';
    const displayName = displayNameRaw.length > 0 ? displayNameRaw : null;
    if (displayName && displayName.length > 80) {
      return res.status(400).json({ error: 'display_name_too_long' });
    }
    updates.push(`display_name = $${values.length + 1}`);
    values.push(displayName);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bio')) {
    const bioRaw = typeof req.body.bio === 'string' ? req.body.bio.trim() : '';
    const bio = bioRaw.length > 0 ? bioRaw : null;
    if (bio && bio.length > 500) {
      return res.status(400).json({ error: 'bio_too_long' });
    }
    updates.push(`bio = $${values.length + 1}`);
    values.push(bio);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'favorite_genres')) {
    const genresRaw = Array.isArray(req.body.favorite_genres)
      ? req.body.favorite_genres
      : [];
    const genres = genresRaw
      .filter((genre) => typeof genre === 'string')
      .map((genre) => genre.trim())
      .filter((genre) => genre.length > 0);
    const uniqueGenres = Array.from(new Set(genres));
    if (uniqueGenres.length > 10) {
      return res.status(400).json({ error: 'favorite_genres_too_many' });
    }
    if (uniqueGenres.some((genre) => genre.length > 30)) {
      return res.status(400).json({ error: 'favorite_genre_too_long' });
    }
    updates.push(`favorite_genres = $${values.length + 1}`);
    values.push(uniqueGenres);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'favorite_album_ids')) {
    if (!Array.isArray(req.body.favorite_album_ids)) {
      return res.status(400).json({ error: 'favorite_album_ids_invalid' });
    }
    const albumIds = req.body.favorite_album_ids
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (albumIds.length > 3) {
      return res.status(400).json({ error: 'favorite_album_ids_too_many' });
    }

    if (albumIds.some((id) => !isValidSpotifyId(id))) {
      return res.status(400).json({ error: 'favorite_album_ids_invalid' });
    }

    updates.push(`favorite_album_ids = $${values.length + 1}`);
    values.push(albumIds);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'profile_update_required' });
  }

  try {
    values.push(req.user.sub);
    const result = await pool.query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, spotify_id, display_name, avatar_url, bio,
                 favorite_genres, favorite_album_ids`,
      values
    );

    return res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'profile_update_failed' });
  }
});

app.post('/me/avatar', requireAuth, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'avatar_too_large' });
      }
      return res.status(400).json({ error: 'avatar_invalid' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'avatar_required' });
    }

    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    try {
      await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [
        avatarUrl,
        req.user.sub,
      ]);
      return res.json({ avatar_url: avatarUrl });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'avatar_update_failed' });
    }
  });
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

app.get('/spotify/albums', rateLimit, async (req, res) => {
  const idsRaw = Array.isArray(req.query.ids)
    ? req.query.ids.join(',')
    : req.query.ids;

  if (!idsRaw || typeof idsRaw !== 'string') {
    return res.status(400).json({ error: 'ids_required' });
  }

  const ids = idsRaw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => isValidSpotifyId(id));

  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids_invalid' });
  }

  if (ids.length > 20) {
    return res.status(400).json({ error: 'too_many_ids' });
  }

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheIds = ids.map((id) => ({
      id,
      cached: getCached(albumCache, `${cacheKey}:album:${id}`),
    }));

    const cachedAlbums = cacheIds
      .filter((entry) => entry.cached)
      .map((entry) => entry.cached.album);

    const missingIds = cacheIds
      .filter((entry) => !entry.cached)
      .map((entry) => entry.id);

    let fetchedAlbums = [];
    if (missingIds.length > 0) {
      const url = new URL('https://api.spotify.com/v1/albums');
      url.searchParams.set('ids', missingIds.join(','));
      const data = await fetchSpotifyJson(accessToken, url.toString());
      fetchedAlbums = (data.albums || [])
        .filter(Boolean)
        .map((album) => ({
          id: album.id,
          name: album.name,
          artists: album.artists?.map((artist) => artist.name) || [],
          images: album.images || [],
          release_date: album.release_date,
          total_tracks: album.total_tracks,
          label: album.label,
          genres: album.genres || [],
        }));
    }

    const allAlbums = [...cachedAlbums, ...fetchedAlbums];
    fetchedAlbums.forEach((album) => {
      const payload = { album };
      setCached(albumCache, `${cacheKey}:album:${album.id}`, payload, albumCacheTtlMs);
    });

    return res.json({ albums: allAlbums });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_album_failed' });
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

app.get('/me/lists', requireAuth, async (req, res) => {
  try {
    const listResult = await pool.query(
      `SELECT id, title, description, is_ranked, created_at
       FROM lists
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.sub]
    );

    const lists = listResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      is_ranked: row.is_ranked,
      created_at: row.created_at,
      items: [],
    }));

    if (lists.length === 0) {
      return res.json({ lists: [] });
    }

    const listIds = lists.map((list) => list.id);
    const itemResult = await pool.query(
      `SELECT list_id, spotify_album_id, created_at, position
       FROM list_items
       WHERE list_id = ANY($1)
       ORDER BY position DESC, created_at DESC`,
      [listIds]
    );

    const listMap = new Map(lists.map((list) => [list.id, list]));
    itemResult.rows.forEach((row) => {
      const list = listMap.get(row.list_id);
      if (list) {
        list.items.push({
          spotify_album_id: row.spotify_album_id,
          created_at: row.created_at,
          position: row.position,
        });
      }
    });

    return res.json({ lists });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'lists_fetch_failed' });
  }
});

app.post('/me/lists', requireAuth, async (req, res) => {
  const titleRaw = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const descriptionRaw =
    typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const description = descriptionRaw.length > 0 ? descriptionRaw : null;
  const isRanked = req.body?.is_ranked === true;

  if (!titleRaw) {
    return res.status(400).json({ error: 'title_required' });
  }

  if (titleRaw.length > 120) {
    return res.status(400).json({ error: 'title_too_long' });
  }

  if (description && description.length > 500) {
    return res.status(400).json({ error: 'description_too_long' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO lists (user_id, title, description, is_ranked)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, description, is_ranked, created_at`,
      [req.user.sub, titleRaw, description, isRanked]
    );

    return res.status(201).json({ list: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_create_failed' });
  }
});

app.patch('/lists/:id', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const isRanked =
    typeof req.body?.is_ranked === 'boolean' ? req.body.is_ranked : null;

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  if (isRanked === null) {
    return res.status(400).json({ error: 'update_required' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const result = await pool.query(
      `UPDATE lists
       SET is_ranked = $1
       WHERE id = $2
       RETURNING id, title, description, is_ranked, created_at`,
      [isRanked, listId]
    );

    return res.json({ list: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_update_failed' });
  }
});

app.post('/lists/:id/items', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const albumRaw =
    typeof req.body?.spotify_album_id === 'string'
      ? req.body.spotify_album_id.trim()
      : '';

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  if (!albumRaw) {
    return res.status(400).json({ error: 'album_id_required' });
  }

  if (!isValidSpotifyId(albumRaw)) {
    return res.status(400).json({ error: 'invalid_album_id' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const appToken = await getAppAccessToken();
    const validationResponse = await fetch(
      `https://api.spotify.com/v1/albums/${albumRaw}`,
      { headers: { Authorization: `Bearer ${appToken}` } }
    );

    if (validationResponse.status === 400 || validationResponse.status === 404) {
      return res.status(400).json({ error: 'invalid_album_id' });
    }

    if (!validationResponse.ok) {
      const details = await validationResponse.text();
      console.error('Spotify album validation failed:', details);
      return res.status(503).json({ error: 'spotify_unavailable' });
    }

    const positionResult = await pool.query(
      'SELECT COALESCE(MAX(position), 0) AS max_position FROM list_items WHERE list_id = $1',
      [listId]
    );
    const nextPosition = Number(positionResult.rows[0]?.max_position || 0) + 1;

    await pool.query(
      `INSERT INTO list_items (list_id, spotify_album_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (list_id, spotify_album_id) DO NOTHING`,
      [listId, albumRaw, nextPosition]
    );

    return res.status(201).json({
      item: {
        list_id: listId,
        spotify_album_id: albumRaw,
        position: nextPosition,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_item_create_failed' });
  }
});

app.post('/lists/:id/reorder', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const orderRaw = Array.isArray(req.body?.order) ? req.body.order : [];
  const order = orderRaw
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  if (order.length === 0) {
    return res.status(400).json({ error: 'order_required' });
  }

  if (order.some((id) => !isValidSpotifyId(id))) {
    return res.status(400).json({ error: 'invalid_album_id' });
  }

  if (new Set(order).size !== order.length) {
    return res.status(400).json({ error: 'order_duplicate' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const itemResult = await pool.query(
      'SELECT spotify_album_id FROM list_items WHERE list_id = $1',
      [listId]
    );
    const existingIds = itemResult.rows.map((row) => row.spotify_album_id);

    if (existingIds.length !== order.length) {
      return res.status(400).json({ error: 'order_mismatch' });
    }

    const existingSet = new Set(existingIds);
    const missing = order.some((id) => !existingSet.has(id));
    if (missing) {
      return res.status(400).json({ error: 'order_mismatch' });
    }

    const total = order.length;
    const values = [listId];
    const cases = [];

    order.forEach((albumId, index) => {
      const idParam = values.length + 1;
      values.push(albumId);
      const positionParam = values.length + 1;
      values.push(total - index);
      cases.push(`WHEN $${idParam} THEN $${positionParam}`);
    });

    const updateQuery = `
      UPDATE list_items
      SET position = CASE spotify_album_id
        ${cases.join(' ')}
        ELSE position
      END
      WHERE list_id = $1
    `;

    await pool.query(updateQuery, values);
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_reorder_failed' });
  }
});

app.get('/lists/:id', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  try {
    const listResult = await pool.query(
      `SELECT id, title, description, is_ranked, created_at
       FROM lists
       WHERE id = $1 AND user_id = $2`,
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const list = listResult.rows[0];

    const itemResult = await pool.query(
      `SELECT spotify_album_id, created_at, position
       FROM list_items
       WHERE list_id = $1
       ORDER BY position DESC, created_at DESC`,
      [listId]
    );

    list.items = itemResult.rows.map((row) => ({
      spotify_album_id: row.spotify_album_id,
      created_at: row.created_at,
      position: row.position,
    }));

    return res.json({ list });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_fetch_failed' });
  }
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
