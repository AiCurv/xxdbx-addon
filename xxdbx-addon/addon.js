const { addonBuilder } = require("stremio-addon-sdk");
const cheerio = require("cheerio");
const fetch = require("node-fetch");

const BASE_URL = "https://xxdbx.com";
const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: "https://xxdbx.com/",
};

// ─── Cache (5 min TTL) ─────────────────────────────────────────────

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function cachedFetch(url) {
    const now = Date.now();
    const cached = cache.get(url);
    if (cached && now - cached.ts < CACHE_TTL) return cached.html;
    const res = await fetch(url, { headers: HEADERS, timeout: 15000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const html = await res.text();
    cache.set(url, { html, ts: now });
    return html;
}

// ─── Helpers ────────────────────────────────────────────────────────

function fixUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return BASE_URL + url;
    return url;
}

// ═══════════════════════════════════════════════════════════════════
// V9.0.0: HEX ENCODING — the fix for "No information found" bug!
//
// Root cause: Stremio's client lowercases IDs in stremio:/// deep links.
// base64url is case-sensitive (A vs a = different bytes), so when Stremio
// lowercased "star_YWxsc2V4" → "star_ywxsc2v4", decoding produced garbage.
//
// Hex encoding only uses 0-9 and a-f — all lowercase, case-insensitive.
// Even if Stremio lowercases the ID, hex decoding still works perfectly.
// ═══════════════════════════════════════════════════════════════════

function enc(str) {
    return Buffer.from(str, "utf-8").toString("hex");
}
function dec(encoded) {
    return Buffer.from(encoded, "hex").toString("utf-8");
}

// ─── Video Card Parser (listing pages) ─────────────────────────────

function parseVideoCards(html) {
    const $ = cheerio.load(html);
    const videos = [];

    $("div.v").each((_, el) => {
        const $el = $(el);
        const linkEl = $el.find('a[href^="/view/"]').first();
        const href = linkEl.attr("href") || "";
        const videoMatch = href.match(/\/view\/(\d+)/);
        if (!videoMatch) return;
        const videoId = videoMatch[1];

        const title = $el.find(".v_title").first().text().trim();
        if (!title) return;

        const img = $el.find(".v_pic").first();
        const poster = fixUrl(img.attr("data-src") || img.attr("src") || "");
        const duration = $el.find(".v_dur").first().text().trim();

        // Extract stars/channels from video card tags
        const stars = [];
        const channels = [];
        $el.find(".v_tags a").each((__, a) => {
            const aHref = $(a).attr("href") || "";
            const aName = $(a).text().trim();
            if (aHref.startsWith("/stars/")) {
                stars.push({ name: aName, slug: aHref.replace("/stars/", "") });
            } else if (aHref.startsWith("/channels/")) {
                channels.push({ name: aName, slug: aHref.replace("/channels/", "") });
            }
        });

        videos.push({ videoId, title, poster, duration, href: fixUrl(href), stars, channels });
    });

    return videos;
}

// ─── Tag Extractor (from listing page video cards) ──────────────────

function extractTagsFromCards(html) {
    const $ = cheerio.load(html);
    const stars = [];
    const channels = [];
    const tags = [];
    const dates = [];
    const starSeen = new Set();
    const chSeen = new Set();
    const tagSeen = new Set();
    const dateSeen = new Set();

    $(".v_tags a").each((_, el) => {
        const href = $(el).attr("href") || "";
        const name = $(el).text().trim();
        if (!name) return;
        if (href.startsWith("/stars/") && !starSeen.has(name)) {
            starSeen.add(name);
            stars.push({ name, slug: href.replace("/stars/", "") });
        } else if (href.startsWith("/channels/") && !chSeen.has(name)) {
            chSeen.add(name);
            channels.push({ name, slug: href.replace("/channels/", "") });
        } else if (href.startsWith("/search/") && !tagSeen.has(name)) {
            tagSeen.add(name);
            tags.push({ name, slug: href.replace("/search/", "") });
        } else if (href.startsWith("/dates/") && !dateSeen.has(name)) {
            dateSeen.add(name);
            dates.push({ name, slug: href.replace("/dates/", "") });
        }
    });

    return { stars, channels, tags, dates };
}

// ─── Video Detail Page Extractor ────────────────────────────────────

function extractVideoDetail(html) {
    const $ = cheerio.load(html);
    const title = $("article h1").first().text().trim();
    const poster = fixUrl($("video#p").attr("poster") || "");
    const description = $("#desc").text().trim();

    // Stream sources — only ones with title attribute (filter out ad sources)
    const streams = [];
    $("video#p source").each((_, el) => {
        const src = $(el).attr("src") || "";
        const quality = $(el).attr("title") || "";
        if (src && quality && !src.includes("bxcdn.net")) {
            streams.push({ url: fixUrl(src), quality });
        }
    });

    // Stars, channels, tags, dates from the .tags section only
    const stars = [];
    const channels = [];
    const tags = [];
    const dates = [];

    $("div.tags a").each((_, el) => {
        const href = $(el).attr("href") || "";
        const name = $(el).text().trim();
        if (!name) return;
        if (href.startsWith("/stars/")) {
            stars.push({ name, slug: decodeURIComponent(href.replace("/stars/", "")) });
        } else if (href.startsWith("/channels/")) {
            channels.push({ name, slug: decodeURIComponent(href.replace("/channels/", "")) });
        } else if (href.startsWith("/search/")) {
            tags.push({ name, slug: decodeURIComponent(href.replace("/search/", "")) });
        } else if (href.startsWith("/dates/")) {
            dates.push({ name, slug: decodeURIComponent(href.replace("/dates/", "")) });
        }
    });

    return { title, poster, description, streams, stars, channels, tags, dates };
}

// ─── Video card to meta preview ─────────────────────────────────────

function videoToMetaPreview(v) {
    return {
        id: `video_${v.videoId}`,
        type: "movie",
        name: v.title,
        poster: v.poster,
        posterShape: "landscape",
        description: v.duration || "",
    };
}

// ─── Get addon base URL for stream proxy ────────────────────────────

function getAddonBase() {
    return "https://xxdbx-addon.vercel.app";
}

// ─── Manifest ───────────────────────────────────────────────────────

const manifest = {
    id: "community.xxdbx",
    version: "9.1.0",
    name: "XXDBX",
    description:
        "Browse stars, channels, tags, dates, and videos from xxdbx.com. Search any term to get video results + navigate to models/channels!",
    logo: "https://www.google.com/s2/favicons?domain=xxdbx.com&sz=256",
    resources: [
        "catalog",
        {
            name: "meta",
            types: ["channel", "movie"],
            idPrefixes: ["video_", "star_", "ch_", "tag_", "date_"],
        },
        {
            name: "stream",
            types: ["movie", "channel"],
            idPrefixes: ["video_"],
        },
    ],
    types: ["channel", "movie"],
    catalogs: [
        // ── MOVIE TYPE: Search ──
        {
            type: "movie",
            id: "search",
            name: "Search",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false },
            ],
        },
        // ── MOVIE TYPE: Latest Videos (also supports search!) ──
        {
            type: "movie",
            id: "latest",
            name: "Latest",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false },
            ],
        },
        // ── MOVIE TYPE: Most Popular (also supports search!) ──
        {
            type: "movie",
            id: "popular",
            name: "Popular",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false },
            ],
        },
        // ── CHANNEL TYPE: Stars (browseable + searchable) ──
        {
            type: "channel",
            id: "stars",
            name: "Stars",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false },
            ],
        },
        // ── CHANNEL TYPE: Channels (browseable + searchable) ──
        {
            type: "channel",
            id: "channels",
            name: "Channels",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false },
            ],
        },
        // ── CHANNEL TYPE: Tags ──
        {
            type: "channel",
            id: "tags",
            name: "Tags",
            extra: [{ name: "search", isRequired: false }],
        },
        // ── CHANNEL TYPE: Dates ──
        {
            type: "channel",
            id: "dates",
            name: "Dates",
            extra: [{ name: "search", isRequired: false }],
        },
    ],
    idPrefixes: ["video_", "star_", "ch_", "tag_", "date_"],
    behaviorHints: {
        adult: true,
        p2p: false,
        configurable: false,
        configurationRequired: false,
    },
};

