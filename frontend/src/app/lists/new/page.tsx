"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

export default function NewListPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRanked, setIsRanked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("List title is required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/me/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          is_ranked: isRanked,
        }),
      });

      if (response.status === 401) {
        setError("Sign in to create a list.");
        return;
      }

      if (!response.ok) {
        setError("Could not create list.");
        return;
      }

      const data = await response.json();
      if (data.list?.id) {
        router.push(`/lists/${data.list.id}`);
      } else {
        router.push("/profile");
      }
    } catch (err) {
      setError("Could not create list.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 text-[color:var(--foreground)]">
      <main className="mx-auto w-full max-w-4xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--border)] pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
              Jukebox
            </p>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              Create a new list
            </h1>
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

        {authChecked && !user && (
          <div className="border border-[color:var(--border)] p-6 text-sm text-[var(--foreground)]">
            <p>You need to sign in to create lists.</p>
            <a
              className="mt-4 inline-flex items-center justify-center rounded-none bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)]"
              href={`${apiUrl}/auth/spotify`}
            >
              Continue with Spotify
            </a>
          </div>
        )}

        {user && (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 border border-[color:var(--border)] p-6"
          >
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Title
              </label>
              <input
                className="w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                placeholder="List title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Description
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                placeholder="Optional description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-3 border border-[color:var(--border)] px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-none border border-[color:var(--border)] bg-[color:var(--surface-strong)] text-[var(--accent)]"
                checked={isRanked}
                onChange={(event) => setIsRanked(event.target.checked)}
              />
              Ranked list
            </label>

            {error && (
              <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="rounded-none bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[color:var(--surface-strong)] disabled:text-[var(--muted)]"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create list"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
