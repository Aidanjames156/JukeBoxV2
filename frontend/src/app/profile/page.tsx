"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type Review = {
  id: number;
  spotify_album_id: string;
  rating: number;
  body: string | null;
  created_at: string;
};

type ListItem = {
  spotify_album_id: string;
  created_at: string;
};

type List = {
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

export default function ProfilePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [albumMap, setAlbumMap] = useState<Record<string, AlbumCard>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState<string | null>(null);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return null;
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

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

    async function loadReviews() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/me/reviews`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) {
            setReviews([]);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Could not load reviews.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadLists() {
      setListsLoading(true);
      setListsError(null);

      try {
        const response = await fetch(`${apiUrl}/me/lists`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) {
            setLists([]);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setLists(Array.isArray(data.lists) ? data.lists : []);
        }
      } catch (err) {
        if (!cancelled) {
          setListsError("Could not load lists.");
        }
      } finally {
        if (!cancelled) {
          setListsLoading(false);
        }
      }
    }

    loadLists();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbums() {
      const reviewIds = reviews.map((review) => review.spotify_album_id);
      const listIds = lists.flatMap((list) =>
        list.items.map((item) => item.spotify_album_id)
      );

      const validIds = Array.from(new Set([...reviewIds, ...listIds])).filter(
        (id) => /^[A-Za-z0-9]{22}$/.test(id)
      );

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
  }, [apiUrl, reviews, lists, albumMap]);

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString();
  }

  // list creation and item addition moved to dedicated list pages

  return (
    <div className="min-h-screen text-[color:var(--foreground)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
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
                  Your profile
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
              <Link
                href="/"
                className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)] transition hover:border-[var(--accent)]"
              >
                Search
              </Link>
              <span className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)]">
                Profile
              </span>
            </nav>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-none border border-[color:var(--border)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)]"
            >
              Back to search
            </Link>
          </div>
          <p className="text-[var(--muted)]">
            Track your reviews and personal ratings.
          </p>
        </header>

        {!authChecked && (
          <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
            Checking session...
          </div>
        )}

        {authChecked && !user && (
          <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--foreground)]">
            <p>You need to sign in to view your profile.</p>
            <a
              className="mt-4 inline-flex items-center justify-center rounded-none bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)]"
              href={`${apiUrl}/auth/spotify`}
            >
              Continue with Spotify
            </a>
          </div>
        )}

        {user && (
          <section className="border border-[color:var(--border)] p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Signed in as
                </p>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  {user.display_name || user.spotify_id}
                </p>
              </div>
              <div className="flex gap-6 text-sm text-[var(--muted)]">
                <span>{reviews.length} reviews</span>
                <span>
                  {averageRating ? `Average ${averageRating}` : "No ratings"}
                </span>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </div>
        )}

        {user && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Lists
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Curate your albums
                </span>
                <Link
                  href="/lists/new"
                  className="rounded-none border border-[color:var(--border)] px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[var(--accent)]"
                >
                  Create list
                </Link>
              </div>
            </div>

            {listsLoading && (
              <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
                Loading lists...
              </div>
            )}

            {listsError && (
              <div className="border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                {listsError}
              </div>
            )}

            {!listsLoading && lists.length === 0 && (
              <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
                No lists yet. Create one to start collecting albums.
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {lists.map((list) => (
                <Link
                  key={list.id}
                  href={`/lists/${list.id}`}
                  className="border border-[color:var(--border)] p-5 transition hover:border-[var(--accent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {list.title}
                      </p>
                      {list.description && (
                        <p className="text-xs text-[var(--muted)]">
                          {list.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-[var(--muted)]">
                      {list.items.length} album
                      {list.items.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {list.items.length === 0 && (
                      <p className="col-span-full text-xs text-[var(--muted)]">
                        No albums yet.
                      </p>
                    )}
                    {list.items.slice(0, 4).map((item) => {
                      const album = albumMap[item.spotify_album_id];
                      return (
                        <div
                          key={item.spotify_album_id}
                          className="relative w-full overflow-hidden border border-[color:var(--border)] bg-[#0b0d12] pb-[150%]"
                        >
                          {album?.image ? (
                            <img
                              src={album.image}
                              alt={`${album.name} cover`}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                              No art
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {user && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Recent reviews
              </h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Latest first
              </span>
            </div>

            {loading && (
              <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
                Loading reviews...
              </div>
            )}

            {!loading && reviews.length === 0 && (
              <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--muted)]">
                No reviews yet. Head back to search and rate an album.
              </div>
            )}

            <div className="space-y-4">
              {reviews.map((review) => {
                const album = albumMap[review.spotify_album_id];
                return (
                  <div
                    key={review.id}
                    className="flex flex-col gap-4 border border-[color:var(--border)] p-5 md:flex-row md:items-start"
                  >
                    <div className="relative h-32 w-24 flex-shrink-0 overflow-hidden border border-[color:var(--border)] bg-[#0b0d12]">
                      {album?.image ? (
                        <img
                          src={album.image}
                          alt={`${album.name} cover`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--foreground)]">
                            {album?.name || "Album"}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {album?.artists?.join(", ") || review.spotify_album_id}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {formatDate(review.created_at)}
                        </span>
                      </div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--accent-strong)]">
                        Rating {review.rating}/10
                      </div>
                      {review.body && (
                        <p className="text-sm text-[var(--foreground)]">
                          {review.body}
                        </p>
                      )}
                      <Link
                        href={`/albums/${review.spotify_album_id}`}
                        className="text-xs text-[var(--accent-strong)] hover:text-[var(--accent)]"
                      >
                        View album
                      </Link>
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