const builder = new addonBuilder(manifest);

// ─── CATALOG HANDLER ────────────────────────────────────────────────

builder.defineCatalogHandler(async (args) => {
    const skip = parseInt(args.extra?.skip || "0");
    const page = Math.floor(skip / 36) + 1;
    const search = args.extra?.search || "";

    try {
        // ── Search catalog (movie type) ──
        if (args.id === "search" && args.type === "movie") {
            if (!search) {
                const html = await cachedFetch(`${BASE_URL}/`);
                const videos = parseVideoCards(html);
                return { metas: videos.map((v) => videoToMetaPreview(v)) };
            }
            const searchUrl = `${BASE_URL}/search/${encodeURIComponent(search)}`;
            const html = await cachedFetch(searchUrl);
            const videos = parseVideoCards(html);
            return { metas: videos.map((v) => videoToMetaPreview(v)) };
        }

        // ── Stars catalog (channel type, searchable + browseable) ──
        if (args.id === "stars" && args.type === "channel") {
            if (search) {
                // KEY INSIGHT: xxdbx.com stars don't have dedicated pages!
                // They just search. So we search for the star name and extract
                // star names from the results.
                const searchUrl = `${BASE_URL}/search/${encodeURIComponent(search)}`;
                const html = await cachedFetch(searchUrl);
                const tagData = extractTagsFromCards(html);

                const metas = tagData.stars.map((s) => ({
                    id: `star_${enc(s.name)}`,
                    type: "channel",
                    name: s.name,
                    poster: "",
                    posterShape: "poster",
                    description: `Browse ${s.name} on XXDBX`,
                }));

                // Add the search term itself as a star if not already listed
                if (!metas.find((m) => m.name.toLowerCase() === search.toLowerCase())) {
                    metas.unshift({
                        id: `star_${enc(search)}`,
                        type: "channel",
                        name: search,
                        poster: "",
                        posterShape: "poster",
                        description: `Search results for "${search}" on XXDBX`,
                    });
                }

                const q = search.toLowerCase();
                metas.sort((a, b) =>
                    (a.name.toLowerCase().includes(q) ? 0 : 1) -
                    (b.name.toLowerCase().includes(q) ? 0 : 1)
                );
                return { metas };
            } else {
                // Browse: scrape stars from home + popular pages
                const starMap = {};
                const urls = [
                    `${BASE_URL}/`,
                    `${BASE_URL}/?page=2`,
                    `${BASE_URL}/?page=3`,
                    `${BASE_URL}/most-popular`,
                    `${BASE_URL}/most-popular?page=2`,
                ];
                for (const url of urls) {
                    try {
                        const html = await cachedFetch(url);
                        const tags = extractTagsFromCards(html);
                        for (const s of tags.stars) {
                            if (!starMap[s.name]) starMap[s.name] = s;
                        }
                    } catch (e) {}
                }
                return {
                    metas: Object.values(starMap).map((s) => ({
                        id: `star_${enc(s.name)}`,
                        type: "channel",
                        name: s.name,
                        poster: "",
                        posterShape: "poster",
                        description: `Browse ${s.name} on XXDBX`,
                    })),
                };
            }
        }

        // ── Channels catalog (channel type, searchable + browseable) ──
        if (args.id === "channels" && args.type === "channel") {
            if (search) {
                const searchUrl = `${BASE_URL}/search/${encodeURIComponent(search)}`;
                const html = await cachedFetch(searchUrl);
                const tagData = extractTagsFromCards(html);

                const metas = tagData.channels.map((c) => ({
                    id: `ch_${enc(c.name)}`,
                    type: "channel",
                    name: c.name,
                    poster: "",
                    posterShape: "landscape",
                    description: `Browse ${c.name} on XXDBX`,
                }));

                if (!metas.find((m) => m.name.toLowerCase() === search.toLowerCase())) {
                    metas.unshift({
                        id: `ch_${enc(search)}`,
                        type: "channel",
                        name: search,
                        poster: "",
                        posterShape: "landscape",
                        description: `Search results for "${search}" on XXDBX`,
                    });
                }

                const q = search.toLowerCase();
                metas.sort((a, b) =>
                    (a.name.toLowerCase().includes(q) ? 0 : 1) -
                    (b.name.toLowerCase().includes(q) ? 0 : 1)
                );
                return { metas };
            } else {
                const channelMap = {};
                const urls = [
                    `${BASE_URL}/`,
                    `${BASE_URL}/?page=2`,
                    `${BASE_URL}/most-popular`,
                    `${BASE_URL}/most-popular?page=2`,
                ];
                for (const url of urls) {
                    try {
                        const html = await cachedFetch(url);
                        const tags = extractTagsFromCards(html);
                        for (const c of tags.channels) {
                            if (!channelMap[c.name]) channelMap[c.name] = c;
                        }
                    } catch (e) {}
                }
                return {
                    metas: Object.values(channelMap).map((c) => ({
                        id: `ch_${enc(c.name)}`,
                        type: "channel",
                        name: c.name,
                        poster: "",
                        posterShape: "landscape",
                        description: `Browse ${c.name} on XXDBX`,
                    })),
                };
            }
        }

        // ── Tags catalog (channel type, search only) ──
        if (args.id === "tags" && args.type === "channel") {
            if (search) {
                const searchUrl = `${BASE_URL}/search/${encodeURIComponent(search)}`;
                const html = await cachedFetch(searchUrl);
                const $ = cheerio.load(html);

                let tagMetas = [];

                // Get tags from the first video detail page
                const firstVideoHref = $('a[href^="/view/"]').first().attr("href");
                if (firstVideoHref) {
                    try {
                        const detailHtml = await cachedFetch(fixUrl(firstVideoHref));
                        const detail = extractVideoDetail(detailHtml);
                        tagMetas = detail.tags.map((t) => ({
                            id: `tag_${enc(t.name)}`,
                            type: "channel",
                            name: t.name,
                            poster: "",
                            posterShape: "poster",
                            description: `Browse "${t.name}" on XXDBX`,
                        }));
                    } catch (e) {}
                }

                // Add the search term itself as a tag
                const pageTitle = $("article h1").first().text().trim();
                const videoCount = pageTitle.match(/(\d+)\s*videos/);
                if (!tagMetas.find((t) => t.name.toLowerCase() === search.toLowerCase())) {
                    tagMetas.unshift({
                        id: `tag_${enc(search)}`,
                        type: "channel",
                        name: search,
                        poster: "",
                        posterShape: "poster",
                        description: videoCount ? `${videoCount[1]} videos` : `Browse "${search}" on XXDBX`,
                    });
                }

                // Add tags from listing cards
                const cardTags = extractTagsFromCards(html);
                for (const t of cardTags.tags) {
                    if (!tagMetas.find((m) => m.name.toLowerCase() === t.name.toLowerCase())) {
                        tagMetas.push({
                            id: `tag_${enc(t.name)}`,
                            type: "channel",
                            name: t.name,
                            poster: "",
                            posterShape: "poster",
                            description: `Browse "${t.name}" on XXDBX`,
                        });
                    }
                }

                return { metas: tagMetas };
            }
            return { metas: [] };
        }

        // ── Dates catalog (channel type) ──
        if (args.id === "dates" && args.type === "channel") {
            if (search) {
                // Dates on xxdbx.com also just search
                const searchUrl = `${BASE_URL}/search/${encodeURIComponent(search)}`;
                try {
                    const html = await cachedFetch(searchUrl);
                    const videoCount = parseVideoCards(html).length;
                    return {
                        metas: [{
                            id: `date_${enc(search)}`,
                            type: "channel",
                            name: search,
                            poster: "",
                            posterShape: "poster",
                            description: videoCount ? `${videoCount} videos found` : `Browse ${search} on XXDBX`,
                        }],
                    };
                } catch (e) {
                    return { metas: [] };
                }
            }
            // Default: show recent years
            const currentYear = new Date().getFullYear();
            const metas = [];
            for (let y = currentYear; y >= currentYear - 3; y--) {
                metas.push({
                    id: `date_${enc(String(y))}`,
                    type: "channel",
                    name: String(y),
                    poster: "",
                    posterShape: "poster",
                    description: `Browse ${y} videos on XXDBX`,
                });
            }
            return { metas };
        }

        // ── Latest Videos catalog (movie type) ──
        if (args.id === "latest" && args.type === "movie") {
            if (search) {
                const searchUrl = `${BASE_URL}/search/${encodeURIComponent(search)}`;
                const html = await cachedFetch(searchUrl);
                const videos = parseVideoCards(html);
                return { metas: videos.map((v) => videoToMetaPreview(v)) };
            }
            const url = page > 1 ? `${BASE_URL}/?page=${page}` : `${BASE_URL}/`;
            const html = await cachedFetch(url);
            const videos = parseVideoCards(html);
            return { metas: videos.map((v) => videoToMetaPreview(v)) };
        }

        // ── Most Popular catalog (movie type) ──
        if (args.id === "popular" && args.type === "movie") {
            if (search) {
                const searchUrl = `${BASE_URL}/search/${encodeURIComponent(search)}`;
                const html = await cachedFetch(searchUrl);
                const videos = parseVideoCards(html);
                return { metas: videos.map((v) => videoToMetaPreview(v)) };
            }
            const url = page > 1 ? `${BASE_URL}/most-popular?page=${page}` : `${BASE_URL}/most-popular`;
            const html = await cachedFetch(url);
            const videos = parseVideoCards(html);
            return { metas: videos.map((v) => videoToMetaPreview(v)) };
        }
    } catch (err) {
        console.error("Catalog error:", err.message);
    }

    return { metas: [] };
});

