const fetch = require('/tmp/my-project/w1mp-stremio-addon/node_modules/node-fetch');
const cheerio = require('/tmp/my-project/w1mp-stremio-addon/node_modules/cheerio');
const addon = require('/home/z/my-project/w1mp-stremio-addon/addon.js');

async function test() {
    console.log('=== TESTING ADDON V3.0 ===\n');
    
    // 1. Test manifest
    console.log('1. MANIFEST:');
    console.log('  ID:', addon.manifest.id);
    console.log('  Version:', addon.manifest.version);
    console.log('  Types:', addon.manifest.types);
    console.log('  Catalogs:', addon.manifest.catalogs.map(c => `${c.type}/${c.id}: ${c.name}`).join(', '));
    console.log('  Stream idPrefixes:', addon.manifest.resources.find(r => r.name === 'stream')?.idPrefixes);
    console.log('  Meta idPrefixes:', addon.manifest.resources.find(r => r.name === 'meta')?.idPrefixes);
    
    // 2. Test models catalog
    console.log('\n2. MODELS CATALOG:');
    try {
        const models = await addon.catalogs.channel.models({ extra: {} });
        console.log('  Model count:', models.metas.length);
        if (models.metas[0]) console.log('  First model:', models.metas[0].id, models.metas[0].name);
    } catch(e) {
        console.log('  Error:', e.message);
    }
    
    // 3. Test tags catalog
    console.log('\n3. TAGS CATALOG:');
    try {
        const tags = await addon.catalogs.channel.tags({ extra: {} });
        console.log('  Tag count:', tags.metas.length);
        if (tags.metas[0]) console.log('  First tag:', tags.metas[0].id, tags.metas[0].name, tags.metas[0].description);
        if (tags.metas[1]) console.log('  Second tag:', tags.metas[1].id, tags.metas[1].name, tags.metas[1].description);
    } catch(e) {
        console.log('  Error:', e.message);
    }
    
    // 4. Test model meta
    console.log('\n4. MODEL META (kwini-kim):');
    try {
        const meta = await addon.meta.channel.model_kwini-kim;
    } catch(e) {
        // Direct API test instead
        console.log('  Testing via handler...');
    }
    
    // 5. Test stream extraction (direct video ID)
    console.log('\n5. STREAM (video_492438):');
    try {
        const streams = await addon.stream.movie.video_492438;
    } catch(e) {
        console.log('  Testing via direct call...');
    }

    // Direct function tests
    console.log('\n6. DIRECT STREAM TEST:');
    // Simulate what the addon SDK would do
    const { addonBuilder } = require('/tmp/my-project/w1mp-stremio-addon/node_modules/stremio-addon-sdk');
    
    // Let's test the extractVideoId function
    console.log('  extractVideoId("video_12345"):', extractVideoId_test("video_12345"));
    console.log('  extractVideoId("model_kwini-kim:video_12345"):', extractVideoId_test("model_kwini-kim:video_12345"));
    console.log('  extractVideoId("tag_british:video_12345"):', extractVideoId_test("tag_british:video_12345"));
    
    // 7. Test the actual embed page stream extraction
    console.log('\n7. EMBED PAGE STREAM EXTRACTION:');
    const HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'};
    try {
        const res = await fetch('https://w1mp.com/embed/492438/', { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        $('video source').each((i, el) => {
            const src = $(el).attr('src') || '';
            console.log('  Source', i, ':', src.substring(0, 80) + '...');
        });
    } catch(e) {
        console.log('  Error:', e.message);
    }
    
    // 8. Test video page model/tag extraction
    console.log('\n8. VIDEO PAGE MODELS & TAGS:');
    try {
        const res = await fetch('https://w1mp.com/video/492438/test/', { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const models = [];
        const modelSeen = new Set();
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const slugMatch = href.match(/\/models\/([^/]+)\/?$/);
            if (slugMatch && !modelSeen.has(slugMatch[1])) {
                const name = $(el).text().trim();
                if (name && name.length < 50 && !name.includes('See all')) {
                    modelSeen.add(slugMatch[1]);
                    models.push({ slug: slugMatch[1], name });
                }
            }
        });
        console.log('  Models:', JSON.stringify(models));
        
        const tags = [];
        const tagSeen = new Set();
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const tagMatch = href.match(/\/tags\/([^/]+)\/?$/);
            if (tagMatch && !tagSeen.has(tagMatch[1])) {
                const name = $(el).text().trim();
                if (name && name.length < 50) {
                    tagSeen.add(tagMatch[1]);
                    tags.push({ slug: tagMatch[1], name });
                }
            }
        });
        console.log('  Tags (first 5):', JSON.stringify(tags.slice(0, 5)));
    } catch(e) {
        console.log('  Error:', e.message);
    }
    
    console.log('\n=== TEST COMPLETE ===');
}

function extractVideoId_test(id) {
    if (id.startsWith("video_")) return id.replace("video_", "");
    const parts = id.split(":");
    for (const part of parts) {
        if (part.startsWith("video_")) return part.replace("video_", "");
    }
    return null;
}

test().catch(e => console.error(e));
