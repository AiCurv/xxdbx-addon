const { addonBuilder } = require("stremio-addon-sdk");
const cheerio = require("cheerio");
const fetch = require("node-fetch");

const BASE_URL = "https://w1mp.com";
const CDN_STATIC = "https://cdnstatic.w1mp.com";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
};

// ─── Simple in-memory cache (5 min TTL) ─────────────────────────────

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

function parseVideoCard(el) {
    const $ = el;
    let linkEl = $.find("a.custom-preview-block-video-wrap").first();
    if (!linkEl.length) {
        linkEl = $.find("a[href*='/video/']").first();
    }
    if (!linkEl.length) return null;

    const href = linkEl.attr("href") || "";
    const videoMatch = href.match(/\/video\/(\d+)\//);
    if (!videoMatch) return null;
    const videoId = videoMatch[1];

    const title = $.find(".card-meta .title").first().text().trim();
    if (!title) return null;

    const img = $.find(".card-img img").first();
    const poster = fixUrl(
        img.attr("data-webp") || img.attr("src") || ""
    );

    const badgeEl = $.find(".badges .badge").first();
    const badgeText = badgeEl.text().trim();
    const isHD = badgeEl.find(".hd-badge").length > 0;
    const durationMatch = badgeText.match(/(\d+:\d+)/);
    const duration = durationMatch ? durationMatch[1] : "";

    const preview = fixUrl(img.attr("data-preview") || "");

    const modelEl = $.find(".item-tool.model a").first();
    const modelName = modelEl.text().trim();
    const modelHref = modelEl.attr("href") || "";
    const modelSlugMatch = modelHref.match(/\/models\/([^/]+)\/?/);
    const modelSlug = modelSlugMatch ? modelSlugMatch[1] : "";

    // Extract model avatar from card if available
    const modelAvatarEl = $.find(".card-model-avatar img").first();
    const modelAvatar = modelAvatarEl.length ? fixUrl(modelAvatarEl.attr("src") || "") : "";

    const viewsEl = $.find(".info-item .item-tool").last();
    const views = viewsEl.text().trim();

    return {
        videoId,
        title,
        poster,
        duration,
        isHD,
        preview,
        modelName,
        modelSlug,
        modelAvatar,
        views,
        href: fixUrl(href),
    };
}

function extractVideoCards(html) {
    const $ = cheerio.load(html);
    const videos = [];
    $(".card.item").each((_, el) => {
        const card = parseVideoCard($(el));
        if (card) videos.push(card);
    });
    return videos;
}

function extractModelCards(html) {
    const $ = cheerio.load(html);
    const models = [];
    $(".thumbs.models-thumbs .card.item").each((_, el) => {
        const $el = $(el);
        const linkEl = $el.find("a").first();
        const href = linkEl.attr("href") || "";
        const slugMatch = href.match(/\/models\/([^/]+)\/?/);
        if (!slugMatch) return;
        const slug = slugMatch[1];
        const name = $el.find(".title").first().text().trim();
        const img = $el.find(".card-img img").first();
        const poster = fixUrl(img.attr("src") || "");
        const videoCount = $el.find(".info-item .item-tool").first().text().trim();
        const rating = $el.find(".info-item .item-tool").eq(1).text().trim();
        models.push({ slug, name, poster, videoCount, rating });
    });
    return models;
}

// ─── Model avatar cache (slug → poster URL) ─────────────────────────

const modelAvatarCache = new Map();

async function getModelPoster(slug) {
    if (modelAvatarCache.has(slug)) return modelAvatarCache.get(slug);

    // Try fetching models page and find this model's avatar
    try {
        const html = await cachedFetch(`${BASE_URL}/models/`);
        const models = extractModelCards(html);
        for (const m of models) {
            if (m.poster) modelAvatarCache.set(m.slug, m.poster);
        }
        if (modelAvatarCache.has(slug)) return modelAvatarCache.get(slug);
    } catch (e) {}

    // Fallback: try the CDN URL pattern (works for some models)
    // We don't know the model_id, so we can't construct the exact URL
    // Use a generic placeholder
    return "";
}

// ─── Manifest ───────────────────────────────────────────────────────

const manifest = {
    id: "community.w1mp",
    version: "2.1.0",
    name: "W1MP",
    description: "Browse models, categories, and videos from w1mp.com. Add model pages to your library!",
    logo: "https://www.google.com/s2/favicons?domain=w1mp.com&sz=256",
    background: "https://cdnstatic.w1mp.com/static/images/logo.png",
    resources: [
        "catalog",
        { name: "meta", types: ["channel", "movie"], idPrefixes: ["model_", "video_"] },
        { name: "stream", types: ["channel", "movie"], idPrefixes: ["video_"] },
    ],
    types: ["channel", "movie"],
    catalogs: [
        // ── CHANNEL TYPE: Models (creates dedicated "Channels" section in Stremio) ──
        {
            type: "channel",
            id: "models",
            name: "Models",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false },
            ],
        },
        // ── MOVIE TYPE: Searchable video catalog ──
        {
            type: "movie",
            id: "video_search",
            name: "Video Search",
            extra: [
                { name: "search", isRequired: true }, // search-only catalog
            ],
        },
        // ── MOVIE TYPE: Category browsing ──
        {
            type: "movie",
            id: "categories",
            name: "Categories",
            extra: [
                { name: "genre", isRequired: false, options: [
                    "Amateur", "Anal", "Arab", "Asian", "Babe", "BBW",
                    "Behind The Scenes", "Big Ass", "Big Dick", "Big Tits",
                    "Blonde", "Blowjob", "Bondage", "Brazilian", "British",
                    "Brunette", "Bukkake", "Casting", "Compilation", "Cosplay",
                    "Creampie", "Cuckold", "Cumshot", "Czech", "Double Penetration",
                    "Ebony", "Euro", "Facial", "Feet", "Female Orgasm", "Fetish",
                    "Fisting", "French", "Gangbang", "German", "Hairy", "Handjob",
                    "Hardcore", "Hentai", "Interracial", "Italian", "Japanese",
                    "Latina", "Lesbian", "Massage", "Masturbation", "Mature",
                    "MILF", "Old Young", "Orgy", "POV", "Public", "Reality",
                    "Red Head", "Role Play", "Romantic", "Rough Sex", "Russian",
                    "School", "Solo Female", "Squirt", "Step Fantasy", "Strap On",
                    "Striptease", "Teen", "Threesome", "Toys", "Vintage"
                ] },
                { name: "skip", isRequired: false },
            ],
        },
        // ── MOVIE TYPE: Browse catalogs ──
        {
            type: "movie",
            id: "latest",
            name: "Latest Videos",
            extra: [{ name: "skip", isRequired: false }],
        },
        {
            type: "movie",
            id: "top_rated",
            name: "Top Rated",
            extra: [{ name: "skip", isRequired: false }],
        },
        {
            type: "movie",
            id: "most_popular",
            name: "Most Popular",
            extra: [{ name: "skip", isRequired: false }],
        },
    ],
    idPrefixes: ["model_", "video_"],
    behaviorHints: {
        adult: true,
        p2p: false,
        configurable: false,
        configurationRequired: false,
    },
};

