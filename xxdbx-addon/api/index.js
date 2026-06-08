const express = require('express');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE_URL = 'https://xxdbx.com';
const ADDON_BASE_DEFAULT = 'https://xxdbx-addon.vercel.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://xxdbx.com/',
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

// ─── Helpers ───────────────────────────────────────────────

function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return BASE_URL + url;
    return url;
}

// V10: Use encodeURIComponent for IDs — same as V6 which WORKED
// The /stars/ and /channels/ pages DO EXIST on xxdbx.com!
// V9 broke it by switching to /search/ URLs and hex encoding

function encodeId(name) {
    return encodeURIComponent(name);
}

function decodeId(encoded) {
    try {
        return decodeURIComponent(encoded);
    } catch (e) {
        return encoded;
    }
}

// ─── Video Card Parser ────────────────────────────────────

function parseVideoCard(el, $) {
    const linkEl = el.find('a[href^="/view/"]').first();
    const href = linkEl.attr('href') || '';
    const videoMatch = href.match(/\/view\/(\d+)/);
    if (!videoMatch) return null;
    const videoId = videoMatch[1];

    const title = el.find('.v_title').text().trim();
    if (!title) return null;

    const imgEl = el.find('.v_pic').first();
    const thumbSrc = imgEl.attr('data-src') || imgEl.attr('src') || '';
    const poster = fixUrl(thumbSrc);
    const duration = el.find('.v_dur').text().trim();

    const stars = [];
    let channel = '';
    let date = '';

    el.find('.v_tags a').each((_, a) => {
        const aHref = $(a).attr('href') || '';
        const text = $(a).text().trim();
        if (aHref.startsWith('/stars/')) {
            stars.push({ name: text, slug: aHref.replace('/stars/', '') });
        } else if (aHref.startsWith('/channels/')) {
            channel = text;
        } else if (aHref.startsWith('/dates/')) {
            date = text;
        }
    });

    return { videoId, title, duration, poster, stars, channel, date };
}

function parseVideoCards(html) {
    const $ = cheerio.load(html);
    const videos = [];
    $('div.v').each((_, el) => {
        const v = parseVideoCard($(el), $);
        if (v) videos.push(v);
    });
    return videos;
}

// ─── Video card to meta preview ─────────────────────────────

function videoToMetaPreview(v) {
    return {
        id: `video_${v.videoId}`,
        type: 'movie',
        name: v.title,
        poster: v.poster,
        posterShape: 'landscape',
        description: `${v.duration} | ${v.stars.map(s => s.name).join(', ')}${v.channel ? ' | ' + v.channel : ''}`,
    };
}

// ─── Video Detail Page Extractor ────────────────────────────

function extractVideoDetail(html) {
    const $ = cheerio.load(html);
    const title = $('article h1').first().text().trim();
    const poster = fixUrl($('video#p').attr('poster') || '');
    const description = $('#desc').text().trim();

    // Stream sources
    const streams = [];
    $('video#p source').each((_, el) => {
        const src = $(el).attr('src') || '';
        const quality = $(el).attr('title') || '';
        if (src && quality && !src.includes('bxcdn.net')) {
            streams.push({ url: fixUrl(src), quality });
        }
    });

    // Stars, channels, tags, dates from the .tags section
    const stars = [];
    const channels = [];
    const tags = [];
    const dates = [];

    $('div.tags a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const name = $(el).text().trim();
        if (!name) return;
        if (href.startsWith('/stars/')) {
            stars.push({ name, slug: href.replace('/stars/', '') });
        } else if (href.startsWith('/channels/')) {
            channels.push({ name, slug: href.replace('/channels/', '') });
        } else if (href.startsWith('/search/')) {
            tags.push({ name, slug: href.replace('/search/', '') });
        } else if (href.startsWith('/dates/')) {
            dates.push({ name, slug: href.replace('/dates/', '') });
        }
    });

    return { title, poster, description, streams, stars, channels, tags, dates };
}

// ─── Manifest ──────────────────────────────────────────────

