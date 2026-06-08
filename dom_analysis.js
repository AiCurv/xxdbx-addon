const fetch = require('/tmp/my-project/w1mp-stremio-addon/node_modules/node-fetch');
const cheerio = require('/tmp/my-project/w1mp-stremio-addon/node_modules/cheerio');

async function main() {
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
    };

    // Fetch the video page
    console.log('=== ANALYZING VIDEO PAGE DOM STRUCTURE ===\n');
    const vRes = await fetch('https://w1mp.com/video/492438/test/', { headers: HEADERS });
    const vHtml = await vRes.text();
    const v$ = cheerio.load(vHtml);

    // 1. Look at ALL model links and their parent containers
    console.log('=== ALL MODEL LINKS WITH FULL PARENT CHAIN ===');
    v$('a').each((i, el) => {
        const href = v$(el).attr('href') || '';
        if (href.includes('/models/') && !href.endsWith('/models/') && !href.endsWith('/models')) {
            const text = v$(el).text().trim();
            if (text && text.length < 80) {
                // Build parent chain
                const parents = [];
                let parent = v$(el).parent();
                for (let d = 0; d < 6 && parent.length; d++) {
                    const cls = parent.attr('class') || '';
                    const tag = parent.get(0)?.tagName || '';
                    parents.push(`${tag}.${cls.split(' ').join('.')}`);
                    parent = parent.parent();
                }
                console.log(`  [${i}] "${text}" | href: ${href}`);
                console.log(`       parents: ${parents.join(' > ')}`);
            }
        }
    });

    // 2. Look at ALL tag links and their parent containers
    console.log('\n\n=== ALL TAG LINKS WITH FULL PARENT CHAIN ===');
    v$('a').each((i, el) => {
        const href = v$(el).attr('href') || '';
        if (href.match(/\/tags\/[^/]+\/?$/) && !href.endsWith('/tags/') && !href.endsWith('/tags')) {
            const text = v$(el).text().trim();
            if (text && text.length < 80) {
                const parents = [];
                let parent = v$(el).parent();
                for (let d = 0; d < 6 && parent.length; d++) {
                    const cls = parent.attr('class') || '';
                    const tag = parent.get(0)?.tagName || '';
                    parents.push(`${tag}.${cls.split(' ').join('.')}`);
                    parent = parent.parent();
                }
                console.log(`  [${i}] "${text}" | href: ${href}`);
                console.log(`       parents: ${parents.join(' > ')}`);
            }
        }
    });

    // 3. Find the main video info section specifically
    console.log('\n\n=== MAIN VIDEO INFO SECTION ===');
    // Look for sections that contain the video player
    v$('.fluid-player, .video-player, [class*="player"], video').each((i, el) => {
        console.log(`  Player element ${i}:`, v$(el).attr('class'), v$(el).get(0)?.tagName);
    });

    // 4. Look at the "top-player-items-wrap" section (where actual models are)
    console.log('\n\n=== TOP PLAYER ITEMS (actual video models) ===');
    v$('.top-player-items-wrap').each((i, el) => {
        console.log(`  Section ${i}:`);
        v$(el).find('a').each((j, a) => {
            const href = v$(a).attr('href') || '';
            if (href.includes('/models/')) {
                console.log(`    Model link: "${v$(a).text().trim()}" → ${href}`);
            }
        });
    });

    // 5. Look at the tags section (near the player)
    console.log('\n\n=== LOOKING FOR TAG CONTAINERS ===');
    // Tags might be in a specific section near the player
    v$('.tags, .tag-list, .video-tags, [class*="tag"], [class*="keyword"]').each((i, el) => {
        console.log(`  Tag container ${i}: class="${v$(el).attr('class')}"`);
        const links = v$(el).find('a');
        console.log(`    Links count: ${links.length}`);
        links.slice(0, 5).each((j, a) => {
            console.log(`    ${j}: "${v$(a).text().trim()}" → ${v$(a).attr('href')}`);
        });
    });

    // 6. Look at sections by class to find the video info area
    console.log('\n\n=== SECTION BREAKDOWN ===');
    v$('section, .section-row, [class*="section"]').each((i, el) => {
        const cls = v$(el).attr('class') || '';
        const id = v$(el).attr('id') || '';
        const text = v$(el).text().replace(/\s+/g, ' ').trim().substring(0, 100);
        console.log(`  Section ${i}: class="${cls}" id="${id}"`);
        console.log(`    Text: ${text}...`);
    });

    // 7. Try a different video for comparison
    console.log('\n\n=== SECOND VIDEO PAGE ===');
    const latestRes = await fetch('https://w1mp.com/latest-updates/', { headers: HEADERS });
    const latestHtml = await latestRes.text();
    const latest$ = cheerio.load(latestHtml);
    const firstVideoLink = latest$('.card.item a[href*="/video/"]').first().attr('href');
    console.log('First video link:', firstVideoLink);

    if (firstVideoLink) {
        const url = firstVideoLink.startsWith('http') ? firstVideoLink : 'https://w1mp.com' + firstVideoLink;
        const v2Res = await fetch(url, { headers: HEADERS });
        const v2Html = await v2Res.text();
        const v2$ = cheerio.load(v2Html);

        // Check top-player-items-wrap for this video
        console.log('\n=== SECOND VIDEO - TOP PLAYER ITEMS ===');
        v2$('.top-player-items-wrap').each((i, el) => {
            console.log(`  Section ${i}:`);
            v2$(el).find('a').each((j, a) => {
                const href = v2$(a).attr('href') || '';
                if (href.includes('/models/')) {
                    console.log(`    Model: "${v2$(a).text().trim()}" → ${href}`);
                }
            });
        });

        // Check the js-models-list for this video
        console.log('\n=== SECOND VIDEO - js-models-list ===');
        v2$('.js-models-list').each((i, el) => {
            console.log(`  Section ${i}:`);
            v2$(el).find('a').each((j, a) => {
                const href = v2$(a).attr('href') || '';
                if (href.includes('/models/')) {
                    console.log(`    Model: "${v2$(a).text().trim()}" → ${href}`);
                }
            });
        });

        // Count ALL model links on the page
        let totalModels = 0;
        const modelSlugs = new Set();
        v2$('a').each((i, el) => {
            const href = v2$(el).attr('href') || '';
            const slugMatch = href.match(/\/models\/([^/]+)\/?$/);
            if (slugMatch) {
                totalModels++;
                modelSlugs.add(slugMatch[1]);
            }
        });
        console.log(`\nTotal model links on page: ${totalModels}`);
        console.log(`Unique model slugs: ${modelSlugs.size}`);

        // Count total tag links
        let totalTags = 0;
        const tagSlugs = new Set();
        v2$('a').each((i, el) => {
            const href = v2$(el).attr('href') || '';
            const tagMatch = href.match(/\/tags\/([^/]+)\/?$/);
            if (tagMatch) {
                totalTags++;
                tagSlugs.add(tagMatch[1]);
            }
        });
        console.log(`Total tag links on page: ${totalTags}`);
        console.log(`Unique tag slugs: ${tagSlugs.size}`);
        
        // Find where the video's actual tags are
        console.log('\n=== SECOND VIDEO - TAG CONTAINERS ===');
        v2$('.tags, .tag-list, .video-tags, [class*="tag"], [class*="keyword"]').each((i, el) => {
            console.log(`  Container ${i}: class="${v2$(el).attr('class')}"`);
        });

        // Look for the specific container with categories near the player
        console.log('\n=== SECOND VIDEO - CATEGORIES NEAR PLAYER ===');
        v2$('.fluid-video-wrapper, .video-content, .main-content, [class*="video-info"]').each((i, el) => {
            const cls = v2$(el).attr('class') || '';
            console.log(`  Container: class="${cls}"`);
            const cats = v2$(el).find('a[href*="/categories/"]');
            const tags = v2$(el).find('a[href*="/tags/"]');
            const models = v2$(el).find('a[href*="/models/"]');
            console.log(`    Categories: ${cats.length}, Tags: ${tags.length}, Models: ${models.length}`);
        });
    }
}

main().catch(e => console.error(e));
