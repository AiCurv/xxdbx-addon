# Site Patterns Database

Documented site structure and scraping patterns for building Stremio addons. Each entry provides a complete map of a site's structure, extraction methods, and gotchas.

---

## How to Use This Database

1. **Before building an addon for a new site**, check if the site (or a similar platform) is already documented here.
2. **When you discover a new site pattern**, add it here following the format below.
3. **When a site changes its structure**, update the existing entry with the new information.

### Entry Format

```
## Site: [domain]
- **Platform:** [KVS / WordPress / Custom / Unknown]
- **Cloudflare:** [Yes / No]
- **Last Verified:** [Date]
- [URL patterns, extraction methods, gotchas]
```

---

## Site: w1mp.com

- **Platform:** KVS (Kernel Video Sharing)
- **Cloudflare:** No
- **Last Verified:** 2026-05-22

### URL Patterns

#### Models (Channels)

| Pattern | URL | Notes |
|---------|-----|-------|
| Model page | `/models/{slug}/` | All videos by this model. Use as channel meta. |
| Model page (paginated) | `/models/{slug}/{page}/` | Page 1 is `/models/{slug}/`, page 2+ adds page number. |

#### Videos

| Pattern | URL | Notes |
|---------|-----|-------|
| Video page (full) | `/video/{id}/{slug}/` | **Slug is REQUIRED.** Without slug → 404. |
| Embed page | `/embed/{id}/` | **Works without slug.** Use this for stream extraction. |

#### Search

| Pattern | URL | Notes |
|---------|-----|-------|
| Search | `/search/?q={query}` | Standard query parameter. |

#### Categories

| Pattern | URL | Notes |
|---------|-----|-------|
| Category page | `/categories/{slug}/` | Browse videos by category. |
| Category page (paginated) | `/categories/{slug}/{page}/` | Same pagination as models. |

### Video Source Extraction

**Method: Direct MP4 from embed page**

1. Fetch `/embed/{id}/`
2. Parse HTML with cheerio
3. Find `<video>` → `<source>` tag
4. Extract `src` attribute — this is the direct MP4 URL

```javascript
// Extraction code for w1mp.com
async function extractStream(videoId) {
    const embedUrl = `https://w1mp.com/embed/${videoId}/`;
    const html = await fetchPage(embedUrl);
    const $ = cheerio.load(html);

    // Primary: <video><source> tag
    let videoUrl = $('video source').attr('src');

    // Fallback: <video> src attribute
    if (!videoUrl) {
        videoUrl = $('video').attr('src');
    }

    // Fallback: JavaScript variable in page scripts
    if (!videoUrl) {
        const scripts = $('script').text();
        const match = scripts.match(/video_url\s*[:=]\s*["']([^"']+)["']/);
        if (match) {
            videoUrl = match[1];
        }
    }

    if (videoUrl) {
        // Ensure absolute URL
        if (!videoUrl.startsWith('http')) {
            videoUrl = `https://w1mp.com${videoUrl}`;
        }
        return {
            url: videoUrl,
            title: 'Direct MP4',
            behaviorHints: { notWebReady: false },
        };
    }

    // Last resort: return embed as externalUrl
    return {
        externalUrl: embedUrl,
        title: 'Embed Player',
        behaviorHints: { notWebReady: true },
    };
}
```

### Video Tokens

- **v-acctoken**: This token appears in video page requests. It is **base64-encoded** and **time-limited**.
- The token is typically embedded in the page's JavaScript and is used to authorize the video stream URL.
- For direct MP4 extraction from the embed page, the token is usually already included in the extracted URL.
- If the token has expired, the MP4 URL will return 403 Forbidden. Re-fetching the embed page generates a new token.

### Scraping Notes

1. **No Cloudflare** — direct HTTP requests work without browser emulation.
2. **Embed URLs are the key** — always use `/embed/{id}/` instead of `/video/{id}/{slug}/`.
3. **Rate limiting** — the site may rate-limit aggressive requests. Add a small delay between requests if scraping multiple pages.
4. **Pagination** — model pages are paginated. Page 1 has no page number in the URL. Subsequent pages use `/{page}/`.
5. **Model slug** — the model slug is used in the URL and is typically a lowercase, hyphenated version of the model's name.

### Recommended Addon Architecture for w1mp.com

```
Content Type: channel (for models)
              movie (for individual videos if needed)

Catalog:
  - type: channel, id: "models"
    - Browse: /models/ (paginated)
    - Search: /search/?q=...

Meta:
  - channel: /models/{slug}/ → videos array
  - movie: /embed/{id}/ → metadata from embed page