const MANIFEST = {
    id: 'community.xxdbx',
    version: '10.0.0',
    name: 'XXDBX',
    description: 'Browse and search videos from xxdbx.com. Click stars/channels/tags in streams to navigate!',
    logo: 'https://www.google.com/s2/favicons?domain=xxdbx.com&sz=256',
    resources: [
        'catalog',
        {
            name: 'meta',
            types: ['channel', 'movie'],
            idPrefixes: ['video_', 'star_', 'ch_', 'tag_', 'date_']
        },
        {
            name: 'stream',
            types: ['movie', 'channel'],
            idPrefixes: ['video_']
        }
    ],
    types: ['channel', 'movie'],
    catalogs: [
        // ── ONE search catalog — movie type, returns VIDEOS only ──
        {
            type: 'movie',
            id: 'xxdbx_search',
            name: 'XXDBX Search',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        },
        // ── Browse catalogs — movie type, no search ──
        {
            type: 'movie',
            id: 'latest',
            name: 'Latest',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'popular',
            name: 'Popular',
            extra: [{ name: 'skip', isRequired: false }]
        },
        // ── Channel catalogs — browse only, NO search ──
        {
            type: 'channel',
            id: 'stars',
            name: 'Stars',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'channel',
            id: 'channels',
            name: 'Channels',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'channel',
            id: 'tags',
            name: 'Tags',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'channel',
            id: 'dates',
            name: 'Dates',
            extra: [{ name: 'skip', isRequired: false }]
        }
    ],
    idPrefixes: ['video_', 'star_', 'ch_', 'tag_', 'date_'],
    behaviorHints: {
        adult: true,
        p2p: false,
        configurable: false,
        configurationRequired: false
    }
};

// ─── Catalog Handler ───────────────────────────────────────

async function handleCatalog(type, id, extra = {}) {
    const search = extra.search;
    const skip = parseInt(extra.skip) || 0;
    const page = Math.floor(skip / 36) + 1;

    try {
        // ── Search catalog — returns VIDEO results only ──
        if (type === 'movie' && id === 'xxdbx_search') {
            if (!search) {
                // No search query — show latest videos
                const html = await cachedFetch(BASE_URL);
                const videos = parseVideoCards(html);
                return videos.map(v => videoToMetaPreview(v));
            }
            const url = page > 1
                ? `${BASE_URL}/search/${encodeURIComponent(search)}?page=${page}`
                : `${BASE_URL}/search/${encodeURIComponent(search)}`;
            const html = await cachedFetch(url);
            const videos = parseVideoCards(html);
            return videos.map(v => videoToMetaPreview(v));
        }

        // ── Latest Videos ──
        if (type === 'movie' && id === 'latest') {
            const url = page > 1 ? `${BASE_URL}/?page=${page}` : BASE_URL;
            const html = await cachedFetch(url);
            const videos = parseVideoCards(html);
            return videos.map(v => videoToMetaPreview(v));
        }

        // ── Most Popular ──
        if (type === 'movie' && id === 'popular') {
            const url = page > 1 ? `${BASE_URL}/most-popular?page=${page}` : `${BASE_URL}/most-popular`;
            const html = await cachedFetch(url);
            const videos = parseVideoCards(html);
            return videos.map(v => videoToMetaPreview(v));
        }

        // ── Stars catalog (browse only) ──
        if (type === 'channel' && id === 'stars') {
            const starMap = {};
            const urls = [
                BASE_URL,
                `${BASE_URL}/?page=2`,
                `${BASE_URL}/?page=3`,
                `${BASE_URL}/most-popular`,
                `${BASE_URL}/most-popular?page=2`,
            ];
            for (const url of urls) {
                try {
                    const html = await cachedFetch(url);
                    const videos = parseVideoCards(html);
                    for (const v of videos) {
                        for (const s of v.stars) {
                            if (!starMap[s.name]) starMap[s.name] = s;
                        }
                    }
                } catch (e) { /* skip page */ }
            }
            return Object.values(starMap).slice(skip, skip + 30).map(s => ({
                id: `star_${encodeId(s.name)}`,
                type: 'channel',
                name: s.name,
                poster: '',
                posterShape: 'poster',
                description: `Browse ${s.name} on XXDBX`,
            }));
        }

        // ── Channels catalog (browse only) ──
        if (type === 'channel' && id === 'channels') {
            const chMap = {};
            const urls = [
                BASE_URL,
                `${BASE_URL}/?page=2`,
                `${BASE_URL}/most-popular`,
                `${BASE_URL}/most-popular?page=2`,
            ];
            for (const url of urls) {
                try {
                    const html = await cachedFetch(url);
                    const videos = parseVideoCards(html);
                    for (const v of videos) {
                        if (v.channel && !chMap[v.channel]) {
                            chMap[v.channel] = v.channel;
                        }
                    }
                } catch (e) { /* skip page */ }
            }
            return Object.keys(chMap).slice(skip, skip + 30).map(name => ({
                id: `ch_${encodeId(name)}`,
                type: 'channel',
                name: name,
                poster: '',
                posterShape: 'poster',
                description: `Browse ${name} on XXDBX`,
            }));
        }

        // ── Tags catalog (browse only) ──
        if (type === 'channel' && id === 'tags') {
            const tagSet = new Set();
            const html = await cachedFetch(BASE_URL);
            const $ = cheerio.load(html);
            const videoLinks = [];
            $('div.v a[href^="/view/"]').each((i, a) => {
                if (i < 5) videoLinks.push($(a).attr('href'));
            });
            for (const link of videoLinks) {
                try {
                    const detailHtml = await cachedFetch(fixUrl(link));
                    const detail = extractVideoDetail(detailHtml);
                    for (const t of detail.tags) {
                        tagSet.add(t.name);
                    }
                } catch (e) { /* skip */ }
            }
            return Array.from(tagSet).slice(skip, skip + 30).map(name => ({
                id: `tag_${encodeId(name)}`,
                type: 'channel',
                name: name,
                poster: '',
                posterShape: 'poster',
                description: `Browse "${name}" on XXDBX`,
            }));
        }

        // ── Dates catalog (browse only) ──
        if (type === 'channel' && id === 'dates') {
            const dateMap = {};
            const urls = [BASE_URL, `${BASE_URL}/?page=2`, `${BASE_URL}/?page=3`];
            for (const url of urls) {
                try {
                    const html = await cachedFetch(url);
                    const videos = parseVideoCards(html);
                    for (const v of videos) {
                        if (v.date && !dateMap[v.date]) dateMap[v.date] = v.poster;
                    }
                } catch (e) { /* skip */ }
            }
            return Object.entries(dateMap)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .slice(skip, skip + 30)
                .map(([name, poster]) => ({
                    id: `date_${encodeId(name)}`,
                    type: 'channel',
                    name: name,
                    poster: poster || '',
                    posterShape: 'poster',
                    description: `Browse ${name} on XXDBX`,
                }));
        }
    } catch (err) {
        console.error('Catalog error:', err.message);
    }

    return [];
}