const builder = new addonBuilder(manifest);

// ─── Category slug mapping ──────────────────────────────────────────

const CATEGORY_SLUG_MAP = {
    "amateur": "amateur", "anal": "anal", "arab": "arab", "asian": "asian",
    "babe": "babe", "bbw": "bbw", "behind the scenes": "behind-the-scenes",
    "big ass": "big-ass", "big dick": "big-dick", "big tits": "big-tits",
    "blonde": "blonde", "blowjob": "blowjob", "bondage": "bondage",
    "brazilian": "brazilian", "british": "british", "brunette": "brunette",
    "bukkake": "bukkake", "casting": "casting", "compilation": "compilation",
    "cosplay": "cosplay", "creampie": "creampie", "cuckold": "cuckold",
    "cumshot": "cumshot", "czech": "czech", "double penetration": "double-penetration",
    "ebony": "ebony", "euro": "euro", "facial": "facial", "feet": "feet",
    "female orgasm": "female-orgasm", "fetish": "fetish", "fisting": "fisting",
    "french": "french", "gangbang": "gangbang", "german": "german",
    "hairy": "hairy", "handjob": "handjob", "hardcore": "hardcore",
    "hentai": "hentai", "interracial": "interracial", "italian": "italian",
    "japanese": "japanese", "latina": "latina", "lesbian": "lesbian",
    "massage": "massage", "masturbation": "masturbation", "mature": "mature",
    "milf": "milf", "old young": "old-young-18", "orgy": "orgy",
    "pov": "pov", "public": "public", "reality": "reality",
    "red head": "red-head", "role play": "role-play", "romantic": "romantic",
    "rough sex": "rough-sex", "russian": "russian", "school": "school-18",
    "solo female": "solo-female", "squirt": "squirt",
    "step fantasy": "step-fantasy", "strap on": "strap-on",
    "striptease": "striptease", "teen": "teen-18", "threesome": "threesome",
    "toys": "toys", "vintage": "vintage",
};