Stream:
  - /embed/{id}/ → <video><source> → MP4 URL
```

---

## Quick Reference: Platform Detection

When approaching a new site, use these signals to identify the platform:

| Signal | KVS | WordPress | Custom |
|--------|-----|-----------|--------|
| URL pattern `/video/{id}/{slug}/` | ✅ | ❌ | ❌ |
| URL pattern `/embed/{id}/` | ✅ | ❌ | Sometimes |
| `<meta name="generator" content="Kernel Video Sharing">` | ✅ | ❌ | ❌ |
| `<meta name="generator" content="WordPress">` | ❌ | ✅ | ❌ |
| `/wp-json/` API endpoint | ❌ | ✅ | ❌ |
| `wp-content` in asset URLs | ❌ | ✅ | ❌ |
| KVS-specific JavaScript (kt_player, kvs) | ✅ | ❌ | ❌ |
| Model pages with `/models/{slug}/` | ✅ | ❌ | Sometimes |

---

## Site: thepornbang.com

- **Platform:** KVS (Kernel Video Sharing) — Enhanced with encrypted anti-leeching
- **Cloudflare:** Behind Cloudflare CDN (but accessible with proper headers)
- **Last Verified:** 2026-06-07

### URL Patterns

#### Home & Browsing

| Pattern | URL | Notes |
|---------|-----|-------|
| Homepage | `/home35/` | Multiple sections: Premium 4K, Latest, Trending, Popular, Channels, Pornstars |
| All Videos | `/videos_27/{page}/` | Paginated |
| Most Viewed | `/most-viewed_17/{page}/` | Paginated |
| Top Rated | `/top-rated_15/{page}/` | Paginated |
| Search | `/search/{query}/{page}/` | Search results, paginated |

#### Categories

| Pattern | URL | Notes |
|---------|-----|-------|
| Categories List | `/categories_16/` | All categories with thumbnails |
| Category Detail | `/category/{slug}_c{id}/{page}/` | Videos in category. Slug+ID suffix format. |

#### Models (Pornstars)

| Pattern | URL | Notes |
|---------|-----|-------|
| Pornstars List | `/pornstars_19/{page}/` | Also `/pornstars_19/name/` for alphabetical |
| Pornstar Detail | `/pornstar/{slug}_p{id}/{page}/` | Videos by pornstar |

#### Tags

| Pattern | URL | Notes |
|---------|-----|-------|
| Tags List | `/tags_34/` | All tags with video counts |
| Tag Detail | `/tag/{slug}_t{id}/{page}/` | Videos with tag |

#### Studios (Channels)

| Pattern | URL | Notes |
|---------|-----|-------|
| Studios List | `/studios_32/` | All studios/channels |
| Studio Detail | `/studio/{slug}_s{id}/{page}/` | Videos by studio |

#### Videos

| Pattern | URL | Notes |
|---------|-----|-------|
| Video page | `/video/{slug}_v{id}/` | Full page with player, metadata, related videos |
| Stream token | `/get_stream/{contentId}-{quality}.mp4?md5=...&timestamp=...` | **ENCRYPTED — see below** |

### URL Convention

All entity URLs use the format: `/{entity_type}/{slug}_{typeChar}{id}/`
- Type chars: `c`=category, `p`=pornstar, `s`=studio, `t`=tag, `v`=video
- Example: `/category/big-tits_c18/` → slug="big-tits", type=c, id=18

### Video Source Extraction — CRITICAL

**⚠️ ThePornBang uses KVS encrypted anti-leeching (generate_mp4). Direct MP4 URLs DO NOT work.**

The `/get_stream/` URLs return `"error 1"` when fetched programmatically because KVS requires a 2-step CryptoJS decryption process via `generate_mp4()`:

1. Video page contains: `generate_mp4(encryptedData, key, commaIds, videoId)`
2. The function decrypts `encryptedData` using AES-256-CBC with PBKDF2-SHA512
3. Makes XHR GET to decrypted URL
4. Decrypts response
5. Makes XHR POST to `/get_video/` with re-encrypted data
6. Only then are the `/get_stream/` URLs unlocked

**The kt_player.js is heavily obfuscated** — string array rotation, hex encoding, variable name mangling. Replicating in Node.js is impractical.

**✅ Proven Fix: Proxy Player Page**

Create a serverless function that:
1. Fetches the video page HTML
2. Extracts `kt_player.js` script + `generate_mp4()` call + `flashvars` object
3. Serves a minimal HTML page with the player
4. The site's own JS handles decryption and playback
5. Stremio opens this via `externalUrl` in its built-in web view

```javascript
// Stream handler
streams.push({
    name: 'Curvcorn',
    title: 'Play (Proxy Player)',
    externalUrl: `${ADDON_BASE}/play/${videoSegment}`,
    notWebReady: true,
});
```

### Scraping Notes

1. **Must use `Accept-Encoding: identity`** — without this, requests timeout or return empty
2. **Keep-alive agent recommended** — reusing connections significantly improves speed
3. **Retry logic needed** — site can be flaky, 2-3 retries with 1.5s delay recommended
4. **Lazy-loaded images** — thumbnails use `data-original` attribute, not `src`
5. **31 categories, 45+ models, 22+ channels, 527+ tags** — all accessible
6. **Search works** — `/search/{query}/1/` returns video cards

### Video Card DOM Selectors

```css
div.row.item a.thumb         → Video card link
a.thumb[title]               → Video title
a.thumb[href]                → Video URL (contains /video/{slug}_v{id}/)
img.thumb-img[data-original]  → Thumbnail (lazy-loaded)
span.duration span.value      → Duration (e.g. "33:49")
span.views span.value         → Views (e.g. "49.76K")
div.rating                    → Rating percentage
span.qhd                      → 4K quality badge
```

### Recommended Addon Architecture

```
Content Type: curvcorn (custom type, appears as separate section in Discover)

