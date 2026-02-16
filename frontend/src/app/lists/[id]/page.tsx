"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type ListItem = {
  spotify_album_id: string;
  created_at: string;
};

type ListDetail = {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  items: ListItem[];
};

type AlbumCard = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
};

type SearchAlbum = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  release_date: string;
};

export default function ListPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const params = useParams();
  const rawId = params?.id;
  const listId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [list, setList] = useState<ListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [albumMap, setAlbumMap] = useState<Record<string, AlbumCard>>({});

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchAlbum[]>([]);
  const [searching, setSearching] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const suggestionOpen = useMemo(
    () => query.trim().length > 1 && suggestions.length > 0,
    [query, suggestions]
  );

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

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      if (!listId) {
        setError("Missing list id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiUrl}/lists/${listId}`, {
          credentials: "include",
        });

        if (response.status === 401) {
          setError("Sign in to view this list.");
          setLoading(false);
          return;
        }

        if (!response.ok) {
          setError("List not found.");
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setList(data.list || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Could not load list.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadList();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, listId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbums() {
      if (!list || list.items.length === 0) {
        return;
      }

      const validIds = Array.from(
        new Set(list.items.map((item) => item.spotify_album_id))
      ).filter((id) => /^[A-Za-z0-9]{22}$/.test(id));

      const uniqueIds = validIds.filter((id) => !albumMap[id]);

      if (uniqueIds.length === 0) {
        return;
      }

      try {
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueIds.length; i += 20) {
          chunks.push(uniqueIds.slice(i, i + 20));
        }

        const responses = await Promise.all(
          chunks.map((chunk) =>
            fetch(`${apiUrl}/spotify/albums?ids=${chunk.join(",")}`, {
              credentials: "include",
            })
          )
        );

        const albums = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              return [];
            }
            const data = await response.json();
            return Array.isArray(data.albums) ? data.albums : [];
          })
        );

        if (!cancelled) {
          setAlbumMap((prev) => {
            const next = { ...prev };
            albums.flat().forEach((album) => {
              if (!album) {
                return;
              }
              next[album.id] = {
                id: album.id,
                name: album.name,
                artists: album.artists || [],
                image: album.images?.[1]?.url || album.images?.[0]?.url || null,
              };
            });
            return next;
          });
        }
      } catch (err) {
        // ignore album enrichment errors
      }
    }

    loadAlbums();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, list, albumMap]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `${apiUrl}/spotify/search?query=${encodeURIComponent(query.trim())}&limit=6`,
          { credentials: "include" }
        );
        const data = await response.json();
        setSuggestions(Array.isArray(data.albums) ? data.albums : []);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiUrl, query]);

  function extractAlbumId(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const urlMatch = trimmed.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    const uriMatch = trimmed.match(/spotify:album:([a-zA-Z0-9]+)/);
    if (uriMatch) {
      return uriMatch[1];
    }

    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
      return trimmed;
    }

    return "";
  }

  async function addAlbumToList(albumId: string) {
    if (!listId) {
      return;
    }

    setAddError(null);
    setAdding(true);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ spotify_album_id: albumId }),
      });

      if (response.status === 401) {
        setAddError("Sign in to add albums.");
        return;
      }

      if (response.status === 400) {
        const data = await response.json().catch(() => null);
        if (data?.error === "invalid_album_id") {
          setAddError("Pick a suggestion so we can verify the album.");
          return;
        }
        if (data?.error === "spotify_unavailable") {
          setAddError("Spotify is unavailable right now. Try again.");
          return;
        }
      }

      if (!response.ok) {
        setAddError("Could not add album.");
        return;
      }

      setList((prev) => {
        if (!prev) {
          return prev;
        }
        const exists = prev.items.some(
          (item) => item.spotify_album_id === albumId
        );
        if (exists) {
          return prev;
        }
        return {
          ...prev,
          items: [
            { spotify_album_id: albumId, created_at: new Date().toISOString() },
            ...prev.items,
          ],
        };
      });
      setQuery("");
      setSuggestions([]);
    } catch (err) {
      setAddError("Could not add album.");
    } finally {
      setAdding(false);
    }
  }

  async function handleAddSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const albumId = extractAlbumId(query);
    if (!albumId) {
      if (suggestions.length > 0) {
        await addAlbumToList(suggestions[0].id);
        return;
      }
      setAddError("Pick a suggestion or paste a Spotify album URL.");
      return;
    }

    await addAlbumToList(albumId);
  }

  return (
    <div className="min-h-screen px-4 py-10 text-[color:var(--foreground)]">
      <main className="mx-auto w-full max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--border)] pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
              Jukebox
            </p>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {list?.title || "Album list"}
            </h1>
            {list?.description && (
              <p className="mt-2 text-sm text-[var(--muted)]">
                {list.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <Link
              href="/profile"
              className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)] transition hover:border-[var(--accent)]"
            >
              Profile
            </Link>
            <Link
              href="/"
              className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)] transition hover:border-[var(--accent)]"
            >
              Search
            </Link>
          </div>
        </header>

        {!authChecked && (
          <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
            Checking session...
          </div>
        )}

        {error && (
          <div className="border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </div>
        )}

        {authChecked && !error && list && (
          <section className="space-y-6">
            <form
              onSubmit={handleAddSubmit}
              className="relative border border-[color:var(--border)] p-5"
            >
              <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Add albums
              </label>
              <input
                className="mt-2 w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                placeholder="Start typing an album name or paste a Spotify URL"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {searching && (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Searching...
                </div>
              )}
              {suggestionOpen && (
                <div className="absolute left-5 right-5 top-full z-10 mt-2 border border-[color:var(--border)] bg-[color:var(--surface)]">
                  {suggestions.map((album) => (
                    <button
                      key={album.id}
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-[color:var(--border)] px-4 py-3 text-left text-sm text-[var(--foreground)] hover:bg-[color:var(--surface-strong)]"
                      onClick={() => addAlbumToList(album.id)}
                    >
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden border border-[color:var(--border)] bg-[#0b0d12]">
                        {album.image ? (
                          <img
                            src={album.image}
                            alt={`${album.name} cover`}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{album.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {album.artists.join(", ")}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!suggestionOpen && query.trim().length > 1 && !searching && (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Keep typing or paste a Spotify album URL.
                </div>
              )}
              {addError && (
                <div className="mt-3 border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                  {addError}
                </div>
              )}
              <button
                type="submit"
                className="mt-4 rounded-none bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[color:var(--surface-strong)] disabled:text-[var(--muted)]"
                disabled={adding}
              >
                {adding ? "Adding..." : "Add album"}
              </button>
            </form>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {list.items.length === 0 && (
                <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
                  No albums yet. Start typing to add one.
                </div>
              )}
              {list.items.map((item) => {
                const album = albumMap[item.spotify_album_id];
                return (
                  <div key={item.spotify_album_id} className="space-y-2">
                    <div className="relative w-full overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface-strong)] pb-[150%]">
                      {album?.image ? (
                        <img
                          src={album.image}
                          alt={`${album.name} cover`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[10px] uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                          No art
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {album?.name || "Unknown album"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {album?.artists?.join(", ") || item.spotify_album_id}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