// ─── CATALOG HANDLER ────────────────────────────────────────────────

builder.defineCatalogHandler(async (args) => {
    const skip = parseInt(args.extra?.skip || "0");
    const page = Math.floor(skip / 40) + 1; // ~40 items per page

    try {
        // ── Models catalog (channel type, searchable) ──
        if (args.id === "models" && args.type === "channel") {
            if (args.extra?.search) {
                const query = args.extra.search;
                const queryLower = query.toLowerCase();

                // Strategy: Search the site, extract unique models from video results
                const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(query)}`;
                const html = await cachedFetch(searchUrl);
                const videos = extractVideoCards(html);

                // Extract unique models from search results
                const modelMap = {};
                for (const v of videos) {
                    if (v.modelSlug) {
                        if (!modelMap[v.modelSlug]) {
                            modelMap[v.modelSlug] = { name: v.modelName, avatar: v.modelAvatar };
                        }
                        // Update avatar if we find one
                        if (v.modelAvatar && !modelMap[v.modelSlug].avatar) {
                            modelMap[v.modelSlug].avatar = v.modelAvatar;
                        }
                    }
                }

                const metas = Object.entries(modelMap).map(([slug, data]) => ({
                    id: `model_${slug}`,
                    type: "channel",
                    name: data.name,
                    poster: data.avatar || "",
                    posterShape: "poster",
                    description: `${data.name} — model page on W1MP`,
                }));

                // Sort: models whose name matches the query come FIRST
                metas.sort((a, b) => {
                    const aMatch = a.name.toLowerCase().includes(queryLower) ? 0 : 1;
                    const bMatch = b.name.toLowerCase().includes(queryLower) ? 0 : 1;
                    return aMatch - bMatch;
                });

                return { metas };
            } else {
                // Browse all models
                const modelsUrl = page > 1
                    ? `${BASE_URL}/models/${page}/`
                    : `${BASE_URL}/models/`;
                const html = await cachedFetch(modelsUrl);
                const models = extractModelCards(html);

                const metas = models.map(m => ({
                    id: `model_${m.slug}`,
                    type: "channel",
                    name: m.name,
                    poster: m.poster || "",
                    posterShape: "poster",
                    description: `${m.videoCount} | Rating: ${m.rating}`,
                }));

                return { metas };
            }
        }

        // ── Video Search catalog (movie type, search-only) ──
        if (args.id === "video_search" && args.type === "movie") {
            if (args.extra?.search) {
                const query = args.extra.search;
                const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(query)}`;
                const html = await cachedFetch(searchUrl);
                const videos = extractVideoCards(html);
                return { metas: videos.map(v => videoToMetaPreview(v)) };
            }
            return { metas: [] };
        }

        // ── Categories catalog ──
        if (args.id === "categories" && args.type === "movie") {
            let categorySlug = "";
            if (args.extra?.genre) {
                const genreKey = args.extra.genre.toLowerCase();
                categorySlug = CATEGORY_SLUG_MAP[genreKey] || genreKey;
            }

            if (categorySlug) {
                const catUrl = page > 1
                    ? `${BASE_URL}/categories/${categorySlug}/${page}/`
                    : `${BASE_URL}/categories/${categorySlug}/`;
                const html = await cachedFetch(catUrl);
                const videos = extractVideoCards(html);
                return { metas: videos.map(v => videoToMetaPreview(v)) };
            } else {
                const catHtml = await cachedFetch(`${BASE_URL}/categories/`);
                const $ = cheerio.load(catHtml);
                const metas = [];
                $(".categories-thumbs .card.item").each((_, el) => {
                    const $el = $(el);
                    const linkEl = $el.find("a").first();
                    const href = linkEl.attr("href") || "";
                    const slugMatch = href.match(/\/categories\/([^/]+)\/?/);
                    if (!slugMatch) return;
                    const slug = slugMatch[1];
                    const name = $el.find(".cat-title").text().trim() || slug;
                    const img = $el.find("img").first();
                    const poster = fixUrl(img.attr("src") || "");
                    metas.push({
                        id: `category_${slug}`,
                        type: "movie",
                        name: name,
                        poster: poster,
                        posterShape: "landscape",
                        description: `Browse ${name} videos`,
                    });
                });
                return { metas };
            }
        }

        // ── Latest videos catalog ──
        if (args.id === "latest" && args.type === "movie") {
            const url = page > 1
                ? `${BASE_URL}/latest-updates/${page}/`
                : `${BASE_URL}/latest-updates/`;
            const html = await cachedFetch(url);
            const videos = extractVideoCards(html);
            return { metas: videos.map(v => videoToMetaPreview(v)) };
        }

        // ── Top rated catalog ──
        if (args.id === "top_rated" && args.type === "movie") {
            const url = page > 1
                ? `${BASE_URL}/top-rated/${page}/`
                : `${BASE_URL}/top-rated/`;
            const html = await cachedFetch(url);
            const videos = extractVideoCards(html);
            return { metas: videos.map(v => videoToMetaPreview(v)) };
        }

        // ── Most popular catalog ──
        if (args.id === "most_popular" && args.type === "movie") {
            const url = page > 1
                ? `${BASE_URL}/most-popular/${page}/`
                : `${BASE_URL}/most-popular/`;
            const html = await cachedFetch(url);
            const videos = extractVideoCards(html);
            return { metas: videos.map(v => videoToMetaPreview(v)) };
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
        // ── Model meta (channel type — shows video list) ──
        if (type === "channel" && id.startsWith("model_")) {
            const slug = id.replace("model_", "");
            const modelUrl = `${BASE_URL}/models/${slug}/`;
            const html = await cachedFetch(modelUrl);
            const $ = cheerio.load(html);

            const name = $(".viewlist-headline .title").first().text().trim() || slug;
            const desc = $(".viewlist-description").first().text().trim();
            const stats = $(".viewlist-headline .statistic-list .item").map((_, el) => $(el).text().trim()).get();
            const videoCount = stats[0] || "";
            const rating = stats[1] || "";

            // Try to find model avatar from the page
            const modelPageImg = $(".posted img, .about-hold img").first().attr("src");
            const modelPoster = modelPageImg ? fixUrl(modelPageImg) : await getModelPoster(slug);

            // Extract ALL videos from this model's pages
            const videos = [];
            const seenIds = new Set();

            // Fetch up to 5 pages of videos for the model
            for (let p = 1; p <= 5; p++) {
                try {
                    const pUrl = p > 1
                        ? `${BASE_URL}/models/${slug}/${p}/`
                        : `${BASE_URL}/models/${slug}/`;
                    const pHtml = await cachedFetch(pUrl);
                    const p$ = cheerio.load(pHtml);

                    let pageHasVideos = false;
                    p$(".card.item").each((_, el) => {
                        const card = parseVideoCard(p$(el));
                        if (card && !seenIds.has(card.videoId)) {
                            seenIds.add(card.videoId);
                            const dirPrefix = Math.floor(parseInt(card.videoId) / 1000) * 1000;
                            videos.push({
                                id: `video_${card.videoId}`,
                                title: card.title,
                                released: new Date().toISOString(),
                                thumbnail: card.poster || `${CDN_STATIC}/contents/videos_screenshots/${dirPrefix}/${card.videoId}/672x378/1.jpg`,
                                overview: `${card.duration || ""}${card.isHD ? " HD" : ""}${card.views ? " | " + card.views : ""}`,
                            });
                            pageHasVideos = true;
                        }
                    });

                    if (!pageHasVideos) break; // No more pages
                } catch (e) { break; }
            }

            const meta = {
                id: id,
                type: "channel",
                name: name,
                poster: modelPoster,
                posterShape: "poster",
                background: modelPoster,
                description: desc || `${name}${videoCount ? " — " + videoCount : ""}${rating ? " | Rating: " + rating : ""}`,
                releaseInfo: "",
                genres: ["Model"],
                videos: videos,
                // CRITICAL: NO defaultVideoId — it causes infinite back-loop in Stremio
            };

            return { meta };
        }

        // ── Video meta (movie type) ──
        if (type === "movie" && id.startsWith("video_")) {
            const videoId = id.replace("video_", "");
            const videoUrl = `${BASE_URL}/embed/${videoId}/`;
            const html = await cachedFetch(videoUrl);
            const $ = cheerio.load(html);

            const title = $("meta[property='og:title']").attr("content") || $("title").first().text().trim() || `Video ${videoId}`;
            const poster = $("video").attr("poster") || "";
            const description = $("meta[property='og:description']").attr("content") || "";

            const genres = [];
            const cast = [];
            $("a[href*='/models/']").each((_, el) => {
                cast.push({ name: $(el).text().trim() });
            });

            const meta = {
                id: id,
                type: "movie",
                name: title,
                poster: fixUrl(poster),
                posterShape: "landscape",
                background: fixUrl(poster),
                description: description || title,
                releaseInfo: "",
                genres: genres,
                cast: cast,
            };

            return { meta };
        }

        // ── Category placeholder meta ──
        if (type === "movie" && id.startsWith("category_")) {
            const slug = id.replace("category_", "");
            const catUrl = `${BASE_URL}/categories/${slug}/`;
            const html = await cachedFetch(catUrl);
            const videos = extractVideoCards(html);

            const meta = {
                id: id,
                type: "movie",
                name: slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                poster: "",
                posterShape: "landscape",
                description: `Browse ${slug} videos`,
                genres: [slug],
                videos: videos.slice(0, 100).map(v => ({
                    id: `video_${v.videoId}`,
                    title: v.title,
                    released: new Date().toISOString(),
                    thumbnail: v.poster,
                })),
            };

            return { meta };
        }

    } catch (err) {
        console.error("Meta error:", err.message);
    }

    return { meta: {} };
});

