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
  position?: number;
};

type ListDetail = {
  id: number;
  title: string;
  description: string | null;
  is_ranked: boolean;
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
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [rankedSaving, setRankedSaving] = useState(false);
  const [rankedError, setRankedError] = useState<string | null>(null);

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
        const topPosition = prev.items[0]?.position ?? 0;
        return {
          ...prev,
          items: [
            {
              spotify_album_id: albumId,
              created_at: new Date().toISOString(),
              position: topPosition + 1,
            },
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

  async function handleRankedToggle(nextValue: boolean) {
    if (!listId || !list) {
      return;
    }

    setRankedSaving(true);
    setRankedError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_ranked: nextValue }),
      });

      if (!response.ok) {
        throw new Error("ranked_update_failed");
      }

      const data = await response.json();
      const updatedRanked =
        typeof data?.list?.is_ranked === "boolean"
          ? data.list.is_ranked
          : nextValue;

      setList((prev) =>
        prev ? { ...prev, is_ranked: updatedRanked } : prev
      );
    } catch (err) {
      setRankedError("Could not update list ranking.");
    } finally {
      setRankedSaving(false);
    }
  }

  function buildOrderedItems(
    items: ListItem[],
    sourceId: string,
    targetId: string
  ) {
    const currentIndex = items.findIndex(
      (item) => item.spotify_album_id === sourceId
    );
    const targetIndex = items.findIndex(
      (item) => item.spotify_album_id === targetId
    );

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      currentIndex === targetIndex
    ) {
      return null;
    }

    const nextItems = [...items];
    const [moved] = nextItems.splice(currentIndex, 1);
    nextItems.splice(targetIndex, 0, moved);

    return nextItems.map((item, index) => ({
      ...item,
      position: nextItems.length - index,
    }));
  }

  async function persistOrder(
    orderedItems: ListItem[],
    previousItems: ListItem[]
  ) {
    if (!listId) {
      return;
    }

    setReorderSaving(true);
    setReorderError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          order: orderedItems.map((item) => item.spotify_album_id),
        }),
      });

      if (!response.ok) {
        throw new Error("reorder_failed");
      }
    } catch (err) {
      setReorderError("Could not save the new order.");
      setList((prev) => (prev ? { ...prev, items: previousItems } : prev));
    } finally {
      setReorderSaving(false);
    }
  }

  function handleDragStart(
    event: React.DragEvent<HTMLDivElement>,
    itemId: string
  ) {
    if (reorderSaving || !list?.is_ranked) {
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    setDraggingId(itemId);
  }

  function handleDragOver(
    event: React.DragEvent<HTMLDivElement>,
    itemId: string
  ) {
    if (reorderSaving || !list?.is_ranked) {
      return;
    }
    event.preventDefault();
    if (dragOverId !== itemId) {
      setDragOverId(itemId);
    }
  }

  async function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
    targetId: string
  ) {
    event.preventDefault();
    if (!list || reorderSaving || !list.is_ranked) {
      return;
    }

    const sourceId =
      draggingId || event.dataTransfer.getData("text/plain") || "";
    setDraggingId(null);
    setDragOverId(null);

    if (!sourceId || sourceId === targetId) {
      return;
    }

    const previousItems = list.items;
    const orderedItems = buildOrderedItems(previousItems, sourceId, targetId);
    if (!orderedItems) {
      return;
    }

    setList((prev) => (prev ? { ...prev, items: orderedItems } : prev));
    await persistOrder(orderedItems, previousItems);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
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
            {reorderError && (
              <div className="mt-3 border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                {reorderError}
              </div>
            )}
            {rankedError && (
              <div className="mt-3 border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                {rankedError}
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

            <div className="flex flex-wrap items-center justify-between gap-4 border border-[color:var(--border)] px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] text-[var(--accent)]"
                  checked={list.is_ranked}
                  disabled={rankedSaving}
                  onChange={(event) => handleRankedToggle(event.target.checked)}
                />
                Ranked list
              </label>
              <span className="text-[10px] text-[var(--muted-strong)]">
                {list.is_ranked ? "Drag to reorder" : "Unranked list"}
              </span>
            </div>

            <div className="space-y-4">
              {list.items.length === 0 && (
                <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
                  No albums yet. Start typing to add one.
                </div>
              )}
              {list.items.map((item, index) => {
                const album = albumMap[item.spotify_album_id];
                const isDragging = draggingId === item.spotify_album_id;
                const isDragOver = dragOverId === item.spotify_album_id;
                return (
                  <div
                    key={item.spotify_album_id}
                    className={`group flex flex-col gap-4 border border-[color:var(--border)] p-4 transition md:flex-row md:items-center ${
                      isDragOver ? "border-[var(--accent)] bg-[color:var(--surface-strong)]" : ""
                    } ${isDragging ? "opacity-70" : ""} ${
                      list.is_ranked ? "cursor-grab" : ""
                    }`}
                    draggable={list.is_ranked && !reorderSaving}
                    onDragStart={(event) =>
                      handleDragStart(event, item.spotify_album_id)
                    }
                    onDragOver={(event) =>
                      handleDragOver(event, item.spotify_album_id)
                    }
                    onDrop={(event) =>
                      handleDrop(event, item.spotify_album_id)
                    }
                    onDragEnd={handleDragEnd}
                  >
                    <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface-strong)]">
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
                    {list.is_ranked && (
                      <div className="w-10 text-xs font-semibold text-[var(--muted-strong)]">
                        #{index + 1}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {album?.name || "Unknown album"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {album?.artists?.join(", ") || item.spotify_album_id}
                      </p>
                    </div>
                    {list.is_ranked && (
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] opacity-0 transition group-hover:opacity-100">
                        <span
                          className="cursor-grab border border-[color:var(--border)] px-2 py-1 transition group-active:cursor-grabbing"
                          aria-hidden="true"
                        >
                          Drag
                        </span>
                        {reorderSaving && (
                          <span className="text-[var(--muted-strong)]">
                            Saving...
                          </span>
                        )}
                      </div>
                    )}
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