Catalogs:
  - Home: /home35/
  - Popular: /most-viewed_17/{page}/
  - Top Rated: /top-rated_15/{page}/
  - Categories: /categories_16/
  - Models: /pornstars_19/{page}/
  - Channels: /studios_32/
  - Tags: /tags_34/
  - Search: /search/{query}/{page}/

Meta:
  - Video (v_ prefix): /video/{segment}/ → title, description, poster, cast, genre, links
  - Model (m_ prefix): /pornstar/{segment}/ → name, poster, videos array
  - Category (c_ prefix): /category/{segment}/ → name, poster, videos array
  - Studio (s_ prefix): /studio/{segment}/ → name, poster, videos array
  - Tag (t_ prefix): /tag/{segment}/ → name, videos array

Stream:
  - Proxy player page (/play/{segment}) with externalUrl
  - Fallback: direct link to video page on ThePornBang
```

---

## Site: xxdbx.com

- **Platform:** Custom (plain HTML + jQuery + FluidPlayer)
- **Cloudflare:** No
- **Last Verified:** 2026-06-07
- **Status:** ✅ WORKS with stream proxy — MP4 tokens are IP-bound, requires server-side proxy

### URL Patterns

#### Home & Browsing

| Pattern | URL | Notes |
|---------|-----|-------|
| Homepage (newest) | `/` or `/?page=N` | 30 videos per page |
| Most Popular | `/most-popular` or `/most-popular?page=N` | Paginated |
| Search/Tag | `/search/{query}` or `/search/{query}?page=N` | Same format for tags and search |
| Star/Pornstar | `/stars/{name}` | URL-encoded name, e.g. `/stars/Bad%20Bella` |
| Channel | `/channels/{name}` | e.g. `/channels/LegalPorno.com` |
| Date | `/dates/{date}` | e.g. `/dates/2026` or `/dates/2026-03-09` |

#### Videos

| Pattern | URL | Notes |
|---------|-----|-------|
| Video detail | `/view/{id}` | e.g. `/view/22325971680` |
| Stream CDN | `//d.v1d30.com/{TOKEN}/{VIDEO_ID}{QUALITY_CODE}/{QUALITY}.mp4` | Direct MP4, time-limited token |

### Video Card DOM Selectors

```css
div.v                              → Video card container
a[href^='/view/']                  → Video link (href contains /view/{id})
.v_title                           → Video title
.v_pic                             → Thumbnail img (use data-src for lazy, src for immediate)
.v_dur                             → Duration (e.g. "34:34", "1:22:41")
.v_preview[data-preview]           → Preview clip URL (//prev.xxdbx.com/{ID}3230.mp4)
.v_tags a[href^='/stars/']         → Star/pornstar link
.v_tags a[href^='/channels/']      → Channel/studio link
.v_tags a[href^='/dates/']         → Date link
.pagina a                          → Pagination links
```

### Video Detail Page Selectors

```css
article h1                         → Video title
video#p                            → Video player element
video#p[poster]                    → Poster image URL
video#p source[src]                → Stream URL (direct MP4!)
video#p source[title]              → Quality label ("360p", "720p", "1080p")
.tags a[href^='/search/']          → Genre/category tags (Anal, Hardcore, Gonzo, etc.)
.tags a[href^='/stars/']           → Star/pornstar links
.tags a[href^='/channels/']        → Channel/studio links
#desc                              → Description (optional, may be absent)
```