// ─── Meta Handler ──────────────────────────────────────────

async function handleMeta(type, id) {
    try {
        // ── Video meta ──
        if (id.startsWith('video_')) {
            const videoId = id.replace('video_', '');
            const html = await cachedFetch(`${BASE_URL}/view/${videoId}`);
            const detail = extractVideoDetail(html);

            // Build clickable links for navigation
            const links = [];
            for (const star of detail.stars) {
                links.push({
                    name: star.name,
                    category: 'Stars',
                    url: `stremio:///detail/channel/star_${encodeId(star.name)}`,
                });
            }
            for (const ch of detail.channels) {
                links.push({
                    name: ch.name,
                    category: 'Channels',
                    url: `stremio:///detail/channel/ch_${encodeId(ch.name)}`,
                });
            }
            for (const tag of detail.tags) {
                links.push({
                    name: tag.name,
                    category: 'Tags',
                    url: `stremio:///detail/channel/tag_${encodeId(tag.name)}`,
                });
            }
            for (const date of detail.dates) {
                links.push({
                    name: date.name,
                    category: 'Dates',
                    url: `stremio:///detail/channel/date_${encodeId(date.name)}`,
                });
            }

            return {
                id: id,
                type: 'movie',
                name: detail.title,
                poster: detail.poster,
                posterShape: 'landscape',
                background: detail.poster,
                description: detail.description || detail.title,
                releaseInfo: detail.dates[0]?.name || '',
                genres: detail.tags.map(t => t.name),
                cast: detail.stars.map(s => s.name),
                links: links,
            };
        }

        // ═══════════════════════════════════════════════════════════
        // V10 FIX: Use /stars/{name} and /channels/{name} URLs!
        //
        // These pages DO EXIST on xxdbx.com — they return proper
        // video listings just like V6 used. V9 broke this by
        // switching to /search/{name} URLs.
        // ═══════════════════════════════════════════════════════════

        // ── Star meta — uses /stars/{name} (LIKE V6 WHICH WORKED!) ──
        if (id.startsWith('star_')) {
            const starName = decodeId(id.replace('star_', ''));
            console.log(`[META] star_ decoded: "${starName}" from id: "${id}"`);

            const url = `${BASE_URL}/stars/${encodeURIComponent(starName)}`;
            const html = await cachedFetch(url);
            const $ = cheerio.load(html);
            const h1Text = $('article h1').first().text().trim();

            // Get videos from multiple pages
            const videos = [];
            const seenIds = new Set();
            const maxPages = 3;

            for (let p = 1; p <= maxPages; p++) {
                try {
                    const pUrl = p > 1 ? `${url}${url.includes('?') ? '&' : '?'}page=${p}` : url;
                    const pHtml = await cachedFetch(pUrl);
                    const pVideos = parseVideoCards(pHtml);
                    if (pVideos.length === 0) break;
                    for (const v of pVideos) {
                        if (!seenIds.has(v.videoId)) {
                            seenIds.add(v.videoId);
                            videos.push({
                                id: `video_${v.videoId}`,
                                title: v.title,
                                released: new Date().toISOString().split('T')[0],
                                thumbnail: v.poster,
                                overview: v.duration || '',
                            });
                        }
                    }
                } catch (e) { break; }
            }

            const firstVideo = videos[0];
            const channelPoster = firstVideo ? firstVideo.thumbnail : '';

            return {
                id: id,
                type: 'channel',
                name: starName,
                poster: channelPoster,
                posterShape: 'poster',
                description: h1Text || `Browse ${starName} on XXDBX`,
                genres: ['Star'],
                videos: videos,
                links: [],
            };
        }

        // ── Channel meta — uses /channels/{name} (LIKE V6 WHICH WORKED!) ──
        if (id.startsWith('ch_')) {
            const chName = decodeId(id.replace('ch_', ''));
            console.log(`[META] ch_ decoded: "${chName}" from id: "${id}"`);

            const url = `${BASE_URL}/channels/${encodeURIComponent(chName)}`;
            const html = await cachedFetch(url);
            const $ = cheerio.load(html);
            const h1Text = $('article h1').first().text().trim();

            const videos = [];
            const seenIds = new Set();
            const maxPages = 3;

            for (let p = 1; p <= maxPages; p++) {
                try {
                    const pUrl = p > 1 ? `${url}${url.includes('?') ? '&' : '?'}page=${p}` : url;
                    const pHtml = await cachedFetch(pUrl);
                    const pVideos = parseVideoCards(pHtml);
                    if (pVideos.length === 0) break;
                    for (const v of pVideos) {
                        if (!seenIds.has(v.videoId)) {
                            seenIds.add(v.videoId);
                            videos.push({
                                id: `video_${v.videoId}`,
                                title: v.title,
                                released: new Date().toISOString().split('T')[0],
                                thumbnail: v.poster,
                                overview: v.duration || '',
                            });
                        }
                    }
                } catch (e) { break; }
            }

            const firstVideo = videos[0];
            const channelPoster = firstVideo ? firstVideo.thumbnail : '';

            return {
                id: id,
                type: 'channel',
                name: chName,
                poster: channelPoster,
                posterShape: 'poster',
                description: h1Text || `Browse ${chName} on XXDBX`,
                genres: ['Channel'],
                videos: videos,
                links: [],
            };
        }

        // ── Tag meta — uses /search/{name} ──
        if (id.startsWith('tag_')) {
            const tagName = decodeId(id.replace('tag_', ''));
            console.log(`[META] tag_ decoded: "${tagName}" from id: "${id}"`);

            const url = `${BASE_URL}/search/${encodeURIComponent(tagName)}`;
            const html = await cachedFetch(url);
            const $ = cheerio.load(html);
            const h1Text = $('article h1').first().text().trim();

            const videos = [];
            const seenIds = new Set();
            const maxPages = 3;

            for (let p = 1; p <= maxPages; p++) {
                try {
                    const pUrl = p > 1 ? `${url}${url.includes('?') ? '&' : '?'}page=${p}` : url;
                    const pHtml = await cachedFetch(pUrl);
                    const pVideos = parseVideoCards(pHtml);
                    if (pVideos.length === 0) break;
                    for (const v of pVideos) {
                        if (!seenIds.has(v.videoId)) {
                            seenIds.add(v.videoId);
                            videos.push({
                                id: `video_${v.videoId}`,
                                title: v.title,
                                released: new Date().toISOString().split('T')[0],
                                thumbnail: v.poster,
                                overview: v.duration || '',
                            });
                        }
                    }
                } catch (e) { break; }
            }

            const firstVideo = videos[0];
            const channelPoster = firstVideo ? firstVideo.thumbnail : '';

            return {
                id: id,
                type: 'channel',
                name: tagName,
                poster: channelPoster,
                posterShape: 'poster',
                description: h1Text || `Browse "${tagName}" on XXDBX`,
                genres: ['Tag'],
                videos: videos,
                links: [],
            };
        }

        // ── Date meta — uses /dates/{name} ──
        if (id.startsWith('date_')) {
            const dateStr = decodeId(id.replace('date_', ''));
            console.log(`[META] date_ decoded: "${dateStr}" from id: "${id}"`);

            const url = `${BASE_URL}/dates/${encodeURIComponent(dateStr)}`;
            const html = await cachedFetch(url);
            const $ = cheerio.load(html);
            const h1Text = $('article h1').first().text().trim();

            const videos = [];
            const seenIds = new Set();
            const maxPages = 3;

            for (let p = 1; p <= maxPages; p++) {
                try {
                    const pUrl = p > 1 ? `${url}${url.includes('?') ? '&' : '?'}page=${p}` : url;
                    const pHtml = await cachedFetch(pUrl);
                    const pVideos = parseVideoCards(pHtml);
                    if (pVideos.length === 0) break;
                    for (const v of pVideos) {
                        if (!seenIds.has(v.videoId)) {
                            seenIds.add(v.videoId);
                            videos.push({
                                id: `video_${v.videoId}`,
                                title: v.title,
                                released: new Date().toISOString().split('T')[0],
                                thumbnail: v.poster,
                                overview: v.duration || '',
                            });
                        }
                    }
                } catch (e) { break; }
            }

            const firstVideo = videos[0];
            const channelPoster = firstVideo ? firstVideo.thumbnail : '';

            return {
                id: id,
                type: 'channel',
                name: dateStr,
                poster: channelPoster,
                posterShape: 'poster',
                description: h1Text || `Browse ${dateStr} on XXDBX`,
                genres: ['Date'],
                videos: videos,
                links: [],
            };
        }
    } catch (err) {
        console.error('Meta error:', err.message, 'for id:', id);
    }

    return { id, type: type || 'channel', name: 'Error loading', poster: '' };
}

