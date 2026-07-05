import { searchItunes } from "./_itunes.js";

export default async function handler(req, res) {
  const { term = "", limit = "50", country = "US" } = req.query;

  try {
    const { status, body } = await searchItunes({ term, limit, country });
    return res.status(status).json(body);
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message,
    });
  }
}
