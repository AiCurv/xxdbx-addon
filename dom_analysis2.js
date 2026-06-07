const fetch = require('/tmp/my-project/w1mp-stremio-addon/node_modules/node-fetch');
const cheerio = require('/tmp/my-project/w1mp-stremio-addon/node_modules/cheerio');

async function main() {
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
    };

    // Check the second video more carefully
    console.log('=== SECOND VIDEO - FULL ANALYSIS ===');
    const res = await fetch('https://w1mp.com/video/542109/hot-japanese-squirt-compilation-vol-32-more-at-javhd-net/', { headers: HEADERS });
    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. Models from .js-models-list
    console.log('\nModels from .js-models-list:');
    $('.js-models-list a').each((i, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('/models/')) {
            console.log(`  ${i}: "${$(el).text().trim()}" → ${href}`);
        }
    });

    // 2. Models from .top-player-items-wrap
    console.log('\nModels from .top-player-items-wrap:');
    $('.top-player-items-wrap a[href*="/models/"]').each((i, el) => {
        console.log(`  ${i}: "${$(el).text().trim()}" → ${$(el).attr('href')}`);
    });

    // 3. Tags from .top-player-items-wrap .twocolumns
    console.log('\nTags from .top-player-items-wrap .twocolumns:');
    $('.top-player-items-wrap .twocolumns a[href*="/tags/"]').each((i, el) => {
        console.log(`  ${i}: "${$(el).text().trim()}" → ${$(el).attr('href')}`);
    });

    // 4. Categories from .top-player-items-wrap
    console.log('\nCategories from .top-player-items-wrap:');
    $('.top-player-items-wrap a[href*="/categories/"]').each((i, el) => {
        console.log(`  ${i}: "${$(el).text().trim()}" → ${$(el).attr('href')}`);
    });

    // 5. ALL model links on page (to see what gets picked up by current code)
    console.log('\nALL model links (current code would pick up):');
    const modelSeen = new Set();
    $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const slugMatch = href.match(/\/models\/([^/]+)\/?$/);
        if (slugMatch && !modelSeen.has(slugMatch[1])) {
            const name = $(el).text().trim();
            if (name && name.length < 50 && !name.includes('See all')) {
                modelSeen.add(slugMatch[1]);
                // Check if it's from top-player-items-wrap or related
                const inPlayer = $(el).closest('.top-player-items-wrap').length > 0;
                const inRelated = $(el).closest('.section-row.related').length > 0;
                const inCard = $(el).closest('.card').length > 0;
                console.log(`  "${name}" (${slugMatch[1]}) - player:${inPlayer} related:${inRelated} card:${inCard}`);
            }
        }
    });

    // 6. ALL tag links on page
    console.log('\nALL tag links (current code would pick up):');
    const tagSeen = new Set();
    $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const tagMatch = href.match(/\/tags\/([^/]+)\/?$/);
        if (tagMatch && !tagSeen.has(tagMatch[1])) {
            const name = $(el).text().trim();
            if (name && name.length < 50) {
                tagSeen.add(tagMatch[1]);
                const inPlayer = $(el).closest('.top-player-items-wrap').length > 0;
                const inRelated = $(el).closest('.section-row.related').length > 0;
                console.log(`  "${name}" (${tagMatch[1]}) - player:${inPlayer} related:${inRelated}`);
            }
        }
    });

    // 7. Check if there's also a .top-player-item class on the model/tag links
    console.log('\nModel/Tag links with .top-player-item class:');
    $('a.top-player-item').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        console.log(`  ${i}: "${text.substring(0, 30)}" → ${href.substring(0, 50)}`);
    });
}

main().catch(e => console.error(e));
