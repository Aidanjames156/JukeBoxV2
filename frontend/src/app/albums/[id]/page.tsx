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

type Review = {
  id: number;
  rating: number;
  body: string | null;
  created_at: string;
  user: User;
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

export default function AlbumPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const params = useParams();
  const rawId = params?.id;
  const albumId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState("8");
  const [bodyValue, setBodyValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return null;
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbum() {
      if (!albumId) {
        setError("Missing album id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiUrl}/spotify/albums/${albumId}`, {
          credentials: "include",
        });

        const data = await response.json();
        if (!cancelled) {
          setAlbum(data.album || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Could not load album details.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAlbum();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, albumId]);

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
      if (!albumId) {
        setReviews([]);
        setReviewsLoading(false);
        return;
      }

      setReviewsLoading(true);
      setReviewError(null);

      try {
        const response = await fetch(`${apiUrl}/albums/${albumId}/reviews`, {
          credentials: "include",
        });
        const data = await response.json();
        if (!cancelled) {
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        }
      } catch (err) {
        if (!cancelled) {
          setReviewError("Could not load reviews.");
        }
      } finally {
        if (!cancelled) {
          setReviewsLoading(false);
        }
      }
    }

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, albumId]);

  async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewError(null);

    if (!albumId) {
      setReviewError("Missing album id.");
      return;
    }

    const ratingNumber = parseInt(ratingValue, 10);
    if (Number.isNaN(ratingNumber) || ratingNumber < 1 || ratingNumber > 10) {
      setReviewError("Rating must be between 1 and 10.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/albums/${albumId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rating: ratingNumber,
          body: bodyValue.trim() || null,
        }),
      });

      if (response.status === 401) {
        setReviewError("Please sign in with Spotify to add a review.");
        return;
      }

      if (!response.ok) {
        setReviewError("Could not save review.");
        return;
      }

      setBodyValue("");
      const data = await response.json();
      if (data.review) {
        setReviews((prev) => [data.review, ...prev]);
      }
    } catch (err) {
      setReviewError("Could not save review.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString();
  }

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
                  Album details
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
                <span className="text-xs text-[var(--muted)]">
                  Signed in as{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    {user.display_name || user.spotify_id}
                  </span>
                </span>
              ) : (
                <a
                  className="inline-flex items-center justify-center rounded-none bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)]"
                  href={`${apiUrl}/auth/spotify`}
                >
                  Continue with Spotify
                </a>
              )}
            </div>
          </div>
          <p className="text-[var(--muted)]">
            Deep dive into tracks, label, and metadata.
          </p>
        </header>

        {loading && (
          <div className="border border-[color:var(--border)] p-8 text-sm text-[var(--muted)]">
            Loading album...
          </div>
        )}

        {error && (
          <div className="border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && album && (
          <section className="grid gap-6 border border-[color:var(--border)] p-8 md:grid-cols-[240px_1fr]">
            <div className="space-y-4">
              <div className="relative w-full overflow-hidden border border-[color:var(--border)] bg-[#0b0d12] pb-[150%]">
                {album.images?.[0]?.url ? (
                  <img
                    src={album.images[0].url}
                    alt={`${album.name} cover`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="space-y-1 text-xs text-[var(--muted)]">
                <p>Release: {album.release_date}</p>
                <p>Tracks: {album.total_tracks}</p>
                {album.label && <p>Label: {album.label}</p>}
                {album.genres?.length > 0 && (
                  <p>Genres: {album.genres.join(", ")}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--foreground)]">
                  {album.name}
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {album.artists.join(", ")}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Tracklist
                </p>
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-2">
                  {album.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between border-b border-[color:var(--border)] py-2 text-xs text-[var(--foreground)]"
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
            </div>
          </section>
        )}

        <section className="space-y-6 border border-[color:var(--border)] p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Ratings & reviews
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {averageRating
                  ? `Average ${averageRating} · ${reviews.length} review${
                      reviews.length === 1 ? "" : "s"
                    }`
                  : "No reviews yet."}
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Rate 1–10
            </span>
          </div>

          <form
            onSubmit={handleReviewSubmit}
            className="flex flex-col gap-4 border border-[color:var(--border)] p-5"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Rating
              </label>
              <select
                className="w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] md:w-40"
                value={ratingValue}
                onChange={(event) => setRatingValue(event.target.value)}
              >
                {Array.from({ length: 10 }, (_, idx) => String(idx + 1)).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  )
                )}
              </select>
              <span className="text-xs text-[var(--muted)]">
                {user ? "Signed in" : "Sign in to publish"}
              </span>
            </div>

            <textarea
              className="min-h-[120px] rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] placeholder:text-[var(--muted)]"
              placeholder="Write your review (optional)"
              value={bodyValue}
              onChange={(event) => setBodyValue(event.target.value)}
            />

            {reviewError && (
              <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                {reviewError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-none bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[color:var(--surface-strong)] disabled:text-[var(--muted)]"
                disabled={submitting || !user}
              >
                {submitting ? "Posting..." : "Post review"}
              </button>
              {!user && (
                <a
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                  href={`${apiUrl}/auth/spotify`}
                >
                  Continue with Spotify
                </a>
              )}
            </div>
          </form>

          <div className="space-y-4">
            {reviewsLoading && (
              <p className="text-sm text-[var(--muted)]">Loading reviews...</p>
            )}
            {!reviewsLoading && reviews.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                No reviews yet. Be the first to write one.
              </p>
            )}
            {reviews.map((review) => (
              <div
                key={review.id}
                className="border border-[color:var(--border)] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--foreground)]">
                    {review.user.display_name || review.user.spotify_id}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {formatDate(review.created_at)}
                  </div>
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--accent-strong)]">
                  Rating {review.rating}/10
                </div>
                {review.body && (
                  <p className="mt-3 text-sm text-[var(--foreground)]">
                    {review.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