// ─── Stream Handler ────────────────────────────────────────

async function handleStream(type, id, addonBase) {
    if (!id.startsWith('video_')) return { streams: [] };

    const videoId = id.replace('video_', '');
    const base = addonBase || ADDON_BASE_DEFAULT;
    const streams = [];

    try {
        // ── 1. Proxy play streams ──
        const qualities = ['1080', '720', '360'];
        const QUALITY_LABELS = {
            '360': '360p',
            '720': '720p HD',
            '1080': '1080p FHD',
        };

        for (const q of qualities) {
            streams.push({
                name: 'XXDBX',
                title: QUALITY_LABELS[q] || `${q}p`,
                url: `${base}/play/${videoId}/${q}.mp4`,
                behaviorHints: { notWebReady: false },
            });
        }

        // ── 2. Navigation streams (clickable links to stars/channels/tags) ──
        // These work because /stars/{name} and /channels/{name} pages EXIST on xxdbx.com!
        const html = await cachedFetch(`${BASE_URL}/view/${videoId}`);
        const detail = extractVideoDetail(html);

        // Stars
        for (const star of detail.stars.slice(0, 10)) {
            streams.push({
                name: '⭐ Star',
                title: star.name,
                externalUrl: `stremio:///detail/channel/star_${encodeId(star.name)}`,
                behaviorHints: { group: 'stars' },
            });
        }

        // Channels
        for (const ch of detail.channels.slice(0, 5)) {
            streams.push({
                name: '🏠 Channel',
                title: ch.name,
                externalUrl: `stremio:///detail/channel/ch_${encodeId(ch.name)}`,
                behaviorHints: { group: 'channels' },
            });
        }

        // Tags
        for (const tag of detail.tags.slice(0, 10)) {
            streams.push({
                name: '🏷️ Tag',
                title: tag.name,
                externalUrl: `stremio:///detail/channel/tag_${encodeId(tag.name)}`,
                behaviorHints: { group: 'tags' },
            });
        }

        // Dates
        for (const date of detail.dates.slice(0, 5)) {
            streams.push({
                name: '📅 Date',
                title: date.name,
                externalUrl: `stremio:///detail/channel/date_${encodeId(date.name)}`,
                behaviorHints: { group: 'dates' },
            });
        }

    } catch (err) {
        console.error('Stream error:', err.message);
    }

    return { streams };
}

