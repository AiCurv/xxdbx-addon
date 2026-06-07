# Errors Database

A living database of errors encountered during Stremio addon development. Each entry documents the error, its root cause, and the proven fix.

---

## How to Use This Database

1. **Before building a new addon**, scan this database for known issues with the target platform.
2. **When you hit an error**, check here first before debugging.
3. **When you find a new error**, add it here following the format below.

### Entry Format

```
### ERROR #N: [Short Title]
- **Date:** [Date discovered]
- **Context:** Where/when this error occurs
- **Symptom:** What you see (error message, behavior)
- **Root Cause:** Why it happens
- **Fix:** Proven solution
- **Prevention:** How to avoid it in the future
```

---

### ERROR #1: /video/{id}/ without slug returns 404

- **Date:** 2026-05-22
- **Context:** KVS (Kernel Video Sharing) platform sites. Attempting to fetch video pages using only the numeric ID.
- **Symptom:** HTTP 404 Not Found when requesting `https://example.com/video/12345/`. The page simply does not exist at this URL.
- **Root Cause:** KVS requires the URL slug after the ID. The full URL format is `/video/{id}/{slug}/`. Without the slug, the server returns 404. This is a server-side routing requirement, not a bug.
- **Fix:** Use `/embed/{id}/` instead. The embed URL works with just the numeric ID and does not require the slug. Example: `https://example.com/embed/12345/` returns the video player page successfully.
- **Prevention:** Always use embed URLs for stream extraction on KVS sites. If you need the video page metadata (title, description, poster), store the full URL (including slug) in your catalog/meta data, or fetch it from the model/channel page where full URLs are available.

---

### ERROR #2: Vercel serverless function timeout (10s default on hobby)

- **Date:** 2026-05-22
- **Context:** Vercel Hobby (free) plan deployments. Addons making multiple HTTP requests or scraping complex pages.
- **Symptom:** The addon works locally but returns 504 Gateway Timeout on Vercel after ~10 seconds. Some catalog pages load, others time out. Stream extraction may fail for slow sites.
- **Root Cause:** Vercel Hobby plan enforces a 10-second execution limit on serverless functions. If your handler takes longer than 10 seconds (including all HTTP requests, HTML parsing, etc.), Vercel terminates the function.
- **Fix:**
  1. Keep handlers fast — minimize the number of HTTP requests per handler call.
  2. Cache responses where possible using a simple in-memory cache or Vercel KV.
  3. Set `maxDuration: 10` in `vercel.json` (already the max for Hobby).
  4. Consider upgrading to Vercel Pro for 60-second timeout.
  5. For catalog handlers, return results immediately even if some items are incomplete — Stremio will request more.
- **Prevention:** Test with Vercel's timeout in mind from the start. Use `vercel dev` locally to simulate serverless conditions. Time your handlers and optimize the slow ones before deploying.

---

### ERROR #3: KVS sites need slug in video URLs

- **Date:** 2026-05-22
- **Context:** Any KVS (Kernel Video Sharing) platform site. Storing or constructing video URLs for meta/stream handlers.
- **Symptom:** 404 errors when trying to access video pages. The video exists on the site but your addon cannot reach it because the URL is incomplete.
- **Root Cause:** KVS video page URLs follow the pattern `/video/{id}/{slug}/`. The slug is derived from the video title and is required by the server's URL routing. You cannot skip it. However, the embed URL `/embed/{id}/` does NOT require the slug.
- **Fix:**
  1. **Best approach:** Use embed URLs (`/embed/{id}/`) for stream extraction. They work with just the numeric ID.
  2. **Alternative:** Store the full video URL (including slug) in the catalog/meta data. When scraping model pages, extract the complete `href` from video links and save it.
  3. **If you must construct the URL:** You can try to derive the slug from the video title by converting it to a URL-safe string (lowercase, spaces to hyphens, remove special characters), but this is fragile and may break if the site changes slug generation.
- **Prevention:** When scraping model/channel pages, always extract and store the full video URL. Do not try to reconstruct it later. The embed URL is the safest fallback.