// ─── STREAM HANDLER ─────────────────────────────────────────────────

builder.defineStreamHandler(async (args) => {
    const { id, type } = args;

    try {
        // ── Stream for individual video (from video catalog or channel video list) ──
        if (id.startsWith("video_")) {
            const videoId = id.replace("video_", "");
            const streams = [];

            // Use embed URL — /video/{id}/ without slug returns 404 on KVS sites
            const embedUrl = `${BASE_URL}/embed/${videoId}/`;
            const html = await cachedFetch(embedUrl);
            const $ = cheerio.load(html);

            // Extract MP4 from <video><source> tag
            $("video source").each((_, el) => {
                const src = $(el).attr("src") || "";
                if (src) {
                    streams.push({
                        name: "W1MP",
                        title: "Direct MP4",
                        url: fixUrl(src),
                        behaviorHints: { notWebReady: false },
                    });
                }
            });

            return { streams };
        }

        // ── Stream for model page (channel type) ──
        // NOTE: Stremio doesn't request streams for the channel meta itself.
        // It requests streams for individual videos in the channel's video list.
        // Those use the video_ prefix handler above.
        // If somehow requested, return empty — the user should click a video from the list.
        if (id.startsWith("model_")) {
            return { streams: [] };
        }
    } catch (err) {
        console.error("Stream error:", err.message);
    }

    return { streams: [] };
});

// ─── Helper: video card to meta preview ──────────────────────────────

function videoToMetaPreview(v) {
    const dirPrefix = Math.floor(parseInt(v.videoId) / 1000) * 1000;
    const poster = v.poster || `${CDN_STATIC}/contents/videos_screenshots/${dirPrefix}/${v.videoId}/672x378/1.jpg`;
    return {
        id: `video_${v.videoId}`,
        type: "movie",
        name: v.title,
        poster: poster,
        posterShape: "landscape",
        description: `${v.duration || ""}${v.isHD ? " HD" : ""}${v.modelName ? " | " + v.modelName : ""}${v.views ? " | " + v.views : ""}`,
        releaseInfo: "",
    };
}

module.exports = builder.getInterface();
