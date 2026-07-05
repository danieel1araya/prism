// Shared iTunes Search API proxy logic.
// Used by both the Vercel serverless handler (api/search.js) and the
// Vite dev-server middleware (vite.config.js) so localhost and prod
// behave identically without a second implementation to keep in sync.

export async function searchItunes({ term = "", limit = "50", country = "US" }) {
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=${limit}&country=${country}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    },
  );

  const text = await response.text();

  try {
    return { status: 200, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { error: true, message: text } };
  }
}