---

### ERROR #4: defaultVideoId causes infinite back-loop in Stremio

- **Date:** 2026-05-22
- **Context:** Stremio addon using `channel` type for model/creator pages. Setting `behaviorHints.defaultVideoId` in the meta response.
- **Symptom:** When user clicks on a channel detail page, Stremio auto-navigates to play one video. Pressing Back returns to the channel page, which immediately auto-navigates again. User is stuck in an infinite loop and cannot browse the video list.
- **Root Cause:** `behaviorHints.defaultVideoId` tells Stremio to auto-open a specific video's streams when the detail page loads. Combined with Stremio's `guessStream: true` flag in `useMetaDetails`, this creates: detail page → auto-play video → press back → detail page reloads → auto-play video → infinite loop.
- **Fix:** DO NOT set `defaultVideoId` in channel meta responses. Remove it entirely:
  ```javascript
  // WRONG — causes infinite back loop:
  const meta = {
      id: "model_kwini-kim",
      type: "channel",
      videos: [...],
      behaviorHints: { defaultVideoId: "video_12345" }  // REMOVE THIS
  };

  // CORRECT — no defaultVideoId, user clicks videos manually:
  const meta = {
      id: "model_kwini-kim",
      type: "channel",
      videos: [...],
      // NO behaviorHints.defaultVideoId
  };
  ```
