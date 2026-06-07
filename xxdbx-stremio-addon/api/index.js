const express = require('express');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE_URL = 'https://xxdbx.com';
// Will be overridden per-request from req.headers.host
const ADDON_BASE_DEFAULT = 'https://xxdbx-addon.vercel.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Helpers ───────────────────────────────────────────────

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function encodeNameForId(name) {
  return encodeURIComponent(name);
}

function decodeNameFromId(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch (e) {
    return encoded;
  }
}

function parseVideoCard(el, $) {
  const linkEl = el.find('a[href*="/view/"]').first();
  const href = linkEl.attr('href') || '';
  const videoId = href.replace('/view/', '');
  if (!videoId) return null;

  const title = el.find('.v_title').text().trim();
  const duration = el.find('.v_dur').text().trim();

  const imgEl = el.find('.v_pic').first();
  const thumbSrc = imgEl.attr('data-src') || imgEl.attr('src') || '';
  const poster = thumbSrc ? (thumbSrc.startsWith('http') ? thumbSrc : `https://xxdbx.com${thumbSrc}`) : '';

  const stars = [];
  let channel = '';
  let date = '';

  el.find('.v_tags a').each((_, a) => {
    const href = $(a).attr('href') || '';
    const text = $(a).text().trim();
    if (href.startsWith('/stars/')) {
      stars.push(text);
    } else if (href.startsWith('/channels/')) {
      channel = text;
    } else if (href.startsWith('/dates/')) {
      date = text;
    }
  });

  return { videoId, title, duration, poster, stars, channel, date };
}

function parseVideoCards(html) {
  const $ = cheerio.load(html);
  const videos = [];
  $('.v').each((_, el) => {
    const v = parseVideoCard($(el), $);
    if (v) videos.push(v);
  });
  return videos;
}

// ─── Manifest ──────────────────────────────────────────────