### Video Source Extraction

**Method: Direct MP4 from `<source>` tags — SIMPLEST POSSIBLE**

1. Fetch `/view/{id}` (the video detail page)
2. Parse HTML with cheerio
3. Find `video#p source` elements
4. Extract `src` (stream URL) and `title` (quality label)
5. Return as direct `url` streams — Stremio plays them natively!

```javascript
// Extraction code for xxdbx.com
async function extractStreams(videoId) {
    const detailUrl = `https://xxdbx.com/view/${videoId}`;
    const html = await fetchPage(detailUrl);
    const $ = cheerio.load(html);
    const streams = [];

    $("video#p source").each((_, el) => {
        const src = $(el).attr("src");
        const quality = $(el).attr("title"); // "360p", "720p", "1080p"
        if (src) {
            streams.push({
                name: "XXDBX",
                title: quality,
                url: src.startsWith("//") ? "https:" + src : src,
                behaviorHints: { notWebReady: false },
            });
        }
    });

    return streams;
}
```

### Stream URL Format

```
https://d.v1d30.com/{TOKEN}/{VIDEO_ID}{QUALITY_CODE}/{QUALITY}.mp4
```

| Part | Example | Description |
|------|---------|-------------|
| CDN host | `d.v1d30.com` | Stream CDN |
| TOKEN | `wp5z_h0Ie5ZX1F89k8Gkc45PQ` | Time-limited, unique per video+quality |
| VIDEO_ID | `22325971` | Base video identifier |
| QUALITY_CODE | `103`, `258`, `786` | Varies per quality (not a simple formula) |
| QUALITY | `360`, `720`, `1080` | Resolution in pixels |

**Always 3 qualities available: 360p, 720p, 1080p**

### Stream Token Behavior — ⚠️ CRITICAL: IP-BOUND + TIME-LIMITED

- Tokens are **IP-bound AND time-limited** — they only work from the IP that fetched the video page
- Each quality gets a **different token**
- Tokens are generated **fresh on each page load**
- **Direct MP4 URLs will 403 from the user's device** — the token was generated for Vercel's server IP, not the user's IP
- **FIX: Stream Proxy** — the addon uses a `/play/{videoId}/{quality}.mp4` proxy endpoint on Vercel that:
  1. Receives the play request from Stremio
  2. Fetches the video page fresh from xxdbx.com (from Vercel's IP)
  3. Extracts the MP4 URL with valid token
  4. Forwards the MP4 data (including Range requests for seeking) back to Stremio
- This ensures the token is always generated from and used by the same IP (Vercel's)
- Range request support (HTTP 206) is critical for Stremio's built-in player to seek

### Key Advantages Over Other Sites

1. **No anti-leeching encryption** — unlike KVS sites (thepornbang.com), no generate_mp4() decryption needed
2. **No Cloudflare** — direct HTTP requests work perfectly
3. **Simple HTML** — no SPA, no JavaScript rendering needed
4. **Direct MP4** — streams play natively in Stremio's built-in player
5. **No webview/externalUrl needed** — NO TV BROWSER!
6. **3 quality levels** — 360p, 720p, 1080p always available
7. **No embed page needed** — the main `/view/{id}` page has everything

### Scraping Notes

1. **No Cloudflare** — direct HTTP requests work without browser emulation
2. **Lazy-loaded images** — thumbnails use `data-src` for lazy, `src` for first few images
3. **30 videos per page** — consistent across all listing types
4. **No master category/tag list page** — categories and tags are discovered from video cards
5. **Search doubles as tag browser** — `/search/Anal` shows all "Anal" tagged videos
6. **Stars can have multiple names** — e.g., "Bad Bella" and "Bad Bella XO" are separate star pages
7. **Preview clips are publicly accessible** — `//prev.xxdbx.com/{ID}3230.mp4` returns 200 OK with `video/mp4`

### Thumbnail URL Pattern

| Type | Pattern | Example |
|------|---------|---------|
| Listing thumb | `/{VIDEO_ID}64{SUFFIX}.jpg` | `/2232597164360.jpg` |
| Detail poster | `/{VIDEO_ID}96{SUFFIX}.jpg` | `/2232597196360.jpg` |

The `64` and `96` likely indicate dimensions (640px, 960px width). SUFFIX varies per video.

