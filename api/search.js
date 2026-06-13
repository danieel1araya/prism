export default async function handler(req, res) {
  const {
    term = "",
    limit = "50",
    country = "US"
  } = req.query;

  try {
    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=${limit}&country=${country}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      }
    );

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch {
      return res.status(response.status).json({
        error: true,
        message: text,
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message,
    });
  }
}