const cheerio = require('cheerio');
const fetch = require('node-fetch');

const BASE_URL = 'https://xxdbx.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

function encodeNameForId(name) {
  return encodeURIComponent(name);
}

function decodeNameFromId(encoded) {
  return decodeURIComponent(encoded);
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return await res.text();
}

async function test() {
  // Test encode/decode roundtrip
  const name = 'Della Cate';
  const encoded = encodeNameForId(name);
  const decoded = decodeNameFromId(encoded);
  console.log('Name:', name, '-> Encoded:', encoded, '-> Decoded:', decoded);

  const chName = 'TouchMyWife.com';
  const chEnc = encodeNameForId(chName);
  const chDec = decodeNameFromId(chEnc);
  console.log('Channel:', chName, '-> Encoded:', chEnc, '-> Decoded:', chDec);

  const tagName = 'All Sex';
  const tagEnc = encodeNameForId(tagName);
  const tagDec = decodeNameFromId(tagEnc);
  console.log('Tag:', tagName, '-> Encoded:', tagEnc, '-> Decoded:', tagDec);

  // Test date
  const dateName = '2026-05-22';
  const dateEnc = encodeNameForId(dateName);
  const dateDec = decodeNameFromId(dateEnc);
  console.log('Date:', dateName, '-> Encoded:', dateEnc, '-> Decoded:', dateDec);

  // Test scraping star page
  console.log('\n--- Star Page ---');
  const html = await fetchPage('https://xxdbx.com/stars/Della%20Cate');
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().trim();
  console.log('Star page H1:', h1);

  let count = 0;
  $('.v').each(() => count++);
  console.log('Videos found on star page:', count);

  // Test channel page
  console.log('\n--- Channel Page ---');
  const chHtml = await fetchPage('https://xxdbx.com/channels/TouchMyWife.com');
  const $$ = cheerio.load(chHtml);
  const chH1 = $$('h1').first().text().trim();
  console.log('Channel page H1:', chH1);

  // Test video page stream extraction
  console.log('\n--- Video Page ---');
  const vidHtml = await fetchPage('https://xxdbx.com/view/137991651560');
  const $$$ = cheerio.load(vidHtml);
  console.log('Video sources:');
  $$$('video source').each((_, el) => {
    console.log('  Quality:', $$$(el).attr('title'), '->', $$$(el).attr('src'));
  });

  console.log('\nTags from video page:');
  $$$('.tags a').each((_, el) => {
    const href = $$$(el).attr('href');
    const text = $$$(el).text().trim();
    console.log('  ', href, '->', text);
  });

  // Test the deep link format
  console.log('\n--- Deep Links ---');
  const starId = 'star_' + encodeNameForId('Della Cate');
  const chId = 'ch_' + encodeNameForId('TouchMyWife.com');
  const tagId = 'tag_' + encodeNameForId('All Sex');
  const dateId = 'date_' + encodeNameForId('2026-05-22');
  console.log('Star:', 'stremio:///detail/channel/' + starId);
  console.log('Channel:', 'stremio:///detail/channel/' + chId);
  console.log('Tag:', 'stremio:///detail/channel/' + tagId);
  console.log('Date:', 'stremio:///detail/channel/' + dateId);

  // Test meta handler for star
  console.log('\n--- Meta Handler Test (Star) ---');
  const starName = decodeNameFromId(starId.replace('star_', ''));
  console.log('Decoded star name:', starName);
  const starUrl = 'https://xxdbx.com/stars/' + encodeURIComponent(starName);
  console.log('Star URL:', starUrl);
  const starHtml = await fetchPage(starUrl);
  const $4 = cheerio.load(starHtml);
  const starH1 = $4('h1').first().text().trim();
  console.log('Star H1:', starH1);

  // Test tag page (search)
  console.log('\n--- Tag Page Test ---');
  const tagDecoded = decodeNameFromId(tagId.replace('tag_', ''));
  console.log('Decoded tag:', tagDecoded);
  const tagUrl = 'https://xxdbx.com/search/' + encodeURIComponent(tagDecoded);
  console.log('Tag URL:', tagUrl);
  const tagHtml = await fetchPage(tagUrl);
  const $5 = cheerio.load(tagHtml);
  const tagH1 = $5('h1').first().text().trim();
  console.log('Tag H1:', tagH1);

  // Test date page
  console.log('\n--- Date Page Test ---');
  const dateDecoded = decodeNameFromId(dateId.replace('date_', ''));
  console.log('Decoded date:', dateDecoded);
  const dateUrl = 'https://xxdbx.com/dates/' + encodeURIComponent(dateDecoded);
  console.log('Date URL:', dateUrl);
  const dateHtml = await fetchPage(dateUrl);
  const $6 = cheerio.load(dateHtml);
  const dateH1 = $6('h1').first().text().trim();
  console.log('Date H1:', dateH1);
}

test().catch(console.error);