// ─── Stream Proxy ──────────────────────────────────────────

async function handlePlayProxy(req, res) {
    const match = req.url.match(/\/play\/(\d+)\/([^/]+\.mp4)/);
    if (!match) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid play URL' }));
        return;
    }

    const videoId = match[1];
    const qualityFile = match[2];
    const qualityMatch = qualityFile.match(/(\d+)p?\.mp4/);
    const quality = qualityMatch ? qualityMatch[1] + 'p' : '720p';

    try {
        const detailUrl = `${BASE_URL}/view/${videoId}`;
        const pageRes = await fetch(detailUrl, { headers: HEADERS, timeout: 15000 });
        if (!pageRes.ok) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: `Failed to fetch video page: HTTP ${pageRes.status}` }));
            return;
        }
        const html = await pageRes.text();

        // Extract MP4 URL for the requested quality
        const $ = cheerio.load(html);
        let mp4Url = null;
        $('video#p source').each((_, el) => {
            const src = $(el).attr('src') || '';
            const q = $(el).attr('title') || '';
            if (src && q && !src.includes('bxcdn.net')) {
                if (q === quality && !mp4Url) {
                    mp4Url = fixUrl(src);
                }
            }
        });

        // Fallback to any available quality
        if (!mp4Url) {
            $('video#p source').each((_, el) => {
                const src = $(el).attr('src') || '';
                const q = $(el).attr('title') || '';
                if (src && q && !src.includes('bxcdn.net') && !mp4Url) {
                    mp4Url = fixUrl(src);
                }
            });
        }

        if (!mp4Url) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'No stream URL found' }));
            return;
        }

        // Fetch MP4 from CDN (from Vercel's IP)
        const proxyHeaders = {
            'User-Agent': HEADERS['User-Agent'],
            'Referer': 'https://xxdbx.com/',
            'Accept': '*/*',
        };
        if (req.headers.range) {
            proxyHeaders.Range = req.headers.range;
        }

        const mp4Res = await fetch(mp4Url, { headers: proxyHeaders, timeout: 30000 });

        if (!mp4Res.ok && mp4Res.status !== 206) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: `CDN returned HTTP ${mp4Res.status}` }));
            return;
        }

        const contentType = mp4Res.headers.get('content-type') || 'video/mp4';
        const contentLength = mp4Res.headers.get('content-length');
        const contentRange = mp4Res.headers.get('content-range');
        const acceptRanges = mp4Res.headers.get('accept-ranges');

        res.statusCode = mp4Res.status;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);
        if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

        mp4Res.body.pipe(res);
    } catch (err) {
        console.error('Play proxy error:', err.message);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
        }
    }
}

