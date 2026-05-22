const fetch = require('/tmp/my-project/w1mp-stremio-addon/node_modules/node-fetch');
const cheerio = require('/tmp/my-project/w1mp-stremio-addon/node_modules/cheerio');

async function main() {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
  };

  // 1. Video page
  console.log('=== VIDEO PAGE ===');
  const vRes = await fetch('https://w1mp.com/video/492438/test/', { headers: HEADERS });
  const vHtml = await vRes.text();
  const v$ = cheerio.load(vHtml);
  
  // JSON-LD
  const ldMatch = vHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      console.log('JSON-LD:', JSON.stringify(ld, null, 2).substring(0, 3000));
    } catch(e) {
      console.log('Parse error:', e.message);
    }
  } else {
    console.log('No JSON-LD found');
  }
  
  // Model links
  console.log('\n=== MODEL LINKS on VIDEO ===');
  v$('a').each((i, el) => {
    const href = v$(el).attr('href') || '';
    if (href.includes('/models/')) {
      console.log(i, href, '|', v$(el).text().trim(), '| class:', v$(el).attr('class'));
    }
  });
  
  // Category links
  console.log('\n=== CATEGORY LINKS on VIDEO ===');
  v$('a').each((i, el) => {
    const href = v$(el).attr('href') || '';
    if (href.includes('/categories/')) {
      console.log(i, href, '|', v$(el).text().trim(), '| class:', v$(el).attr('class'));
    }
  });

  // Tag links
  console.log('\n=== TAG LINKS on VIDEO ===');
  v$('a').each((i, el) => {
    const href = v$(el).attr('href') || '';
    if (href.includes('/tags/')) {
      console.log(i, href, '|', v$(el).text().trim());
    }
  });

  // 2. Model page (kwini-kim)
  console.log('\n\n=== MODEL PAGE (kwini-kim) ===');
  const mRes = await fetch('https://w1mp.com/models/kwini-kim/', { headers: HEADERS });
  const mHtml = await mRes.text();
  const m$ = cheerio.load(mHtml);
  
  m$('img').each((i, el) => {
    const src = m$(el).attr('src') || '';
    if (src.includes('model') || src.includes('avatar') || src.includes('cdnstatic') || src.includes('contents')) {
      console.log('  IMG:', src, '| class:', m$(el).attr('class'));
    }
  });
  console.log('Model name:', m$('.viewlist-headline .title').first().text().trim());

  // 3. Model page (martin-spell)
  console.log('\n\n=== MODEL PAGE (martin-spell) ===');
  const msRes = await fetch('https://w1mp.com/models/martin-spell/', { headers: HEADERS });
  const msHtml = await msRes.text();
  const ms$ = cheerio.load(msHtml);
  ms$('img').each((i, el) => {
    const src = ms$(el).attr('src') || '';
    if (src.includes('model') || src.includes('avatar') || src.includes('cdnstatic') || src.includes('contents')) {
      console.log('  IMG:', src, '| class:', ms$(el).attr('class'));
    }
  });

  // 4. Tags page
  console.log('\n\n=== TAGS PAGE ===');
  try {
    const tRes = await fetch('https://w1mp.com/tags/', { headers: HEADERS });
    console.log('Tags page status:', tRes.status);
    if (tRes.ok) {
      const tHtml = await tRes.text();
      const t$ = cheerio.load(tHtml);
      let tagCount = 0;
      t$('a').each((i, el) => {
        const href = t$(el).attr('href') || '';
        if (href.includes('/tags/')) {
          tagCount++;
          if (tagCount <= 10) {
            console.log(tagCount, href, '|', t$(el).text().trim());
          }
        }
      });
      console.log('Total tag links found:', tagCount);
    }
  } catch(e) {
    console.log('Tags page error:', e.message);
  }

  // 5. Categories page
  console.log('\n\n=== CATEGORIES PAGE ===');
  const catRes = await fetch('https://w1mp.com/categories/', { headers: HEADERS });
  const catHtml = await catRes.text();
  const cat$ = cheerio.load(catHtml);
  let catCount = 0;
  cat$('a').each((i, el) => {
    const href = cat$(el).attr('href') || '';
    if (href.includes('/categories/')) {
      catCount++;
      if (catCount <= 15) {
        console.log(catCount, href, '|', cat$(el).text().trim());
      }
    }
  });
  console.log('Total category links found:', catCount);

  // 6. Check video cards on model page for dates
  console.log('\n\n=== VIDEO CARDS on MODEL PAGE (date info) ===');
  m$('.card.item').slice(0, 3).each((i, el) => {
    const $el = m$(el);
    console.log('Card', i);
    // All text content
    const allText = $el.text().replace(/\s+/g, ' ').trim();
    console.log('  Text:', allText.substring(0, 200));
    // Date-like elements
    $el.find('[class*="date"], [class*="time"], [class*="dur"], .info-item').each((j, sub) => {
      console.log('  Sub:', m$(sub).attr('class'), '|', m$(sub).text().trim());
    });
  });

  // 7. Check the embed page for stream extraction
  console.log('\n\n=== EMBED PAGE ===');
  const eRes = await fetch('https://w1mp.com/embed/492438/', { headers: HEADERS });
  const eHtml = await eRes.text();
  const e$ = cheerio.load(eHtml);
  console.log('Video sources:');
  e$('video source').each((i, el) => {
    console.log(i, e$(el).attr('src'));
  });
  e$('video').each((i, el) => {
    console.log('Video poster:', e$(el).attr('poster'));
  });
}

main().catch(e => console.error(e));