// ─── META HANDLER ───────────────────────────────────────────────────

builder.defineMetaHandler(async (args) => {
    const { id, type } = args;

    try {
        // ── Video meta (movie type) ──
        if (type === "movie" && id.startsWith("video_")) {
            const videoId = id.replace("video_", "");
            const detailUrl = `${BASE_URL}/view/${videoId}`;
            const html = await cachedFetch(detailUrl);
            const detail = extractVideoDetail(html);

            // Build links for cross-navigation
            const links = [];

            for (const star of detail.stars) {
                links.push({
                    name: star.name,
                    category: "Stars",
                    url: `stremio:///detail/channel/star_${enc(star.name)}`,
                });
            }
            for (const ch of detail.channels) {
                links.push({
                    name: ch.name,
                    category: "Channels",
                    url: `stremio:///detail/channel/ch_${enc(ch.name)}`,
                });
            }
            for (const tag of detail.tags) {
                links.push({
                    name: tag.name,
                    category: "Tags",
                    url: `stremio:///detail/channel/tag_${enc(tag.name)}`,
                });
            }
            for (const date of detail.dates) {
                links.push({
                    name: date.name,
                    category: "Dates",
                    url: `stremio:///detail/channel/date_${enc(date.name)}`,
                });
            }

            const meta = {
                id: id,
                type: "movie",
                name: detail.title,
                poster: detail.poster,
                posterShape: "landscape",
                background: detail.poster,
                description: detail.description || detail.title,
                releaseInfo: detail.dates[0]?.name || "",
                genres: detail.tags.map((t) => t.name),
                cast: detail.stars.map((s) => s.name),
                links: links,
            };

            return { meta };
        }

        // ═══════════════════════════════════════════════════════════
        // V9.0.0 FIX: Channel meta handlers
        //
        // KEY INSIGHT: xxdbx.com does NOT have dedicated pages for
        // stars, channels, or tags. When you click them on the site,
        // they all just search. So we ALWAYS use /search/{name}.
        //
        // Previous code tried /stars/{name}/ first, which either
        // 404'd or returned a different page structure, causing
        // "No information found" errors.
        // ═══════════════════════════════════════════════════════════

        // ── Star meta (channel type) ──
        if (type === "channel" && id.startsWith("star_")) {
            const name = dec(id.replace("star_", ""));
            console.log(`[META] star_ decoded name: "${name}" from id: "${id}"`);
            // Always use search — xxdbx.com stars don't have dedicated pages
            const searchUrl = `${BASE_URL}/search/${encodeURIComponent(name)}`;
            return await buildChannelMeta(id, name, searchUrl, "Star", "poster");
        }

        // ── Channel meta (channel type) ──
        if (type === "channel" && id.startsWith("ch_")) {
            const name = dec(id.replace("ch_", ""));
            console.log(`[META] ch_ decoded name: "${name}" from id: "${id}"`);
            // Always use search — xxdbx.com channels don't have dedicated pages
            const searchUrl = `${BASE_URL}/search/${encodeURIComponent(name)}`;
            return await buildChannelMeta(id, name, searchUrl, "Channel", "landscape");
        }

        // ── Tag meta (channel type) ──
        if (type === "channel" && id.startsWith("tag_")) {
            const name = dec(id.replace("tag_", ""));
            console.log(`[META] tag_ decoded name: "${name}" from id: "${id}"`);
            // Tags always use search on xxdbx.com
            const searchUrl = `${BASE_URL}/search/${encodeURIComponent(name)}`;
            return await buildChannelMeta(id, name, searchUrl, "Tag", "poster");
        }

        // ── Date meta (channel type) ──
        if (type === "channel" && id.startsWith("date_")) {
            const dateStr = dec(id.replace("date_", ""));
            console.log(`[META] date_ decoded name: "${dateStr}" from id: "${id}"`);
            // Try /dates/ first, fall back to search
            let searchUrl = `${BASE_URL}/dates/${encodeURIComponent(dateStr)}`;
            try {
                await cachedFetch(searchUrl);
            } catch (e) {
                searchUrl = `${BASE_URL}/search/${encodeURIComponent(dateStr)}`;
            }
            return await buildChannelMeta(id, dateStr, searchUrl, "Date", "poster");
        }
    } catch (err) {
        console.error("Meta error:", err.message);
    }

    return { meta: {} };
});

