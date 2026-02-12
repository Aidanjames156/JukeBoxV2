# Jukebox

Frontend: Next.js + Tailwind in `frontend`
Backend: Node.js (Express) + PostgreSQL in `backend`

Quick start:
1. Start Postgres (use docker compose or your own instance).
2. In `backend`, copy `.env.example` to `.env` and update values.
3. Create tables by running the SQL in `backend/sql/schema.sql`.
4. Run `npm run dev` in `backend`.
5. Run `npm run dev` in `frontend`.

Endpoints:
- `GET /` basic status
- `GET /health` checks database connectivity
- `GET /auth/spotify` starts Spotify OAuth
- `GET /auth/spotify/callback` handles Spotify OAuth
- `GET /auth/me` returns the current user
- `POST /auth/logout` clears the session
- `GET /spotify/search?query=` search Spotify albums (auth required)
- `GET /spotify/albums/:id` fetch album details (auth required)

Ports:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

Spotify setup:
1. Create an app in the Spotify Developer Dashboard.
2. Set the redirect URI to `http://localhost:4000/auth/spotify/callback`.
3. Copy the client ID and client secret into `backend/.env`.

Frontend config (optional):
- Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if your backend runs on a different host.
