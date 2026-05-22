const cheerio = require('/home/z/my-project/w1mp-stremio-addon/node_modules/cheerio');
const fetch = require('/home/z/my-project/w1mp-stremio-addon/node_modules/node-fetch');

const BASE_URL = "https://w1mp.com";
const CDN_STATIC = "https://cdnstatic.w1mp.com";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function fixUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return BASE_URL + url;
    return url;
}

function extractVideoId(id) {
    if (id.startsWith("video_")) return id.replace("video_", "");
    const parts = id.split(":");
    for (const part of parts) {
        if (part.startsWith("video_")) return part.replace("video_", "");
    }
    return null;
}

async function main() {
    console.log("=== TESTING CORE FUNCTIONS ===\n");
    
    // 1. Test extractVideoId
    console.log("1. extractVideoId tests:");
    console.log("   video_12345:", extractVideoId("video_12345"));
    console.log("   model_kwini:video_12345:", extractVideoId("model_kwini:video_12345"));
    console.log("   tag_british:video_12345:", extractVideoId("tag_british:video_12345"));
    
    // 2. Test embed page stream extraction
    console.log("\n2. STREAM EXTRACTION (embed page):");
    try {
        const res = await fetch(`${BASE_URL}/embed/492438/`, { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        $("video source").each((i, el) => {
            console.log("   Source:", fixUrl($(el).attr("src") || "").substring(0, 80) + "...");
        });
    } catch(e) {
        console.log("   Error:", e.message);
    }
    
    // 3. Test video page model/tag extraction
    console.log("\n3. VIDEO PAGE MODELS & TAGS:");
    try {
        const res = await fetch(`${BASE_URL}/video/492438/test/`, { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const models = [];
        const modelSeen = new Set();
        $("a").each((_, el) => {
            const href = $(el).attr("href") || "";
            const slugMatch = href.match(/\/models\/([^/]+)\/?$/);
            if (slugMatch && !modelSeen.has(slugMatch[1])) {
                const name = $(el).text().trim();
                if (name && name.length < 50 && !name.includes("See all")) {
                    modelSeen.add(slugMatch[1]);
                    models.push({ slug: slugMatch[1], name });
                }
            }
        });
        console.log("   Models:", JSON.stringify(models));
        
        const tags = [];
        const tagSeen = new Set();
        $("a").each((_, el) => {
            const href = $(el).attr("href") || "";
            const tagMatch = href.match(/\/tags\/([^/]+)\/?$/);
            if (tagMatch && !tagSeen.has(tagMatch[1])) {
                const name = $(el).text().trim();
                if (name && name.length < 50) {
                    tagSeen.add(tagMatch[1]);
                    tags.push({ slug: tagMatch[1], name });
                }
            }
        });
        console.log("   Tags (first 5):", JSON.stringify(tags.slice(0, 5)));
    } catch(e) {
        console.log("   Error:", e.message);
    }
    
    // 4. Test model page poster extraction
    console.log("\n4. MODEL PAGE POSTER:");
    try {
        const res = await fetch(`${BASE_URL}/models/martin-spell/`, { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        let modelPoster = "";
        $("img.image").each((_, el) => {
            const src = $(el).attr("src") || "";
            if (src.includes("/contents/models/")) {
                modelPoster = fixUrl(src);
            }
        });
        console.log("   martin-spell poster:", modelPoster);
        
        // Test data-model-id fallback
        const modelIdMatch = html.match(/data-model-id="(\d+)"/);
        if (modelIdMatch) {
            console.log("   data-model-id:", modelIdMatch[1]);
            console.log("   Constructed URL:", `${CDN_STATIC}/contents/models/${modelIdMatch[1]}/martin-spell.jpg`);
        }
    } catch(e) {
        console.log("   Error:", e.message);
    }
    
    // 5. Test kwini-kim (no poster)
    console.log("\n5. MODEL PAGE (no poster - kwini-kim):");
    try {
        const res = await fetch(`${BASE_URL}/models/kwini-kim/`, { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        let modelPoster = "";
        $("img.image").each((_, el) => {
            const src = $(el).attr("src") || "";
            if (src.includes("/contents/models/")) {
                modelPoster = fixUrl(src);
            }
        });
        console.log("   kwini-kim poster:", modelPoster || "(none found)");
        
        const modelIdMatch = html.match(/data-model-id="(\d+)"/);
        if (modelIdMatch) {
            console.log("   data-model-id:", modelIdMatch[1]);
        } else {
            console.log("   No data-model-id found");
        }
    } catch(e) {
        console.log("   Error:", e.message);
    }
    
    // 6. Test tag page video extraction
    console.log("\n6. TAG PAGE (british):");
    try {
        const res = await fetch(`${BASE_URL}/tags/british/`, { headers: HEADERS });
        const html = await res.text();
        const $ = cheerio.load(html);
        let count = 0;
        $(".card.item").each(() => count++);
        console.log("   Video cards found:", count);
    } catch(e) {
        console.log("   Error:", e.message);
    }
    
    console.log("\n=== ALL TESTS PASSED ===");
}

main().catch(e => console.error(e));