- **Prevention:** Never use `defaultVideoId` for channel type content. It was designed for movie type (where there's one implicit video) but causes navigation loops in channel type. Let users click videos from the list manually.

---

### ERROR #5: Meta `links` field enables clickable cross-navigation in Stremio

- **Date:** 2026-05-22
- **Context:** Stremio video detail pages. User wants to click on model/tag links to navigate to their dedicated pages.
- **Symptom:** Video detail pages show no clickable links for models or tags. User cannot navigate to model pages or tag pages from a video they're watching.
- **Root Cause:** The `links` field in the meta response was not being populated. Stremio's `links` array is the official way to add clickable navigation links on detail pages.
- **Fix:** Add the `links` array to your movie-type meta response with `stremio:///detail/` deep link URLs:
  ```javascript
  const meta = {
      id: "video_12345",
      type: "movie",
      name: "Video Title",
      links: [
          { name: "Kwini Kim", category: "Models", url: "stremio:///detail/channel/model_kwini-kim" },
          { name: "Asian", category: "Categories", url: "stremio:///detail/channel/cat_asian" },
          { name: "petite", category: "Tags", url: "stremio:///detail/channel/tag_petite" },
      ]
  };
  ```
  Stremio deep link URL formats:
  - `stremio:///detail/{type}/{id}` — Navigate to another meta item's detail page
  - `stremio:///detail/{type}/{id}/{videoId}` — Navigate to a specific video within a series/channel
  - `stremio:///search?search={query}` — Open the search page with a query
  - `stremio:///discover/{encodedManifestUrl}/{type}/{catalogId}?{extra}` — Open a specific catalog filtered
  Links are grouped visually by `category` in Stremio's UI.
- **Prevention:** Always populate the `links` field for movie-type meta. Stremio routes `stremio:///detail/` deep links to the appropriate addon based on `idPrefixes` in the manifest.

---

### ERROR #6: Model page videos not sorted by date (random order)

- **Date:** 2026-05-22
- **Context:** KVS model pages. When user opens a model's channel page in Stremio, videos appear in random order instead of newest first.
- **Symptom:** User has to scroll through many old videos to find the newest content.
- **Root Cause:** KVS model pages default to a non-chronological sort.
- **Fix:** Append `?sort_by=post_date` to the model page URL:
  ```javascript
  const modelUrl = `${BASE_URL}/models/${slug}/?sort_by=post_date`;
  const pUrl = `${BASE_URL}/models/${slug}/${page}/?sort_by=post_date`;
  ```
  Available KVS sort options: `post_date`, `video_viewed`, `rating`, `duration`, `most_commented`, `most_favourited`, `video_viewed_today`
- **Prevention:** Always use explicit sort parameters when scraping model/channel pages.

---

### ERROR #7: Video dates all show the same (today's date)

- **Date:** 2026-05-22
- **Context:** Stremio channel video list. The `released` field.
- **Symptom:** All videos show the same date, making it impossible to tell which is newer.
- **Root Cause:** KVS sites don't expose publication dates on video cards. Using `new Date().toISOString()` gives all videos the same date.
- **Fix:** Use video IDs as date proxy. KVS uses auto-incrementing IDs, so higher = newer:
  ```javascript
  function videoIdToDate(videoId) {
      const id = parseInt(videoId);
      const baseDate = new Date("2020-01-01").getTime();
      const msPerId = (6.4 * 365.25 * 24 * 60 * 60 * 1000) / 500000;
      return new Date(baseDate + id * msPerId).toISOString();
  }
  ```
  Adjust calibration constants based on your target site's ID range.
- **Prevention:** Never use `new Date().toISOString()` for all videos.

---

### ERROR #8: Embed page canonical URL gives full video page for tag extraction

- **Date:** 2026-05-22
- **Context:** KVS sites. Need tags/models/categories from a video page but only have the embed URL.
- **Symptom:** Video meta handler can only get basic info from embed page. No model/tag links.
- **Root Cause:** Embed page is minimal - no tag/category links. Full video page needs slug which we don't have.
- **Fix:** The embed page contains `<link rel="canonical">` pointing to the full video page:
  ```javascript
  const embedHtml = await fetchPage(`${BASE_URL}/embed/${videoId}/`);
  const e$ = cheerio.load(embedHtml);
  const canonicalUrl = e$('link[rel="canonical"]').attr('href');
  if (canonicalUrl) {
      const fullHtml = await fetchPage(canonicalUrl);
      // Extract models, categories, tags from full page
  }
  ```
- **Prevention:** Always check for canonical URLs when scraping embed pages.

---

### ERROR #9: KVS /get_stream/ URLs — User-Agent redirect discovery enables native MP4 playback (v2.0.0 Fix)

- **Date:** 2026-05-22
- **Context:** KVS (Kernel Video Sharing) sites like thepornbang.com. The `/get_stream/{videoId}-{quality}.mp4?md5=...&timestamp=...` URLs.
- **Symptom (v1.x):** Stremio showed "none of the available extractors" error. The `/get_stream/` URLs triggered file downloads in browsers instead of streaming. The old v1.x implementation used `externalUrl` (proxy player page), which opened a browser/webview — users HATED this experience.
- **Root Cause — The Misunderstanding:** We initially assumed `/get_stream/` was an encrypted anti-leeching system because:
  1. Browsers received `200 HTML` (a player page) instead of video
  2. `curl` with default UA received `200 HTML`
  3. The URLs triggered file downloads in browsers

  **The real behavior** is that `/get_stream/` is a **User-Agent-based redirect gateway**:
  - **Browser UA** → server returns `200 HTML` (player page)
  - **Non-browser/media-player UA** → server returns `302 redirect` → CDN (vkuser.net)

  The CDN serves proper MP4 files with `Content-Type: video/mp4`, `Accept-Ranges: bytes`, `206 Partial Content` support, and `Content-Length` headers.

- **Key Discovery — Stremio's Player UA:** Stremio's internal media player uses its own User-Agent (not a browser UA) when requesting stream URLs. This means:
  1. Addon returns `stream.url` with the `/get_stream/` URL (with auth params)
  2. Stremio's player requests the URL with its non-browser UA
  3. ThePornBang returns `302 → CDN redirect`
  4. CDN serves the MP4 with proper streaming headers
  5. **Video plays natively in Stremio — NO browser, NO webview!**

- **Fix (v2.0.0):** Extract `get_stream` URLs from the page's `flashvars` JavaScript and return them as direct `url` streams.
- **Prevention:** Always test stream URLs with Stremio's actual User-Agent, not just browser or curl. Never assume a URL is unplayable just because it triggers a download in a browser.

---

### ERROR #10: Cloudflare-protected target sites block server-side scraping

- **Date:** 2026-05-22
- **Context:** Sites like hdthot.com that are behind Cloudflare's JavaScript challenge.
- **Symptom:** Server-side fetch (node-fetch, curl without proper headers) returns HTTP 403 with Cloudflare challenge page. The addon works in browser but fails on Vercel.
- **Root Cause:** Cloudflare requires JavaScript execution to solve a challenge before serving content. Server-side Node.js fetch cannot execute JavaScript.
- **Fix:** Avoid Cloudflare-protected sites entirely. If you must use one, try proper browser-like headers, CORS proxy, or FlareSolverr.
- **Prevention:** Always test target site accessibility before building an addon.

---

### ERROR #11: CDN Stream 403 — IP-Bound Tokens (xxdbx.com)

- **Date:** 2026-06-07
- **Context:** xxdbx.com (d.v1d30.com CDN). Direct MP4 URLs returned from the addon's stream handler.
- **Symptom:** Direct MP4 URLs return 403 Forbidden when accessed from the user's Stremio device, even though the same URLs return 200 OK when accessed from the Vercel serverless function.
- **Root Cause:** xxdbx.com's CDN generates stream URLs with tokens that are **IP-bound**. The token is valid only from the IP that fetched the video page. When Vercel fetches the page and returns the MP4 URL, Stremio tries to play it from the user's IP, which gets 403.
- **Fix:** Create a stream proxy endpoint on Vercel that fetches the video page fresh on each request (from Vercel's IP), extracts the MP4 URL, and pipes the data back. Must support HTTP Range requests (206 Partial Content) for seeking.
- **Detection:** If direct MP4 URLs work from your server but 403 from a different IP, tokens are IP-bound.
- **Prevention:** Test stream URLs from multiple IPs before assuming they work.

---

### ERROR #12: Custom content types (e.g., "curvcorn") break Library and cross-navigation

- **Date:** 2026-05-30
- **Context:** Any Stremio addon using a custom content type instead of standard "channel" and "movie" types.
- **Symptom:** 1) Clicking tag/star navigation links does nothing. 2) Stars/tags cannot be added to Library. 3) Channel-type meta with `videos` array doesn't render properly. 4) Search doesn't return channel results.
- **Root Cause:** Stremio only understands `movie`, `series`, and `channel` natively. Custom types are treated as unknown — no channel features, no library support, no cross-navigation.
- **Fix:** Use the W1MP pattern — standard `channel` and `movie` types. Stars, tags, and channels become `channel` type with `videos` array. Videos become `movie` type with streams.
- **Prevention:** ALWAYS use standard Stremio types. Custom types should ONLY be used if you specifically want isolation and don't need library/cross-navigation.

