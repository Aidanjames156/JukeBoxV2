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
- `GET /me/profile` fetch the current user's profile (auth required)
- `PATCH /me/profile` update the current user's profile (auth required)
- `POST /me/avatar` upload a profile photo (auth required)
- `GET /spotify/search?query=` search Spotify albums (no auth required)
- `GET /spotify/albums?ids=` batch fetch album details (no auth required)
- `GET /spotify/albums/:id` fetch album details (no auth required)
- `GET /albums/:id/reviews` list reviews for an album (no auth required)
- `POST /albums/:id/reviews` create a review (auth required)
- `GET /me/reviews` list the current user's reviews (auth required)
- `GET /me/lists` list the current user's lists with album ids (auth required)
- `POST /me/lists` create a new list (auth required)
- `PATCH /lists/:id` update list settings (auth required)
- `POST /lists/:id/items` add an album to a list (auth required)
- `POST /lists/:id/reorder` reorder list items (auth required)
- `GET /lists/:id` fetch a single list (auth required)
