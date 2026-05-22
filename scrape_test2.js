const fetch = require('/tmp/my-project/w1mp-stremio-addon/node_modules/node-fetch');
const cheerio = require('/tmp/my-project/w1mp-stremio-addon/node_modules/cheerio');

async function main() {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
  };

  // 1. Tags page structure
  console.log('=== TAGS PAGE STRUCTURE ===');
  const tRes = await fetch('https://w1mp.com/tags/', { headers: HEADERS });
  const tHtml = await tRes.text();
  const t$ = cheerio.load(tHtml);
  
  // Look for tag items
  t$('.tag, .tags-list a, .tags-cloud a, .tag-item').slice(0, 20).each((i, el) => {
    console.log(i, t$(el).attr('href'), '|', t$(el).text().trim(), '| class:', t$(el).attr('class'));
  });
  
  // Check generic links with /tags/
  const tagLinks = [];
  t$('a').each((i, el) => {
    const href = t$(el).attr('href') || '';
    if (href.match(/^\/tags\/[^/]+\/?$/) || href.match(/^https:\/\/w1mp\.com\/tags\/[^/]+\/?$/)) {
      tagLinks.push({ href, text: t$(el).text().trim() });
    }
  });
  console.log('\nDirect tag links (first 20):');
  tagLinks.slice(0, 20).forEach((t, i) => console.log(i, t.href, '|', t.text));

  // 2. Video page - extract metadata sections more carefully
  console.log('\n\n=== VIDEO PAGE META SECTIONS ===');
  const vRes = await fetch('https://w1mp.com/video/492438/test/', { headers: HEADERS });
  const vHtml = await vRes.text();
  const v$ = cheerio.load(vHtml);
  
  // Look for the meta/info section
  console.log('Video info section:');
  v$('.video-info, .video-meta, .video-details, .info-list, .meta-info, [class*="info"], [class*="detail"]').each((i, el) => {
    const text = v$(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 0 && text.length < 500) {
      console.log(i, v$(el).attr('class'), '|', text.substring(0, 300));
    }
  });
  
  // Look for date
  console.log('\nDate search:');
  v$('time, [datetime], [class*="date"], [class*="time"], .added, .posted').each((i, el) => {
    console.log(i, v$(el).attr('class'), '| text:', v$(el).text().trim(), '| datetime:', v$(el).attr('datetime'));
  });
  
  // Get the "about" or "description" section
  console.log('\nAbout/Description:');
  v$('.about, .description, [class*="about"], [class*="descr"]').each((i, el) => {
    const text = v$(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 0 && text.length < 500) {
      console.log(i, v$(el).attr('class'), '|', text.substring(0, 300));
    }
  });

  // Get model sections specifically - look for parent containers
  console.log('\nModel sections:');
  // The model links were at indices 77-78 and 105-106, then 219-220, then 225-335
  // Let me look at what containers hold these
  const modelLinks = v$('a').filter((i, el) => {
    const href = v$(el).attr('href') || '';
    return href.includes('/models/') && !href.endsWith('/models/');
  });
  
  // Get unique model slugs from the first set (video actors)
  const seen = new Set();
  modelLinks.each((i, el) => {
    const href = v$(el).attr('href') || '';
    const slug = href.match(/\/models\/([^/]+)\/?/);
    if (slug && !seen.has(slug[1])) {
      seen.add(slug[1]);
      const parent = v$(el).parent();
      const parentClass = parent.attr('class') || '';
      const grandparent = parent.parent();
      const gpClass = grandparent.attr('class') || '';
      console.log('Model:', slug[1], '|', v$(el).text().trim(), '| parent class:', parentClass, '| gp class:', gpClass);
    }
  });

  // Get the "related models" section
  console.log('\nRelated section:');
  v$('.related, [class*="related"], .sidebar, [class*="sidebar"]').each((i, el) => {
    const text = v$(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      console.log(i, v$(el).attr('class'), '|', text.substring(0, 300));
    }
  });
  
  // 3. A tag page
  console.log('\n\n=== TAG PAGE (british) ===');
  const tagRes = await fetch('https://w1mp.com/tags/british/', { headers: HEADERS });
  console.log('Tag page status:', tagRes.status);
  if (tagRes.ok) {
    const tagHtml = await tagRes.text();
    const tag$ = cheerio.load(tagHtml);
    const title = tag$('.headline .title, .viewlist-headline .title, h1').first().text().trim();
    console.log('Tag page title:', title);
    
    // Video cards
    let videoCount = 0;
    tag$('.card.item').each((i, el) => {
      videoCount++;
    });
    console.log('Video cards on tag page:', videoCount);
  }
  
  // 4. Check the specific model poster pattern
  console.log('\n\n=== MODEL POSTER PATTERNS ===');
  // From martin-spell model page:
  // Full image: https://cdnstatic.w1mp.com/contents/models/7170/martin-spell.jpg  (class: "image")
  // Icon image: https://cdnstatic.w1mp.com/contents/models/7170/martin-spell_ico.jpg
  // From kwini-kim model page: NO model image found (only flag images and other models)
  console.log('Model poster URL pattern: https://cdnstatic.w1mp.com/contents/models/{id}/{slug}.jpg');
  console.log('Model icon URL pattern: https://cdnstatic.w1mp.com/contents/models/{id}/{slug}_ico.jpg');
  console.log('Kwini Kim has NO model image on her page (no cdnstatic model image)');
  console.log('Martin Spell has image at: https://cdnstatic.w1mp.com/contents/models/7170/martin-spell.jpg');
  
  // 5. Get model ID from model page
  console.log('\n\n=== EXTRACTING MODEL ID ===');
  const msRes2 = await fetch('https://w1mp.com/models/martin-spell/', { headers: HEADERS });
  const msHtml2 = await msRes2.text();
  // Look for model ID in the HTML
  const idPatterns = [
    /data-model-id="(\d+)"/,
    /model_id=(\d+)/,
    /models\/(\d+)\//,
    /contents\/models\/(\d+)\//,
  ];
  for (const pat of idPatterns) {
    const match = msHtml2.match(pat);
    if (match) {
      console.log('Found model ID with pattern', pat, ':', match[1]);
    }
  }
  // Extract from img src
  const ms$2 = cheerio.load(msHtml2);
  ms$2('img.image').each((i, el) => {
    const src = ms$2(el).attr('src') || '';
    console.log('Image class=image:', src);
  });
  
  // 6. Try a different video to check date format
  console.log('\n\n=== ANOTHER VIDEO PAGE ===');
  const v2Res = await fetch('https://w1mp.com/latest-updates/', { headers: HEADERS });
  const v2Html = await v2Res.text();
  const v2$ = cheerio.load(v2Html);
  const firstVideo = v2$('.card.item').first();
  const firstLink = firstVideo.find('a[href*="/video/"]').first().attr('href');
  console.log('First video link:', firstLink);
  
  if (firstLink) {
    const v3Res = await fetch('https://w1mp.com' + firstLink, { headers: HEADERS });
    const v3Html = await v3Res.text();
    const v3$ = cheerio.load(v3Html);
    
    // JSON-LD
    const ldMatch2 = v3Html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch2) {
      try {
        const ld = JSON.parse(ldMatch2[1]);
        if (ld.datePublished) {
          console.log('datePublished:', ld.datePublished);
        }
        if (ld.uploadDate) {
          console.log('uploadDate:', ld.uploadDate);
        }
        if (ld.name) {
          console.log('name:', ld.name);
        }
        if (ld.actor) {
          console.log('actors:', JSON.stringify(ld.actor));
        }
        if (ld.genre) {
          console.log('genres:', JSON.stringify(ld.genre));
        }
        if (ld.duration) {
          console.log('duration:', ld.duration);
        }
      } catch(e) {}
    }
    
    // Model and tag links
    console.log('\nModel links:');
    const modelSeen = new Set();
    v3$('a').each((i, el) => {
      const href = v3$(el).attr('href') || '';
      const slugMatch = href.match(/\/models\/([^/]+)\/?$/);
      if (slugMatch && !modelSeen.has(slugMatch[1])) {
        modelSeen.add(slugMatch[1]);
        console.log(' ', slugMatch[1], '|', v3$(el).text().trim());
      }
    });
    
    console.log('\nTag links:');
    const tagSeen = new Set();
    v3$('a').each((i, el) => {
      const href = v3$(el).attr('href') || '';
      const tagMatch = href.match(/\/tags\/([^/]+)\/?$/);
      if (tagMatch && !tagSeen.has(tagMatch[1])) {
        tagSeen.add(tagMatch[1]);
        console.log(' ', tagMatch[1], '|', v3$(el).text().trim());
      }
    });
    
    console.log('\nCategory links:');
    const catSeen = new Set();
    v3$('a').each((i, el) => {
      const href = v3$(el).attr('href') || '';
      const catMatch = href.match(/\/categories\/([^/]+)\/?$/);
      if (catMatch && !catSeen.has(catMatch[1])) {
        catSeen.add(catMatch[1]);
        console.log(' ', catMatch[1], '|', v3$(el).text().trim());
      }
    });
  }
}

main().catch(e => console.error(e));