---

### ERROR #13: Related section pollution — 20+ random models in streams

- **Date:** 2026-06-01
- **Context:** Stremio addon stream handler scraping video pages for model/tag links.
- **Symptom:** The first few tag/star streams are correct, but then hundreds of random unrelated models appear as streams.
- **Root Cause:** Broad DOM selectors like `$("a[href*='/models/']")` pick up links from the "Related Videos" or "Suggested" section below the video, not just the video's own metadata.
- **Fix:** Scope DOM selectors to the video's own metadata section only. Use `.js-models-list a[href*='/models/']` or `.top-player-items-wrap a` instead of broad selectors.
- **Prevention:** Always inspect the DOM structure before writing selectors. Use browser DevTools to identify the specific container that holds the video's own metadata, and scope selectors to that container.

---

### ERROR #14: "No Streams found" from channel page videos

- **Date:** 2026-06-01
- **Context:** Stremio addon where channel pages (stars, tags) list videos, but clicking those videos gives "No Streams found".
- **Symptom:** Channel meta returns videos with IDs like `video_12345`, but the stream handler doesn't recognize them because the stream resource's `idPrefixes` doesn't include all the prefixes used by channel pages.
- **Root Cause:** When a user clicks a video from a channel page, Stremio sends the video ID to the stream handler. If the stream handler's `idPrefixes` in the manifest doesn't include the prefixes used by channel page video IDs, Stremio can't find a matching stream handler.
- **Fix:** Add all possible video ID prefixes to the stream resource's `idPrefixes`:
  ```javascript
  {
      name: "stream",
      types: ["movie"],
      idPrefixes: ["video_", "model_", "tag_"]  // Include ALL prefixes that channel pages use
  }
  ```
  Also implement an `extractVideoId()` function that handles compound IDs:
  ```javascript
  function extractVideoId(id) {
      // Handle compound IDs from channel pages
      const parts = id.split('_');
      const prefix = parts[0] + '_';
      if (prefix === 'video_') return parts.slice(1).join('_');
      // For compound IDs like "video_12345", extract just the video part
      return id.replace(/^(video|model|tag)_/, '');
  }
  ```