const MANIFEST = {
  id: 'community.xxdbx',
  version: '6.1.0',
  name: 'XXDBX',
  description: 'Browse stars, channels, tags, dates and videos from xxdbx.com. Click stars/channels/tags/dates in streams to navigate!',
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
      types: ['movie'],
      idPrefixes: ['video_']
    }
  ],
  types: ['channel', 'movie'],
  catalogs: [
    {
      type: 'channel',
      id: 'stars',
      name: 'Stars',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'channel',
      id: 'channels',
      name: 'Channels',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'channel',
      id: 'tags',
      name: 'Tags',
      extra: [
        { name: 'search', isRequired: false }
      ]
    },
    {
      type: 'channel',
      id: 'dates',
      name: 'Dates',
      extra: [
        { name: 'search', isRequired: false }
      ]
    },
    {
      type: 'movie',
      id: 'latest',
      name: 'Latest Videos',
      extra: [
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'movie',
      id: 'popular',
      name: 'Most Popular',
      extra: [
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'movie',
      id: 'video_search',
      name: 'Video Search',
      extra: [
        { name: 'search', isRequired: true }
      ]
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
  const page = Math.floor(skip / 30) + 1;

  if (type === 'movie' && id === 'latest') {
    const url = page > 1 ? `${BASE_URL}/?page=${page}` : BASE_URL;
    const html = await fetchPage(url);
    const videos = parseVideoCards(html);
    return videos.map(v => ({
      id: `video_${v.videoId}`,
      type: 'movie',
      name: v.title,
      poster: v.poster,
      posterShape: 'poster',
      description: `${v.duration} | ${v.stars.join(', ')} | ${v.channel}`
    }));
  }

  if (type === 'movie' && id === 'popular') {
    const url = page > 1 ? `${BASE_URL}/most-popular?page=${page}` : `${BASE_URL}/most-popular`;
    const html = await fetchPage(url);
    const videos = parseVideoCards(html);
    return videos.map(v => ({
      id: `video_${v.videoId}`,
      type: 'movie',
      name: v.title,
      poster: v.poster,
      posterShape: 'poster',
      description: `${v.duration} | ${v.stars.join(', ')} | ${v.channel}`
    }));
  }

  if (type === 'movie' && id === 'video_search') {
    if (!search) return [];
    const url = `${BASE_URL}/search/${encodeURIComponent(search)}${page > 1 ? `?page=${page}` : ''}`;
    const html = await fetchPage(url);
    const videos = parseVideoCards(html);
    return videos.map(v => ({
      id: `video_${v.videoId}`,
      type: 'movie',
      name: v.title,
      poster: v.poster,
      posterShape: 'poster',
      description: `${v.duration} | ${v.stars.join(', ')} | ${v.channel}`
    }));
  }

  if (type === 'channel' && id === 'stars') {
    const pagesToFetch = search ? [1] : [1, 2, 3, 4, 5];
    const starSet = new Map();

    for (const p of pagesToFetch) {
      try {
        const url = p === 1 ? BASE_URL : `${BASE_URL}/?page=${p}`;
        const html = await fetchPage(url);
        const videos = parseVideoCards(html);
        videos.forEach(v => v.stars.forEach(s => starSet.set(s, v.poster)));
      } catch (e) { /* skip page */ }
    }

    let stars = Array.from(starSet.entries());
    if (search) {
      stars = stars.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));
    }
    return stars.slice(skip, skip + 30).map(([name, poster]) => ({
      id: `star_${encodeNameForId(name)}`,
      type: 'channel',
      name: name,
      poster: poster,
      posterShape: 'poster'
    }));
  }

  if (type === 'channel' && id === 'channels') {
    const pagesToFetch = search ? [1] : [1, 2, 3, 4, 5];
    const chSet = new Map();

    for (const p of pagesToFetch) {
      try {
        const url = p === 1 ? BASE_URL : `${BASE_URL}/?page=${p}`;
        const html = await fetchPage(url);
        const videos = parseVideoCards(html);
        videos.forEach(v => { if (v.channel) chSet.set(v.channel, v.poster); });
      } catch (e) { /* skip page */ }
    }

    let channels = Array.from(chSet.entries());
    if (search) {
      channels = channels.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));
    }
    return channels.slice(skip, skip + 30).map(([name, poster]) => ({
      id: `ch_${encodeNameForId(name)}`,
      type: 'channel',
      name: name,
      poster: poster,
      posterShape: 'poster'
    }));
  }

  if (type === 'channel' && id === 'tags') {
    if (search) {
      const html = await fetchPage(`${BASE_URL}/search/${encodeURIComponent(search)}`);
      const $ = cheerio.load(html);
      const videoLinks = [];
      $('.v a[href*="/view/"]').each((i, a) => {
        if (i < 3) videoLinks.push($(a).attr('href'));
      });
      const tagSet = new Set();
      for (const link of videoLinks) {
        try {
          const detailHtml = await fetchPage(`${BASE_URL}${link}`);
          const $$ = cheerio.load(detailHtml);
          $$('.tags a[href^="/search/"]').each((_, a) => {
            const text = $$(a).text().trim();
            if (text && text.toLowerCase().includes(search.toLowerCase())) tagSet.add(text);
          });
        } catch (e) { /* skip */ }
      }
      return Array.from(tagSet).slice(skip, skip + 30).map(name => ({
        id: `tag_${encodeNameForId(name)}`,
        type: 'channel',
        name: name,
        poster: '',
        posterShape: 'poster'
      }));
    }
    const html = await fetchPage(BASE_URL);
    const $ = cheerio.load(html);
    const videoLinks = [];
    $('.v a[href*="/view/"]').each((i, a) => {
      if (i < 8) videoLinks.push($(a).attr('href'));
    });
    const tagSet = new Set();
    for (const link of videoLinks) {
      try {
        const detailHtml = await fetchPage(`${BASE_URL}${link}`);
        const $$ = cheerio.load(detailHtml);
        $$('.tags a[href^="/search/"]').each((_, a) => {
          const text = $$(a).text().trim();
          if (text) tagSet.add(text);
        });
      } catch (e) { /* skip */ }
    }
    return Array.from(tagSet).slice(skip, skip + 30).map(name => ({
      id: `tag_${encodeNameForId(name)}`,
      type: 'channel',
      name: name,
      poster: '',
      posterShape: 'poster'
    }));
  }

  if (type === 'channel' && id === 'dates') {
    const pagesToFetch = [1, 2, 3, 4, 5];
    const dateSet = new Map();

    for (const p of pagesToFetch) {
      try {
        const url = p === 1 ? BASE_URL : `${BASE_URL}/?page=${p}`;
        const html = await fetchPage(url);
        const videos = parseVideoCards(html);
        videos.forEach(v => {
          if (v.date) {
            if (!dateSet.has(v.date)) dateSet.set(v.date, v.poster);
          }
        });
      } catch (e) { /* skip page */ }
    }

    let dates = Array.from(dateSet.entries());
    if (search) {
      dates = dates.filter(([name]) => name.includes(search));
    }
    dates.sort((a, b) => b[0].localeCompare(a[0]));
    return dates.slice(skip, skip + 30).map(([name, poster]) => ({
      id: `date_${encodeNameForId(name)}`,
      type: 'channel',
      name: name,
      poster: poster,
      posterShape: 'poster'
    }));
  }

  return [];
}

