# Jukebox

Frontend: Next.js + Tailwind in `frontend`
Backend: Node.js (Express) + PostgreSQL in `backend`

Endpoints:
- `GET /` basic status
- `GET /health` checks database connectivity
- `GET /auth/spotify` starts Spotify OAuth
- `GET /auth/spotify/callback` handles Spotify OAuth
- `GET /auth/me` returns the current user
- `POST /auth/logout` clears the session
- `GET /spotify/search?query=` search Spotify albums (no auth required)
- `GET /spotify/albums/:id` fetch album details (no auth required)
- `GET /albums/:id/reviews` list reviews for an album (no auth required)
- `POST /albums/:id/reviews` create a review (auth required)
- `GET /me/reviews` list the current user's reviews (auth required)
- `GET /me/lists` list the current user's lists with album ids (auth required)
- `POST /me/lists` create a new list (auth required)
- `POST /lists/:id/items` add an album to a list (auth required)
- `GET /lists/:id` fetch a single list (auth required)