- **Prevention:** Always verify that `idPrefixes` in the stream resource covers all ID formats that channel pages might produce.

---

### ERROR #15: Missing clickable navigation streams — only meta links, no stream externalUrl

- **Date:** 2026-06-01
- **Context:** Building a Stremio addon with channel-type entities (stars, models, tags, channels).
- **Symptom:** Users open a video and see only quality options (1080p, 720p, 360p). No clickable star/model/channel/tag entries in the streams list.
- **Root Cause:** `meta.links` and `stream.externalUrl` appear in DIFFERENT places in Stremio's UI. Meta links appear on the detail page info tab. Stream externalUrl appears in the STREAMS list where users spend most time.
- **Fix:** Add `externalUrl` streams with `stremio:///detail/channel/` deep links to your stream handler. This is MANDATORY. Every video stream response MUST include playable streams AND navigation streams.
- **Prevention:** When building ANY Stremio addon with channel-type entities, ALWAYS implement BOTH `meta.links` and `stream.externalUrl`. If you only implement one, implement the STREAM navigation.

---

### ERROR #16: Base64-encoded IDs break meta handler — channels return garbled names and 0 videos

- **Date:** 2026-06-07
- **Context:** Stremio addon for xxdbx.com. The previous AI agent (v5.0.0) used base64url encoding for star/channel/tag IDs (e.g., `star_RGVsbGEgQ2F0ZQ` for "Della Cate"). When users clicked navigation streams, the meta handler received these base64 IDs but could NOT decode them back to the original URL slug.
- **Symptom:** Clicking on any star/channel/tag in Stremio shows "No information found about this" or garbled unicode names with 0 videos. Example: `star_RGVsbGEgQ2F0ZQ` triggers meta handler to visit `/stars/RGVsbGEgQ2F0ZQ` on xxdbx.com, which returns 404, then fallback returns garbled name.
- **Root Cause:** The ID encoding was NOT reversible in the meta handler. The v5.0.0 implementation used `Buffer.from(name).toString('base64url')` for encoding but the meta handler failed to decode these IDs back to URL-safe slugs for scraping. Base64url encoding:
  1. Produces opaque strings that can't be used as URL paths
  2. Requires explicit decoding step that was missing or broken
  3. The meta handler tried to construct URLs like `/stars/RGVsbGEgQ2F0ZQ` instead of `/stars/Della%20Cate`
- **Fix:** Use `encodeURIComponent()` / `decodeURIComponent()` instead of base64 for ID encoding. This is fully reversible and produces URL-safe IDs:
  ```javascript
  // ENCODING (stream handler):
  const starId = "star_" + encodeURIComponent(starName);
  // e.g., "Della Cate" → "star_Della%20Cate"

  // DECODING (meta handler):
  const starName = decodeURIComponent(id.replace("star_", ""));
  // e.g., "star_Della%20Cate" → "Della Cate"

  // URL construction:
  const url = "https://xxdbx.com/stars/" + encodeURIComponent(starName);
  // → "https://xxdbx.com/stars/Della%20Cate"
  ```
