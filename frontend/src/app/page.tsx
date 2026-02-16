"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
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
        setError("Search requires Spotify authentication.");
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
    <div className="min-h-screen px-4 py-10 text-[color:var(--foreground)]">
      <main className="mx-auto w-full max-w-6xl space-y-10">
        <header className="flex flex-col gap-6 border-b border-[color:var(--border)] pb-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-none bg-[color:var(--accent)] text-lg font-bold text-[#0a140c]">
                J
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
                  Jukebox
                </p>
                <p className="font-mono text-xl font-semibold tracking-tight">
                  Album diary for music obsessives
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
              <span className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)]">
                Search
              </span>
              <Link
                href="/profile"
                className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)] transition hover:border-[var(--accent)]"
              >
                Profile
              </Link>
            </nav>
            <div className="flex flex-wrap items-center gap-3">
              {!authChecked && (
                <span className="text-xs text-[var(--muted)]">
                  Checking session...
                </span>
              )}
              {user ? (
                <>
                  <span className="text-sm text-[var(--muted)]">
                    Signed in as{" "}
                    <span className="font-semibold text-[var(--foreground)]">
                      {user.display_name || user.spotify_id}
                    </span>
                  </span>
                  <button
                    className="rounded-none border border-[color:var(--border)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)]"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <a
                  className="inline-flex items-center justify-center rounded-none bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)]"
                  href={`${apiUrl}/auth/spotify`}
                >
                  Continue with Spotify
                </a>
              )}
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                Rate and review the albums you love.
              </h1>
              <p className="text-[var(--muted)]">
                Log listens, write reviews, and build your personal canon.
              </p>
            </div>
            <div className="border border-[color:var(--border)] p-4 text-sm text-[var(--muted)]">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                New
              </p>
              <p className="mt-2">
                Search any Spotify album without signing in. Log in to rate and
                review.
              </p>
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 border-b border-[color:var(--border)] pb-6 md:flex-row"
        >
          <input
            className="flex-1 rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-5 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] placeholder:text-[var(--muted)]"
            placeholder="Search for an album or artist"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-none bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[color:var(--surface-strong)] disabled:text-[var(--muted)]"
            disabled={!canSearch || loadingSearch}
          >
            {loadingSearch ? "Searching..." : "Search"}
          </button>
        </form>

        {error && (
          <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Results
            </h2>
            {results.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Start by searching for an album.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((album) => (
                <div key={album.id} className="group">
                  <button
                    className="flex w-full flex-col items-start gap-3 text-left"
                    onClick={() => handleSelect(album.id)}
                    type="button"
                  >
                    <div className="relative w-full overflow-hidden border border-[color:var(--border)] bg-[#0b0d12] pb-[100%]">
                      {album.image ? (
                        <img
                          src={album.image}
                          alt={`${album.name} cover`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {album.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {album.artists.join(", ")}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-strong)]">
                        <span>
                          {album.release_date} • {album.total_tracks} tracks
                        </span>
                        <Link
                          className="text-[var(--accent-strong)] hover:text-[var(--accent)]"
                          href={`/albums/${album.id}`}
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Album Details
            </h2>
            {loadingAlbum && (
              <p className="text-sm text-[var(--muted)]">Loading details...</p>
            )}
            {!loadingAlbum && !selected && (
              <p className="text-sm text-[var(--muted)]">
                Select an album to see track details.
              </p>
            )}
            {selected && (
              <div className="space-y-4 border border-[color:var(--border)] p-5">
                <div className="flex items-start gap-4">
                  <div className="h-24 w-24 flex-shrink-0 overflow-hidden border border-[color:var(--border)] bg-[#0b0d12]">
                    {selected.images?.[0]?.url ? (
                      <img
                        src={selected.images[0].url}
                        alt={`${selected.name} cover`}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-[var(--foreground)]">
                      {selected.name}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      {selected.artists.join(", ")}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {selected.release_date} • {selected.total_tracks} tracks
                    </p>
                    {selected.label && (
                      <p className="text-xs text-[var(--muted)]">
                        Label: {selected.label}
                      </p>
                    )}
                    {selected.genres?.length > 0 && (
                      <p className="text-xs text-[var(--muted)]">
                        Genres: {selected.genres.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-2">
                  {selected.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between border-b border-[color:var(--border)] py-2 text-xs text-[var(--muted)]"
                    >
                      <span>
                        {track.track_number}. {track.name}
                      </span>
                      {track.preview_url ? (
                        <a
                          className="text-[var(--accent-strong)] hover:text-[var(--accent)]"
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
