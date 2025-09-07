import express from "express";
import { ApifyClient } from "apify-client";
import { LRUCache } from "lru-cache";

const router = express.Router();
const cache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 30 }); // 30 min
const ALLOWED = /^[a-zA-Z0-9._-]{1,32}$/;
const UA = "snap-backend/1.0 (+railway)";

// Fonction améliorée pour appeler Apify avec retry et timeout
async function fetchSnapProfile(username) {
  const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
    timeoutMillis: 15000
  });

  const profileUrl = `https://www.snapchat.com/add/${encodeURIComponent(username)}`;
  
  try {
    console.log(`Fetching profile for: ${username}`);
    
    const run = await client.actor("MSBBFGGih1fp9gKDq").call({
      profilesInput: [profileUrl]
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (!items || items.length === 0) {
      throw new Error("Profile not found or no data returned");
    }

    return items[0];
  } catch (error) {
    console.error("Apify fetch error:", error?.name, error?.message, error?.statusCode);
    throw error;
  }
}

// Route POST avec gestion d'erreur améliorée
router.post("/lookup", async (req, res) => {
  try {
    const u = String(req.body?.username ?? "").trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9._-]{1,32}$/.test(u)) {
      return res.status(400).json({ error: "invalid_username" });
    }

    const cacheKey = `snap:${u}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ok: true, cached: true, data: cached });

    // Retry logic avec backoff
    let lastError;
    for (let i = 0; i < 2; i++) {
      try {
        const profile = await fetchSnapProfile(u);
        
        const sanitized = {
          profileUrl: profile.profileUrl ?? null,
          displayName: profile.username1 ?? null,
          username: profile.username2 ?? u,
          profileImageUrl: profile.profileImageUrl ?? null,
          profileDescription: profile.profileDescription ?? null,
          profileLocation: profile.profileLocation ?? null,
          subscribers: typeof profile.subscribers === "number" ? profile.subscribers : null,
          category: profile.category ?? null,
          websiteUrl: profile.websiteUrl ?? null,
          snapcodeImageUrl: profile.snapcodeImageUrl ?? null,
          stories: Array.isArray(profile.stories) ? profile.stories : [],
          spotlights: Array.isArray(profile.spotlights) ? profile.spotlights : [],
          fetchedAt: new Date().toISOString(),
        };

        cache.set(cacheKey, sanitized);
        return res.json({ ok: true, cached: false, data: sanitized });
        
      } catch (e) {
        lastError = e;
        console.error(`Attempt ${i + 1} failed for ${u}:`, e?.name, e?.message, e?.statusCode);
        if (i === 0) await new Promise(r => setTimeout(r, 800)); // backoff 800ms
      }
    }

    // Si toutes les tentatives échouent - diagnostic détaillé
    console.error("Final lookup error for", u, ":", lastError?.name, lastError?.message);
    
    const isTimeout = lastError?.name === "AbortError" || 
                     lastError?.message?.includes("timeout") ||
                     lastError?.message?.includes("ETIMEDOUT");
    
    const isAuth = lastError?.statusCode === 401 || 
                   lastError?.statusCode === 403 ||
                   lastError?.message?.includes("401") || 
                   lastError?.message?.includes("403") ||
                   lastError?.message?.includes("Unauthorized") ||
                   lastError?.message?.includes("authentication");
    
    const isNotFound = lastError?.statusCode === 404 ||
                       lastError?.message?.includes("Profile not found");

    if (isAuth) {
      return res.status(502).json({ 
        error: "auth_error", 
        detail: "Invalid or missing APIFY_TOKEN - check Railway env vars" 
      });
    }

    if (isNotFound) {
      return res.status(404).json({ 
        error: "profile_not_found", 
        detail: `No public profile found for username: ${u}` 
      });
    }
    
    res.status(502).json({ 
      error: isTimeout ? "upstream_timeout" : "upstream_error", 
      detail: String(lastError?.message || lastError).slice(0, 300),
      statusCode: lastError?.statusCode || null
    });

  } catch (error) {
    console.error("Router error:", error?.name, error?.message);
    res.status(500).json({ 
      error: "internal_error", 
      detail: String(error?.message).slice(0, 300) 
    });
  }
});

// Route GET de test (point 6)
router.get("/lookup", async (req, res) => {
  try {
    const u = String(req.query.username ?? "").trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9._-]{1,32}$/.test(u)) {
      return res.status(400).json({ error: "invalid_username", detail: "Username must be 1-32 chars, alphanumeric + ._-" });
    }

    const cacheKey = `snap:${u}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ok: true, cached: true, data: cached });

    // Version simplifiée pour test GET
    const profile = await fetchSnapProfile(u);
    
    const sanitized = {
      profileUrl: profile.profileUrl ?? null,
      displayName: profile.username1 ?? null,
      username: profile.username2 ?? u,
      profileImageUrl: profile.profileImageUrl ?? null,
      profileDescription: profile.profileDescription ?? null,
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, sanitized);
    res.json({ ok: true, cached: false, data: sanitized });

  } catch (error) {
    console.error("GET lookup error:", error?.name, error?.message, error?.statusCode);
    res.status(502).json({ 
      error: "upstream_error", 
      detail: String(error?.message).slice(0, 300),
      statusCode: error?.statusCode || null
    });
  }
});

export default router;