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
  position?: number;
};

type List = {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  is_ranked: boolean;
  items: ListItem[];
};

type AlbumCard = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
};

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  favorite_genres: string[];
  favorite_album_ids: string[];
};

type SearchAlbum = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  release_date: string;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [genresInput, setGenresInput] = useState("");
  const [favoriteAlbumIds, setFavoriteAlbumIds] = useState<string[]>([]);
  const [favoriteQuery, setFavoriteQuery] = useState("");
  const [favoriteSuggestions, setFavoriteSuggestions] = useState<SearchAlbum[]>([]);
  const [favoriteSearching, setFavoriteSearching] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return null;
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const parsedGenres = useMemo(() => {
    return genresInput
      .split(",")
      .map((genre) => genre.trim())
      .filter((genre) => genre.length > 0);
  }, [genresInput]);

  const avatarInitial = (
    displayName || user?.spotify_id || "J"
  ).charAt(0).toUpperCase();
  const profileDisplayName =
    profile?.display_name || user?.display_name || user?.spotify_id || "You";
  const profileGenres = profile?.favorite_genres || [];
  const profileFavorites = profile?.favorite_album_ids || [];
  const profileBio = profile?.bio || "";

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

    async function loadProfile() {
      if (!user) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError(null);
      try {
        const response = await fetch(`${apiUrl}/me/profile`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) {
            setProfile(null);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          const nextProfile = data.profile || null;
          setProfile(nextProfile);
          setDisplayName(nextProfile?.display_name || "");
          setBio(nextProfile?.bio || "");
          setGenresInput(nextProfile?.favorite_genres?.join(", ") || "");
          setFavoriteAlbumIds(nextProfile?.favorite_album_ids || []);
          setAvatarUrl(nextProfile?.avatar_url || null);
        }
      } catch (err) {
        if (!cancelled) {
          setProfileError("Could not load profile.");
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, user]);

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
    if (favoriteQuery.trim().length < 2) {
      setFavoriteSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setFavoriteSearching(true);
      try {
        const response = await fetch(
          `${apiUrl}/spotify/search?query=${encodeURIComponent(
            favoriteQuery.trim()
          )}&limit=5`,
          { credentials: "include" }
        );
        const data = await response.json();
        setFavoriteSuggestions(Array.isArray(data.albums) ? data.albums : []);
      } catch (err) {
        setFavoriteSuggestions([]);
      } finally {
        setFavoriteSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiUrl, favoriteQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbums() {
      const reviewIds = reviews.map((review) => review.spotify_album_id);
      const listIds = lists.flatMap((list) =>
        list.items.map((item) => item.spotify_album_id)
      );
      const favoriteIds = favoriteAlbumIds;

      const validIds = Array.from(
        new Set([...reviewIds, ...listIds, ...favoriteIds])
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
  }, [apiUrl, reviews, lists, favoriteAlbumIds, albumMap]);

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString();
  }

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    const genres = parsedGenres.slice(0, 10);
    if (parsedGenres.length > 10) {
      setProfileError("Limit favorite genres to 10.");
      return;
    }

    if (favoriteAlbumIds.length > 3) {
      setProfileError("Pick up to 3 favorite albums.");
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    try {
      const response = await fetch(`${apiUrl}/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          favorite_genres: genres,
          favorite_album_ids: favoriteAlbumIds,
        }),
      });

      if (response.status === 401) {
        setProfileError("Sign in to update your profile.");
        return;
      }

      if (!response.ok) {
        setProfileError("Could not update profile.");
        return;
      }

      const data = await response.json();
      const nextProfile = data.profile || null;
      setProfile(nextProfile);
      setDisplayName(nextProfile?.display_name || "");
      setBio(nextProfile?.bio || "");
      setGenresInput(nextProfile?.favorite_genres?.join(", ") || "");
      setFavoriteAlbumIds(nextProfile?.favorite_album_ids || []);
      setAvatarUrl(nextProfile?.avatar_url || avatarUrl);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              display_name: nextProfile?.display_name || prev.display_name,
            }
          : prev
      );
      setEditingProfile(false);
    } catch (err) {
      setProfileError("Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAvatarUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setAvatarUploading(true);
    setProfileError(null);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const response = await fetch(`${apiUrl}/me/avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (response.status === 401) {
        setProfileError("Sign in to update your photo.");
        return;
      }

      if (!response.ok) {
        setProfileError("Could not upload photo.");
        return;
      }

      const data = await response.json();
      if (data.avatar_url) {
        setAvatarUrl(data.avatar_url);
        setProfile((prev) =>
          prev ? { ...prev, avatar_url: data.avatar_url } : prev
        );
      }
    } catch (err) {
      setProfileError("Could not upload photo.");
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  }

  function handleFavoriteAdd(album: SearchAlbum) {
    setFavoriteError(null);
    if (favoriteAlbumIds.includes(album.id)) {
      return;
    }
    if (favoriteAlbumIds.length >= 3) {
      setFavoriteError("You can only pick 3 favorite albums.");
      return;
    }
    setFavoriteAlbumIds((prev) => [...prev, album.id]);
    setFavoriteQuery("");
    setFavoriteSuggestions([]);
  }

  function handleFavoriteRemove(albumId: string) {
    setFavoriteAlbumIds((prev) => prev.filter((id) => id !== albumId));
  }

  function handleEditToggle(nextValue: boolean) {
    if (!nextValue && profile) {
      setDisplayName(profile.display_name || "");
      setBio(profile.bio || "");
      setGenresInput(profile.favorite_genres?.join(", ") || "");
      setFavoriteAlbumIds(profile.favorite_album_ids || []);
      setAvatarUrl(profile.avatar_url || null);
      setFavoriteQuery("");
      setFavoriteSuggestions([]);
      setFavoriteError(null);
      setProfileError(null);
    }
    setEditingProfile(nextValue);
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

        {user && (
          <section className="space-y-6 border border-[color:var(--border)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Profile
              </h2>
              <button
                type="button"
                className="rounded-none border border-[color:var(--border)] px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[var(--accent)]"
                onClick={() => handleEditToggle(!editingProfile)}
              >
                {editingProfile ? "Cancel" : "Edit profile"}
              </button>
            </div>

            {profileLoading && (
              <div className="border border-[color:var(--border)] p-4 text-sm text-[var(--muted)]">
                Loading profile...
              </div>
            )}

            {!profileLoading && !editingProfile && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface-strong)]">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Profile avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[var(--muted-strong)]">
                          {avatarInitial}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Display name
                      </p>
                      <p className="text-lg font-semibold text-[var(--foreground)]">
                        {profileDisplayName}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {user.spotify_id}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    {profileFavorites.length} favorite
                    {profileFavorites.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="border border-[color:var(--border)] p-4 text-sm text-[var(--foreground)]">
                  {profileBio
                    ? profileBio
                    : "Add a bio to share your listening style."}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                      Favorite genres
                    </p>
                    {profileGenres.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">
                        No favorite genres yet.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                        {profileGenres.map((genre) => (
                          <span
                            key={genre}
                            className="border border-[color:var(--border)] px-2 py-1"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                      Top albums
                    </p>
                    {profileFavorites.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">
                        Pick your top 3 albums to show them here.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-3">
                        {profileFavorites.map((albumId, index) => {
                          const album = albumMap[albumId];
                          return (
                            <div
                              key={albumId}
                              className="border border-[color:var(--border)] p-3"
                            >
                              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                                #{index + 1}
                              </div>
                              <div className="mt-2 flex items-center gap-3">
                                <div className="h-12 w-12 overflow-hidden border border-[color:var(--border)] bg-[#0b0d12]">
                                  {album?.image ? (
                                    <img
                                      src={album.image}
                                      alt={`${album.name} cover`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : null}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-[var(--foreground)]">
                                    {album?.name || "Album"}
                                  </p>
                                  <p className="text-xs text-[var(--muted)]">
                                    {album?.artists?.join(", ") || albumId}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!profileLoading && editingProfile && (
              <form onSubmit={handleProfileSave} className="space-y-6">
                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className="w-full max-w-xs space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="relative h-20 w-20 overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface-strong)]">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Profile avatar"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[var(--muted-strong)]">
                            {avatarInitial}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                          Profile photo
                        </p>
                        <input
                          type="file"
                          accept="image/*"
                          className="text-xs text-[var(--muted)]"
                          onChange={handleAvatarUpload}
                          disabled={avatarUploading}
                        />
                        {avatarUploading && (
                          <p className="text-xs text-[var(--muted-strong)]">
                            Uploading...
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Display name
                      </label>
                      <input
                        className="w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Your display name"
                      />
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Bio
                      </label>
                      <textarea
                        className="min-h-[120px] w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                        placeholder="Tell people about your taste."
                        value={bio}
                        onChange={(event) => setBio(event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Favorite genres
                      </label>
                      <input
                        className="w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                        placeholder="R&B, Soul, Jazz"
                        value={genresInput}
                        onChange={(event) => setGenresInput(event.target.value)}
                      />
                      {parsedGenres.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                          {parsedGenres.slice(0, 10).map((genre) => (
                            <span
                              key={genre}
                              className="border border-[color:var(--border)] px-2 py-1"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Top 3 albums
                      </label>
                      <input
                        className="w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                        placeholder="Search for favorite albums"
                        value={favoriteQuery}
                        onChange={(event) => setFavoriteQuery(event.target.value)}
                      />
                      {favoriteSearching && (
                        <p className="text-xs text-[var(--muted)]">
                          Searching...
                        </p>
                      )}
                      {favoriteSuggestions.length > 0 && favoriteQuery.trim().length > 1 && (
                        <div className="border border-[color:var(--border)] bg-[color:var(--surface)]">
                          {favoriteSuggestions.map((album) => (
                            <button
                              key={album.id}
                              type="button"
                              className="flex w-full items-center gap-3 border-b border-[color:var(--border)] px-4 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[color:var(--surface-strong)]"
                              onClick={() => handleFavoriteAdd(album)}
                            >
                              <div className="h-10 w-10 overflow-hidden border border-[color:var(--border)] bg-[#0b0d12]">
                                {album.image ? (
                                  <img
                                    src={album.image}
                                    alt={`${album.name} cover`}
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <div>
                                <p className="text-sm font-semibold">
                                  {album.name}
                                </p>
                                <p className="text-xs text-[var(--muted)]">
                                  {album.artists.join(", ")}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {favoriteError && (
                        <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                          {favoriteError}
                        </div>
                      )}
                      <div className="grid gap-3 sm:grid-cols-3">
                        {favoriteAlbumIds.length === 0 && (
                          <p className="text-xs text-[var(--muted)]">
                            Pick up to three albums.
                          </p>
                        )}
                        {favoriteAlbumIds.map((albumId, index) => {
                          const album = albumMap[albumId];
                          return (
                            <div
                              key={albumId}
                              className="border border-[color:var(--border)] p-3"
                            >
                              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                                <span>#{index + 1}</span>
                                <button
                                  type="button"
                                  className="text-[var(--muted)] hover:text-[var(--foreground)]"
                                  onClick={() => handleFavoriteRemove(albumId)}
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="mt-2 flex items-center gap-3">
                                <div className="h-12 w-12 overflow-hidden border border-[color:var(--border)] bg-[#0b0d12]">
                                  {album?.image ? (
                                    <img
                                      src={album.image}
                                      alt={`${album.name} cover`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : null}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-[var(--foreground)]">
                                    {album?.name || "Album"}
                                  </p>
                                  <p className="text-xs text-[var(--muted)]">
                                    {album?.artists?.join(", ") || albumId}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {profileError && (
                  <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                    {profileError}
                  </div>
                )}

                <button
                  type="submit"
                  className="rounded-none bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[color:var(--surface-strong)] disabled:text-[var(--muted)]"
                  disabled={profileSaving}
                >
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
              </form>
            )}
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
                  <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                    {list.is_ranked ? "Ranked list" : "Unranked list"}
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
                          className="relative w-full overflow-hidden border border-[color:var(--border)] bg-[#0b0d12] pb-[100%]"
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
                    <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden border border-[color:var(--border)] bg-[#0b0d12]">
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