// ─── Helper: Build channel meta with videos ────────────────────────

async function buildChannelMeta(id, displayName, searchUrl, genre, posterShape) {
    try {
        const html = await cachedFetch(searchUrl);
        const $ = cheerio.load(html);
        const pageTitle = $("article h1").first().text().trim();
        const name = pageTitle.split("\u2013")[0].trim() || displayName;

        // Extract videos from the search results
        const videos = [];
        const seenIds = new Set();
        const maxPages = 3;

        for (let p = 1; p <= maxPages; p++) {
            try {
                const pUrl = p > 1 ? `${searchUrl}${searchUrl.includes("?") ? "&" : "?"}page=${p}` : searchUrl;
                const pHtml = await cachedFetch(pUrl);
                const pVideos = parseVideoCards(pHtml);
                if (pVideos.length === 0) break;

                for (const v of pVideos) {
                    if (!seenIds.has(v.videoId)) {
                        seenIds.add(v.videoId);
                        videos.push({
                            id: `video_${v.videoId}`,
                            title: v.title,
                            released: new Date().toISOString().split("T")[0],
                            thumbnail: v.poster,
                            overview: v.duration || "",
                        });
                    }
                }
            } catch (e) {
                break;
            }
        }

        const meta = {
            id: id,
            type: "channel",
            name: name,
            poster: "",
            posterShape: posterShape,
            description: pageTitle || `Browse ${displayName} on XXDBX \u2014 ${videos.length} videos`,
            genres: [genre],
            videos: videos,
            links: [],
        };

        return { meta };
    } catch (err) {
        console.error(`buildChannelMeta error for ${id}:`, err.message);
        // Return a basic meta even on error so Stremio doesn't show "No information found"
        return {
            meta: {
                id: id,
                type: "channel",
                name: displayName,
                poster: "",
                posterShape: posterShape,
                description: `Search results for "${displayName}" on XXDBX`,
                genres: [genre],
                videos: [],
                links: [],
            },
        };
    }
}