// ─── Meta Handler ──────────────────────────────────────────

async function handleMeta(type, id) {
  if (id.startsWith('video_')) {
    const videoId = id.replace('video_', '');
    const html = await fetchPage(`${BASE_URL}/view/${videoId}`);
    const $ = cheerio.load(html);

    const title = $('h1').first().text().trim();
    const desc = $('#desc').text().trim();
    const poster = $('video#p').attr('poster');
    const posterUrl = poster ? (poster.startsWith('http') ? poster : `${BASE_URL}${poster}`) : '';

    const genres = [];
    $('.tags a[href^="/search/"]').each((_, a) => {
      genres.push($(a).text().trim());
    });

    return {
      id: `video_${videoId}`,
      type: 'movie',
      name: title,
      poster: posterUrl,
      posterShape: 'poster',
      description: desc,
      genres: genres,
      releaseInfo: ''
    };
  }

  if (id.startsWith('star_')) {
    const starName = decodeNameFromId(id.replace('star_', ''));
    const url = `${BASE_URL}/stars/${encodeURIComponent(starName)}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const h1Text = $('h1').first().text().trim();
    const videos = [];

    $('.v').each((_, el) => {
      const v = parseVideoCard($(el), $);
      if (v) {
        videos.push({
          id: `video_${v.videoId}`,
          title: v.title,
          thumbnail: v.poster,
          duration: v.duration,
          released: new Date(v.date || Date.now()).toISOString()
        });
      }
    });

    const firstVideo = videos[0];
    const channelPoster = firstVideo ? firstVideo.thumbnail : '';

    return {
      id: id,
      type: 'channel',
      name: starName,
      poster: channelPoster,
      posterShape: 'poster',
      description: h1Text,
      genres: ['Star'],
      videos: videos
    };
  }

  if (id.startsWith('ch_')) {
    const chName = decodeNameFromId(id.replace('ch_', ''));
    const url = `${BASE_URL}/channels/${encodeURIComponent(chName)}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const h1Text = $('h1').first().text().trim();
    const videos = [];

    $('.v').each((_, el) => {
      const v = parseVideoCard($(el), $);
      if (v) {
        videos.push({
          id: `video_${v.videoId}`,
          title: v.title,
          thumbnail: v.poster,
          duration: v.duration,
          released: new Date(v.date || Date.now()).toISOString()
        });
      }
    });

    const firstVideo = videos[0];
    const channelPoster = firstVideo ? firstVideo.thumbnail : '';

    return {
      id: id,
      type: 'channel',
      name: chName,
      poster: channelPoster,
      posterShape: 'poster',
      description: h1Text,
      genres: ['Channel'],
      videos: videos
    };
  }

  if (id.startsWith('tag_')) {
    const tagName = decodeNameFromId(id.replace('tag_', ''));
    const url = `${BASE_URL}/search/${encodeURIComponent(tagName)}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const h1Text = $('h1').first().text().trim();
    const videos = [];

    $('.v').each((_, el) => {
      const v = parseVideoCard($(el), $);
      if (v) {
        videos.push({
          id: `video_${v.videoId}`,
          title: v.title,
          thumbnail: v.poster,
          duration: v.duration,
          released: new Date(v.date || Date.now()).toISOString()
        });
      }
    });

    const firstVideo = videos[0];
    const channelPoster = firstVideo ? firstVideo.thumbnail : '';

    return {
      id: id,
      type: 'channel',
      name: tagName,
      poster: channelPoster,
      posterShape: 'poster',
      description: h1Text,
      genres: ['Tag'],
      videos: videos
    };
  }

  if (id.startsWith('date_')) {
    const dateStr = decodeNameFromId(id.replace('date_', ''));
    const url = `${BASE_URL}/dates/${encodeURIComponent(dateStr)}`;
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const h1Text = $('h1').first().text().trim();
    const videos = [];

    $('.v').each((_, el) => {
      const v = parseVideoCard($(el), $);
      if (v) {
        videos.push({
          id: `video_${v.videoId}`,
          title: v.title,
          thumbnail: v.poster,
          duration: v.duration,
          released: new Date(v.date || Date.now()).toISOString()
        });
      }
    });

    const firstVideo = videos[0];
    const channelPoster = firstVideo ? firstVideo.thumbnail : '';

    return {
      id: id,
      type: 'channel',
      name: dateStr,
      poster: channelPoster,
      posterShape: 'poster',
      description: h1Text,
      genres: ['Date'],
      videos: videos
    };
  }

  return { id, type, name: 'Unknown', poster: '' };
}

// ─── Stream Handler ────────────────────────────────────────

async function handleStream(type, id, addonBase) {
  if (!id.startsWith('video_')) return { streams: [] };

  const videoId = id.replace('video_', '');
  const html = await fetchPage(`${BASE_URL}/view/${videoId}`);
  const $ = cheerio.load(html);

  const streams = [];
  const base = addonBase || ADDON_BASE_DEFAULT;

  // Extract video URLs from <source> tags and return PROXIED URLs
  // The direct CDN URLs are IP-bound — they 403 from the user's device
  // so we proxy through Vercel where the token was generated from the same IP
  $('video source').each((_, el) => {
    const quality = $(el).attr('title') || '';
    if (quality) {
      // Use proxy URL — the proxy will fetch the page fresh and pipe the MP4
      streams.push({
        name: 'XXDBX',
        title: quality,
        url: `${base}/play/${videoId}/${quality.replace('p', '')}.mp4`,
        behaviorHints: { notWebReady: false }
      });
    }
  });

  // Sort streams by quality (highest first)
  const qualityOrder = { '1080p': 3, '720p': 2, '360p': 1 };
  streams.sort((a, b) => (qualityOrder[b.title] || 0) - (qualityOrder[a.title] || 0));

  // Add clickable channel streams
  // Stars
  $('.tags a[href^="/stars/"]').each((_, el) => {
    const name = $(el).text().trim();
    if (name) {
      const starId = `star_${encodeNameForId(name)}`;
      streams.push({
        name: '⭐ Star',
        title: name,
        externalUrl: `stremio:///detail/channel/${starId}`,
        behaviorHints: { group: 'stars' }
      });
    }
  });

  // Channel
  $('.tags a[href^="/channels/"]').each((_, el) => {
    const name = $(el).text().trim();
    if (name) {
      const chId = `ch_${encodeNameForId(name)}`;
      streams.push({
        name: '🏠 Channel',
        title: name,
        externalUrl: `stremio:///detail/channel/${chId}`,
        behaviorHints: { group: 'channels' }
      });
    }
  });

  // Date
  $('.tags a[href^="/dates/"]').each((_, el) => {
    const date = $(el).text().trim();
    if (date) {
      const dateId = `date_${encodeNameForId(date)}`;
      streams.push({
        name: '📅 Date',
        title: date,
        externalUrl: `stremio:///detail/channel/${dateId}`,
        behaviorHints: { group: 'dates' }
      });
    }
  });

  // Tags
  $('.tags a[href^="/search/"]').each((_, el) => {
    const name = $(el).text().trim();
    if (name) {
      const tagId = `tag_${encodeNameForId(name)}`;
      streams.push({
        name: '🏷️ Tag',
        title: name,
        externalUrl: `stremio:///detail/channel/${tagId}`,
        behaviorHints: { group: 'tags' }
      });
    }
  });

  return { streams };
}

