import express from "express";
import { ApifyClient } from "apify-client";
import { LRUCache } from "lru-cache";

const router = express.Router();
const cache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 30 }); // 30 min

// Fonction pour appeler Apify avec timeout et retry
async function getSnapFromApify(username) {
  const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
    timeoutMillis: 15000
  });

  const profileUrl = `https://www.snapchat.com/add/${encodeURIComponent(username)}`;
  
  console.log(`[Apify] Fetching profile for: ${username}`);
  
  const run = await client.actor("MSBBFGGih1fp9gKDq").call({
    profilesInput: [profileUrl]
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  
  if (!items || items.length === 0) {
    throw new Error("Profile not found or no data returned");
  }

  return {
    profileUrl: items[0].profileUrl ?? null,
    displayName: items[0].username1 ?? null,
    username: items[0].username2 ?? username,
    profileImageUrl: items[0].profileImageUrl ?? null,
    profileDescription: items[0].profileDescription ?? null,
    profileLocation: items[0].profileLocation ?? null,
    subscribers: typeof items[0].subscribers === "number" ? items[0].subscribers : null,
    category: items[0].category ?? null,
    websiteUrl: items[0].websiteUrl ?? null,
    snapcodeImageUrl: items[0].snapcodeImageUrl ?? null,
    stories: Array.isArray(items[0].stories) ? items[0].stories : [],
    spotlights: Array.isArray(items[0].spotlights) ? items[0].spotlights : [],
    fetchedAt: new Date().toISOString(),
  };
}

// Route POST principale
router.post("/lookup", async (req, res) => {
  const u = String(req.body?.username || "").trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9._-]{1,32}$/.test(u)) {
    return res.status(400).json({ error: "invalid_username" });
  }

  // Vérifier le cache d'abord
  const cacheKey = `snap:${u}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({ ok: true, cached: true, data: cached });
  }

  // Retry logic avec backoff
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await getSnapFromApify(u);
      
      // Mettre en cache et retourner
      cache.set(cacheKey, data);
      return res.json({ ok: true, cached: false, data });
      
    } catch (e) {
      console.error(`[Attempt ${attempt}] upstream:`, e?.message, e?.statusCode);
      
      // Si c'est le dernier essai, retourner l'erreur
      if (attempt === 2) {
        return res.status(502).json({ error: "upstream_error", detail: String(e?.message).slice(0, 200) });
      }
      
      // Sinon attendre un peu avant de retry
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
});

// Route GET de test
router.get("/lookup", async (req, res) => {
  const u = String(req.query.username ?? "").trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9._-]{1,32}$/.test(u)) {
    return res.status(400).json({ error: "invalid_username" });
  }

  try {
    const data = await getSnapFromApify(u);
    res.json({ ok: true, cached: false, data });
  } catch (e) {
    console.error("GET upstream:", e?.message);
    res.status(502).json({ error: "upstream_error" });
  }
});

export default router;