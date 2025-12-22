"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlassIcon,
  StarIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

type CompanySuggestion = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  exchange: string | null;
};

export default function NavBar() {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const debounceRef = useRef<number | null>(null);

  // Debounced search for suggestions from DB
  useEffect(() => {
    const q = search.trim();

    // reset dropdown if empty
    if (!q) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    // debounce
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/company/search?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch (e) {
        console.error(e);
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search]);

  const goToCompany = (ticker: string) => {
    const t = String(ticker ?? "").trim().toUpperCase();
    if (!t) return;

    setOpen(false);
    setSuggestions([]);
    setSearch("");

    // We keep your existing caching behavior:
    // company page/API route handles fetch/insert/refresh logic.
    router.push(`/company/${t}`);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  const input = search.trim();
  if (!input) return;

  // Heuristic: treat short/uppercase-ish inputs as tickers
  const maybeTicker = input.replace(/\s+/g, "").toUpperCase();
  const looksLikeTicker = /^[A-Z.-]{1,6}$/.test(maybeTicker);

  try {
    // 1) If it looks like a ticker, try ticker path first (uses your caching)
    if (looksLikeTicker) {
      const res = await fetch(
        `/api/company?ticker=${encodeURIComponent(maybeTicker)}`
      );

      if (res.ok) {
        setOpen(false);
        setSuggestions([]);
        setSearch("");
        router.push(`/company/${maybeTicker}`);
        return;
      }
      // If ticker fetch fails, fall through and try name search
    }

    // 2) Name search in YOUR DB (no FMP calls)
    const searchRes = await fetch(
      `/api/company/search?q=${encodeURIComponent(input)}`
    );

    if (!searchRes.ok) {
      const text = await searchRes.text().catch(() => "");
      console.error("DB search failed:", { status: searchRes.status, body: text });
      alert("Search failed.");
      return;
    }

    const matches = (await searchRes.json()) as CompanySuggestion[];

    if (!matches || matches.length === 0) {
      alert("No matching company found. Try searching for this company's ticker symbol or try another company.");
      return;
    }

    // Best match = first result (we can improve ranking later)
    const best = matches[0];
    const t = best.ticker.toUpperCase();

    setOpen(false);
    setSuggestions([]);
    setSearch("");
    router.push(`/company/${t}`);
  } catch (err) {
    console.error("Search error:", err);
    alert("Something went wrong. Check console logs.");
  }
};

  return (
    <nav className="flex items-center justify-between bg-white shadow px-4 py-1 w-full sticky top-0 z-50">
      <Link
        href="/"
        className="flex items-center gap-2 hover:opacity-80 transition"
      >
        <img src="/logo.svg" alt="VStocks logo" className="w-8 h-8" />
        <span className="font-bold text-xl text-black">VStocks</span>
      </Link>

      <div className="relative w-full max-w-md mx-4">
        <form onSubmit={handleSubmit} className="flex w-full">
          <input
            type="text"
            placeholder="Search ticker or name (e.g., AAPL or Apple)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => {
              if (suggestions.length) setOpen(true);
            }}
            className="flex-grow p-2 border rounded-l-lg text-black"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 flex items-center gap-1 rounded-r-lg hover:bg-blue-700"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
            Search
          </button>
        </form>

        {/* Dropdown */}
        {open && (loading || suggestions.length > 0) && (
          <div className="absolute mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden">
            {loading && (
              <div className="px-4 py-3 text-sm text-gray-600">
                Searching…
              </div>
            )}

            {!loading && suggestions.map((s) => (
              <button
                key={s.ticker}
                onClick={() => goToCompany(s.ticker)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
              >
                {s.logoUrl ? (
                  <img
                    src={s.logoUrl}
                    alt=""
                    className="w-7 h-7 rounded"
                  />
                ) : (
                  <div className="w-7 h-7 rounded bg-gray-200" />
                )}

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-black truncate">
                    {s.name} <span className="text-gray-500">({s.ticker})</span>
                  </div>
                  {s.exchange ? (
                    <div className="text-xs text-gray-500">{s.exchange}</div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex space-x-4">
        <button className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-200 text-black hover:bg-blue-400">
          <UserIcon className="w-4 h-4" />
          Sign In
        </button>
        <button className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-300 text-black hover:bg-yellow-500">
          <StarIcon className="w-4 h-4" />
          Review
        </button>
      </div>
    </nav>
  );
}