// ─── STREAM HANDLER ─────────────────────────────────────────────────

builder.defineStreamHandler(async (args) => {
    const { id, type } = args;

    try {
        // ═══════════════════════════════════════════════════════════
        // V9.1.0 FIX: Stream handler supports BOTH movie AND channel type!
        //
        // When a video is inside a channel page, Stremio requests streams
        // with type="channel", NOT type="movie". Our old handler only
        // handled type="movie", so channel page videos had NO streams.
        //
        // Now we handle BOTH types for video_ prefix IDs.
        // ═══════════════════════════════════════════════════════════

        if ((type === "movie" || type === "channel") && id.startsWith("video_")) {
            const videoId = id.replace("video_", "");
            const addonBase = getAddonBase();
            const streams = [];

            // ── 1. Proxy play streams ──
            const qualities = ["1080", "720", "360"];
            const QUALITY_LABELS = {
                "360": "360p",
                "720": "720p HD",
                "1080": "1080p FHD",
            };

            for (const q of qualities) {
                streams.push({
                    name: "XXDBX",
                    title: QUALITY_LABELS[q] || `${q}p`,
                    url: `${addonBase}/play/${videoId}/${q}.mp4`,
                    behaviorHints: { notWebReady: false },
                });
            }

            // ── 2. Clickable navigation streams (only for movie type, not inside channels) ──
            // Don't add navigation streams when the video is being viewed inside
            // a channel page — it would be confusing and recursive
            if (type === "movie") {
                try {
                    const detailUrl = `${BASE_URL}/view/${videoId}`;
                    const html = await cachedFetch(detailUrl);
                    const detail = extractVideoDetail(html);

                    // Add clickable star streams
                    for (const star of detail.stars.slice(0, 10)) {
                        streams.push({
                            name: "\u2b50 Star",
                            title: star.name,
                            externalUrl: `stremio:///detail/channel/star_${enc(star.name)}`,
                            behaviorHints: { group: "stars" },
                        });
                    }

                    // Add clickable channel streams
                    for (const ch of detail.channels.slice(0, 5)) {
                        streams.push({
                            name: "\ud83c\udfe0 Channel",
                            title: ch.name,
                            externalUrl: `stremio:///detail/channel/ch_${enc(ch.name)}`,
                            behaviorHints: { group: "channels" },
                        });
                    }

                    // Add clickable tag streams
                    for (const tag of detail.tags.slice(0, 10)) {
                        streams.push({
                            name: "\ud83c\udff7\ufe0f Tag",
                            title: tag.name,
                            externalUrl: `stremio:///detail/channel/tag_${enc(tag.name)}`,
                            behaviorHints: { group: "tags" },
                        });
                    }

                } catch (err) {
                    console.error("Stream nav error:", err.message);
                }
            }

            return { streams };
        }

        // Star/channel/tag/date IDs don't have streams themselves
        if (
            id.startsWith("star_") ||
            id.startsWith("ch_") ||
            id.startsWith("tag_") ||
            id.startsWith("date_")
        ) {
            return { streams: [] };
        }
    } catch (err) {
        console.error("Stream error:", err.message);
    }

    return { streams: [] };
});

module.exports = builder.getInterface();