// ─── Stream Proxy ──────────────────────────────────────────
// The CDN tokens are IP-bound — they only work from the IP that fetched the video page.
// This proxy fetches the page fresh from Vercel's IP and pipes the MP4 data back.

const QUALITY_MAP = {
  '1080.mp4': '1080p',
  '720.mp4': '720p',
  '360.mp4': '360p'
};

app.get('/play/:videoId/:qualityFile', async (req, res) => {
  const { videoId, qualityFile } = req.params;

  try {
    // Fetch the video page fresh from Vercel's IP to get valid tokens
    const html = await fetchPage(`${BASE_URL}/view/${videoId}`);
    const $ = cheerio.load(html);

    // Find the matching quality source
    let mp4Url = null;
    $('video source').each((_, el) => {
      const quality = $(el).attr('title') || '';
      const src = $(el).attr('src') || '';
      // Match quality: "1080p" → "1080.mp4", "720p" → "720.mp4", etc.
      if (quality && src && qualityFile === `${quality.replace('p', '')}.mp4`) {
        mp4Url = src.startsWith('//') ? `https:${src}` : src;
        return false; // break
      }
    });

    if (!mp4Url) {
      // Fallback: try first available source
      const firstSrc = $('video source').first().attr('src');
      if (firstSrc) {
        mp4Url = firstSrc.startsWith('//') ? `https:${firstSrc}` : firstSrc;
      }
    }

    if (!mp4Url) {
      return res.status(404).send('No stream found');
    }

    // Fetch the MP4 from the CDN (from Vercel's IP — matches the token!)
    const range = req.headers.range;
    const fetchHeaders = { 'User-Agent': UA };
    if (range) {
      fetchHeaders['Range'] = range;
    }

    const mp4Res = await fetch(mp4Url, { headers: fetchHeaders });

    if (!mp4Res.ok && mp4Res.status !== 206) {
      return res.status(mp4Res.status).send(`CDN returned ${mp4Res.status}`);
    }

    // Pass through content headers
    const contentType = mp4Res.headers.get('content-type') || 'video/mp4';
    const contentLength = mp4Res.headers.get('content-length');
    const contentRange = mp4Res.headers.get('content-range');
    const acceptRanges = mp4Res.headers.get('accept-ranges');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');

    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
      res.status(206);
    }
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Pipe the MP4 data back to Stremio
    mp4Res.body.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).send('Proxy error');
  }
});

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
    // Determine the addon base URL from the request host
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

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 7000;
  app.listen(PORT, () => {
    console.log(`XXDBX Stremio addon running on http://localhost:${PORT}`);
    console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
  });
}

module.exports = app;
