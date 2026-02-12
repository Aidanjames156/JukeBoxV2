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
  refreshAccessToken,
  fetchSpotifyProfile,
  fetchSpotifyJson,
} = require('./spotify');

const app = express();
const port = process.env.PORT || 4000;
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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

app.get('/spotify/search', requireAuth, async (req, res) => {
  const query = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10), 1), 20);

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query_required' });
  }

  try {
    const accessToken = await getAccessTokenForUser(req.user.sub);
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

    return res.json({ albums });
  } catch (err) {
    if (err.code === 'missing_refresh_token') {
      return res.status(401).json({ error: 'missing_refresh_token' });
    }
    console.error(err);
    return res.status(500).json({ error: 'spotify_search_failed' });
  }
});

app.get('/spotify/albums/:id', requireAuth, async (req, res) => {
  const albumId = req.params.id;

  try {
    const accessToken = await getAccessTokenForUser(req.user.sub);
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

    return res.json({ album });
  } catch (err) {
    if (err.code === 'missing_refresh_token') {
      return res.status(401).json({ error: 'missing_refresh_token' });
    }
    console.error(err);
    return res.status(500).json({ error: 'spotify_album_failed' });
  }
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