### Recommended Addon Architecture for xxdbx.com (v3.0.0 — W1MP Pattern)

**⚠️ IMPORTANT: Use `channel` + `movie` types, NOT custom types like `curvcorn`!**

Custom types (like `curvcorn`) don't support Stremio's "Add to Library" feature for channels. The W1MP pattern uses standard `channel` and `movie` types, which enables full library support, proper channel pages with video lists, and cross-navigation that actually works when clicked.

```
Content Types: channel (for stars, channels, tags, dates) + movie (for videos)

ID Prefixes:
  - video_    → /view/{id} (movie type — has streams)
  - star_     → /stars/{name} (channel type — has videos array, addable to library)
  - ch_       → /channels/{name} (channel type — has videos array, addable to library)
  - tag_      → /search/{tag} (channel type — has videos array, addable to library)
  - date_     → /dates/{date} (channel type — has videos array, addable to library)

ID Encoding: Star/channel/tag names are URI-encoded (encodeURIComponent) for URL-safe Stremio IDs
  - e.g., "Della Cate" → star_Della%20Cate
  - Decode with: decodeURIComponent(encoded)
  - ⚠️ NEVER use base64/base64url for IDs — it breaks the meta handler (Error #16)

Catalogs:
  - type: channel, id: "stars"
    - Search: extracts unique stars from /search/{query} results
    - Browse: extracts stars from home + popular page video cards
  - type: channel, id: "channels"
    - Search: extracts unique channels from /search/{query} results
    - Browse: extracts channels from home + popular page video cards
  - type: channel, id: "tags"
    - Search: fetches video detail to extract /search/ genre tags
  - type: channel, id: "dates"
    - Search: direct date lookup (YYYY-MM-DD or YYYY format)
    - Browse: extracts dates from home + popular page video cards
  - type: movie, id: "video_search" (search-only)
    - Search: /search/{query} returns video results
  - type: movie, id: "latest"
    - Browse: / (paginated with ?page=N)
  - type: movie, id: "popular"
    - Browse: /most-popular (paginated)

Meta:
  - movie (video_ prefix): /view/{id} → title, poster, genres, cast, links
    - links[] includes cross-nav to stars, channels, tags, dates
  - channel (star_ prefix): /stars/{name} → name, videos array (up to 5 pages)
  - channel (ch_ prefix): /channels/{name} → name, videos array (up to 5 pages)
  - channel (tag_ prefix): /search/{tag} → name, videos array (up to 3 pages)
  - channel (date_ prefix): /dates/{date} → name, videos array (up to 3 pages)

Stream (movie type only, video_ prefix):
  1. Video streams: Direct MP4 URLs from <source> tags (IP-bound tokens — may need proxy)
     - Up to 3 qualities: 1080p FHD, 720p HD, 360p
     - NOTE: As of v6.0.0, direct MP4 URLs work from Vercel. If 403s occur, add stream proxy.
  2. Star cross-nav: externalUrl → stremio:///detail/channel/star_{URI-encoded}
     - ⭐ Clickable star navigation streams (MANDATORY in v6.0.0+)
  3. Channel cross-nav: externalUrl → stremio:///detail/channel/ch_{URI-encoded}
     - 🏠 Clickable channel navigation streams (MANDATORY in v6.0.0+)
  4. Tag cross-nav: externalUrl → stremio:///detail/channel/tag_{URI-encoded}
     - 🏷️ Clickable tag navigation streams (MANDATORY in v6.0.0+, limit 10 max)
  5. Date cross-nav: externalUrl → stremio:///detail/channel/date_{URI-encoded}
     - 📅 Clickable date navigation streams (NEW in v6.0.0)

Cross-Navigation Pattern (W1MP-style):
  - Everything in the "red circle" (date, channel, star, tags) becomes a CHANNEL
  - Users can add channels to their Stremio Library for auto-updating
  - Clicking a cross-nav stream opens the channel page in Stremio
  - Channel pages show a list of videos (like episodes) that users can click to play
  - Search returns both videos (movie results) and channels (channel results)
```

### Deployment

- **Vercel URL:** https://xxdbx-addon.vercel.app
- **Manifest URL:** https://xxdbx-addon.vercel.app/manifest.json
- **GitHub Repo:** AiCurv/curvcorn-stremio (xxdbx-addon subfolder)
- **Version:** 6.0.0 (W1MP pattern — channel+movie types, URI-encoded IDs, library support, clickable navigation streams with dates)
- **Previous Version (5.0.0):** BROKEN — used base64url IDs that broke the meta handler (see Error #16)

---

*Last updated: 2026-06-07*
