const fetch = require('/tmp/my-project/w1mp-stremio-addon/node_modules/node-fetch');
const cheerio = require('/tmp/my-project/w1mp-stremio-addon/node_modules/cheerio');

async function test() {
    const HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'};
    
    const res = await fetch('https://w1mp.com/video/492438/test/', { headers: HEADERS });
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Check if .twocolumns exists
    console.log('.twocolumns count:', $('.twocolumns').length);
    console.log('.top-player-items-wrap count:', $('.top-player-items-wrap').length);
    
    // Check what's inside .twocolumns
    $('.twocolumns').each((i, el) => {
        console.log(`\n.twocolumns ${i}:`);
        console.log('  Children:', $(el).children().length);
        console.log('  HTML (first 500):', $(el).html().substring(0, 500));
    });
    
    // Try .top-player-items-wrap direct children
    console.log('\n\n.top-player-items-wrap links:');
    $('.top-player-items-wrap a').each((i, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('/tags/')) {
            console.log(`  ${i}: "${$(el).text().trim()}" → ${href}`);
        }
    });
    
    // Try alternative selectors
    console.log('\n\nAlternative: .top-player-items-wrap [class*="tag"] a:');
    $('.top-player-items-wrap [class*="tag"] a').each((i, el) => {
        console.log(`  ${i}: "${$(el).text().trim()}" → ${$(el).attr('href')}`);
    });
    
    // Check what class the tag links are in
    console.log('\n\nTag link parent classes:');
    $('a[href*="/tags/"]').slice(0, 10).each((i, el) => {
        const parents = [];
        let parent = $(el).parent();
        for (let d = 0; d < 4 && parent.length; d++) {
            const cls = parent.attr('class') || '';
            const tag = parent.get(0)?.tagName || '';
            parents.push(`${tag}.${cls.split(' ').join('.')}`);
            parent = parent.parent();
        }
        console.log(`  "${$(el).text().trim()}" → parents: ${parents.join(' > ')}`);
    });
}

test().catch(e => console.error(e));