// ─── Routes ────────────────────────────────────────────────

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(MANIFEST);
});

app.get('/catalog/:type/:id.json', async (req, res) => {
    try {
        const { type, id } = req.params;
        const extra = {};
        if (req.query.search) extra.search = req.query.search;
        if (req.query.skip) extra.skip = req.query.skip;

        const metas = await handleCatalog(type, id, extra);
        res.json({ metas });
    } catch (err) {
        console.error('Catalog error:', err.message);
        res.json({ metas: [] });
    }
});

app.get('/catalog/:type/:id/search=:search.json', async (req, res) => {
    try {
        const { type, id, search } = req.params;
        const extra = { search: decodeURIComponent(search) };
        if (req.query.skip) extra.skip = req.query.skip;

        const metas = await handleCatalog(type, id, extra);
        res.json({ metas });
    } catch (err) {
        console.error('Catalog search error:', err.message);
        res.json({ metas: [] });
    }
});

app.get('/meta/:type/:id.json', async (req, res) => {
    try {
        const { type, id } = req.params;
        const meta = await handleMeta(type, id);
        res.json({ meta });
    } catch (err) {
        console.error('Meta error:', err.message, 'for id:', req.params.id);
        res.json({ meta: { id: req.params.id, type: req.params.type, name: 'Error loading', poster: '' } });
    }
});

app.get('/stream/:type/:id.json', async (req, res) => {
    try {
        const { type, id } = req.params;
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const addonBase = host ? `${proto}://${host}` : ADDON_BASE_DEFAULT;
        const result = await handleStream(type, id, addonBase);
        res.json(result);
    } catch (err) {
        console.error('Stream error:', err.message);
        res.json({ streams: [] });
    }
});

// Handle /play/ proxy requests
app.get('/play/:videoId/:qualityFile', handlePlayProxy);

// For local development
if (require.main === module) {
    const PORT = process.env.PORT || 7000;
    app.listen(PORT, () => {
        console.log(`XXDBX Stremio addon V10 running on http://localhost:${PORT}`);
    });
}

module.exports = app;
