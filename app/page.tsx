"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Website Audit</h1>
      <p className="mb-6 text-gray-600">Enter a website URL to check it.</p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="example.com"
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading || !url}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Checking..." : "Audit"}
        </button>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {result && (
        <pre className="mt-6 overflow-auto rounded bg-gray-100 p-4 text-sm text-black">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}