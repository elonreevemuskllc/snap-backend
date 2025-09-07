import express from "express";
import { ApifyClient } from "apify-client";
import { LRUCache } from "lru-cache";

const router = express.Router();
const cache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 30 }); // 30 min
const ALLOWED = /^[a-zA-Z0-9._-]{1,32}$/;

router.post("/lookup", async (req, res) => {
  try {
    const raw = (req.body?.username || "").trim();
    if (!raw) return res.status(400).json({ error: "username required" });

    const username = raw.replace(/^@/, "");
    if (!ALLOWED.test(username)) {
      return res.status(400).json({ error: "invalid username format" });
    }

    const cacheKey = `snap:${username}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ok: true, cached: true, data: cached });

    const profileUrl = `https://www.snapchat.com/add/${encodeURIComponent(username)}`;

    const client = new ApifyClient({
      token: process.env.APIFY_TOKEN,
    });

    const input = { profilesInput: [profileUrl] };
    const run = await client.actor("MSBBFGGih1fp9gKDq").call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items?.length) {
      return res.status(404).json({ error: "Profile not found or no public data" });
    }

    const out = sanitize(items[0]);
    cache.set(cacheKey, out);
    return res.json({ ok: true, data: out });

  } catch (err) {
    console.error("[snap lookup] error:", err?.message || err);
    return res.status(502).json({ error: "Upstream error or timeout" });
  }
});

function sanitize(item) {
  return {
    profileUrl: item.profileUrl ?? null,
    displayName: item.username1 ?? null,
    username: item.username2 ?? null,
    profileImageUrl: item.profileImageUrl ?? null,
    profileDescription: item.profileDescription ?? null,
    profileLocation: item.profileLocation ?? null,
    subscribers: typeof item.subscribers === "number" ? item.subscribers : null,
    category: item.category ?? null,
    websiteUrl: item.websiteUrl ?? null,
    snapcodeImageUrl: item.snapcodeImageUrl ?? null,
    stories: Array.isArray(item.stories) ? item.stories : [],
    spotlights: Array.isArray(item.spotlights) ? item.spotlights : [],
    fetchedAt: new Date().toISOString(),
  };
}

export default router;
