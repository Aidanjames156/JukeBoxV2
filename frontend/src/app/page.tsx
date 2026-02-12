"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type AlbumSummary = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  release_date: string;
  total_tracks: number;
};

type AlbumDetail = {
  id: string;
  name: string;
  artists: string[];
  images: { url: string; width: number; height: number }[];
  release_date: string;
  total_tracks: number;
  label: string;
  genres: string[];
  tracks: {
    id: string;
    name: string;
    track_number: number;
    duration_ms: number;
    preview_url: string | null;
  }[];
};

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AlbumSummary[]>([]);
  const [selected, setSelected] = useState<AlbumDetail | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingAlbum, setLoadingAlbum] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = useMemo(() => query.trim().length > 1, [query]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const response = await fetch(`${apiUrl}/auth/me`, {
          credentials: "include",
        });
        const data = await response.json();
        if (!cancelled) {
          setUser(data.user || null);
          setAuthChecked(true);
        }
      } catch (err) {
        if (!cancelled) {
          setUser(null);
          setAuthChecked(true);
        }
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSelected(null);

    if (!canSearch) {
      setResults([]);
      return;
    }

    setLoadingSearch(true);
    try {
      const response = await fetch(
        `${apiUrl}/spotify/search?query=${encodeURIComponent(query.trim())}`,
        { credentials: "include" }
      );
      if (response.status === 401) {
        setError("Please sign in with Spotify to search.");
        setResults([]);
        return;
      }
      const data = await response.json();
      setResults(data.albums || []);
    } catch (err) {
      setError("Search failed. Try again.");
    } finally {
      setLoadingSearch(false);
    }
  }

  async function handleSelect(albumId: string) {
    setError(null);
    setLoadingAlbum(true);
    try {
      const response = await fetch(`${apiUrl}/spotify/albums/${albumId}`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setError("Please sign in with Spotify to view details.");
        return;
      }
      const data = await response.json();
      setSelected(data.album || null);
    } catch (err) {
      setError("Could not load album details.");
    } finally {
      setLoadingAlbum(false);
    }
  }

  async function handleLogout() {
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
      <main className="w-full max-w-5xl space-y-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-10 shadow-2xl">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
              Jukebox
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Rate and review the albums you love.
            </h1>
            <p className="text-zinc-400">
              Search Spotify and build your review library.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!authChecked && (
              <span className="text-xs text-zinc-500">Checking session...</span>
            )}
            {user ? (
              <>
                <span className="text-sm text-zinc-300">
                  Signed in as{" "}
                  <span className="font-semibold text-zinc-50">
                    {user.display_name || user.spotify_id}
                  </span>
                </span>
                <button
                  className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </>
            ) : (
              <a
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                href={`${apiUrl}/auth/spotify`}
              >
                Continue with Spotify
              </a>
            )}
          </div>
        </header>

        <form onSubmit={handleSearch} className="flex flex-col gap-3 md:flex-row">
          <input
            className="flex-1 rounded-full border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400"
            placeholder="Search for an album or artist"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-full bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            disabled={!canSearch || loadingSearch}
          >
            {loadingSearch ? "Searching..." : "Search"}
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Results
            </h2>
            {results.length === 0 && (
              <p className="text-sm text-zinc-500">
                Start by searching for an album.
              </p>
            )}
            <div className="space-y-3">
              {results.map((album) => (
                <button
                  key={album.id}
                  className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-left transition hover:border-emerald-400"
                  onClick={() => handleSelect(album.id)}
                  type="button"
                >
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                    {album.image ? (
                      <img
                        src={album.image}
                        alt={`${album.name} cover`}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-zinc-100">
                      {album.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {album.artists.join(", ")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {album.release_date} • {album.total_tracks} tracks
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Album Details
            </h2>
            {loadingAlbum && (
              <p className="text-sm text-zinc-500">Loading details...</p>
            )}
            {!loadingAlbum && !selected && (
              <p className="text-sm text-zinc-500">
                Select an album to see track details.
              </p>
            )}
            {selected && (
              <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                <div className="flex items-start gap-4">
                  <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                    {selected.images?.[0]?.url ? (
                      <img
                        src={selected.images[0].url}
                        alt={`${selected.name} cover`}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-zinc-50">
                      {selected.name}
                    </p>
                    <p className="text-sm text-zinc-400">
                      {selected.artists.join(", ")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {selected.release_date} • {selected.total_tracks} tracks
                    </p>
                    {selected.label && (
                      <p className="text-xs text-zinc-500">
                        Label: {selected.label}
                      </p>
                    )}
                    {selected.genres?.length > 0 && (
                      <p className="text-xs text-zinc-500">
                        Genres: {selected.genres.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-2">
                  {selected.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between text-xs text-zinc-400"
                    >
                      <span>
                        {track.track_number}. {track.name}
                      </span>
                      {track.preview_url ? (
                        <a
                          className="text-emerald-400 hover:text-emerald-300"
                          href={track.preview_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Preview
                        </a>
                      ) : (
                        <span className="text-zinc-600">No preview</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