- **Prevention:**
  1. **NEVER use base64/base64url for IDs** — it's opaque, can't be used as URL paths, and requires explicit decoding
  2. **ALWAYS use encodeURIComponent/decodeURIComponent** — standard web encoding, fully reversible, URL-safe
  3. **Test the encode→decode→URL→scrape roundtrip** before deploying
  4. **Verify with curl** — test `/meta/channel/star_Della%20Cate.json` returns proper data

---

### ERROR #17: xxdbx.com video detail page has ALL metadata — no embed page needed

- **Date:** 2026-06-07
- **Context:** Stremio addon for xxdbx.com. Unlike KVS sites (w1mp.com) where you need `/embed/{id}/` for stream extraction and canonical URL for tags, xxdbx.com is simpler.
- **Symptom:** AI agents coming from KVS experience try to use embed pages and canonical URL tricks on xxdbx.com, adding unnecessary complexity and extra HTTP requests.
- **Root Cause:** xxdbx.com is NOT a KVS site. It's a custom platform with plain HTML + jQuery + FluidPlayer. The video detail page (`/view/{id}`) contains EVERYTHING in one page: title, player with direct MP4 sources, description, poster, stars, channels, tags, dates.
- **Fix:** Use `/view/{id}` directly for BOTH stream extraction AND metadata. No embed page needed. No canonical URL trick needed. Single HTTP request gives everything.
- **Prevention:** Before building an addon, inspect the target site's HTML structure first. Don't assume it's KVS just because it's an adult site.

---

## Quick Reference: Error → Fix Lookup

| # | Error | Quick Fix |
|---|-------|-----------|
| 1 | /video/{id}/ 404 | Use /embed/{id}/ |
| 2 | Vercel timeout | Cache, optimize, minimize HTTP requests |
| 3 | KVS slug required | Use embed URLs or store full URLs |
| 4 | defaultVideoId back loop | Remove defaultVideoId from channel meta |
| 5 | No clickable model/tag links | Add `links` array with stremio:///detail/ deep links |
| 6 | Videos not sorted by date | Add ?sort_by=post_date to model page URLs |
| 7 | All video dates same | Use videoId as date proxy with calibration |
| 8 | Can't get tags from embed | Use canonical link from embed page |
| 9 | KVS /get_stream/ "error 1" | Use direct `url` streams — Stremio's UA triggers 302 CDN redirect |
| 10 | Cloudflare blocks scraping | Switch target or use Cloudflare-solving proxy |
| 11 | CDN stream 403 from user IP | Stream proxy on Vercel (same IP for fetch+play) |
| 12 | Custom type breaks library/cross-nav | Use standard channel+movie types |
| 13 | Related section pollution | Use scoped selectors, NOT broad $("a[href*='/models/']") |
| 14 | "No Streams found" from channel | Add all prefixes to stream idPrefixes + extractVideoId() |
| 15 | No clickable navigation in streams | Add `externalUrl` streams with stremio:///detail/channel/ deep links |
| 16 | Base64 IDs break meta handler | Use encodeURIComponent/decodeURIComponent instead of base64 |
| 17 | Unnecessary embed pages on non-KVS sites | Check site structure first — some sites have everything on /view/{id} |

---

## Platform-Specific Error Rates

| Platform | Known Errors | Risk Level |
|----------|-------------|------------|
| KVS | 6 (Errors #1, #3, #6, #7, #8, #9) | Medium — embed URLs + direct streams + sort params solve most issues |
| Vercel Hobby | 1 (Error #2) | High — 10s timeout is a real constraint |
| WordPress | 0 | Low — standard HTML, easy to scrape |
| Cloudflare-protected | 1 (Error #10) | High — may block requests entirely |
| Custom content types | 1 (Error #12) | Critical — breaks library + cross-navigation |
| xxdbx.com (Custom) | 3 (Errors #11, #16, #17) | Medium — stream proxy + URI encoding solves all |

---

*Last updated: 2026-06-07*
