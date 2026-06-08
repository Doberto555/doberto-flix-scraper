/**
 * scraper.js — Axios + Cheerio (san Puppeteer)
 * Lejè, rapid, build an 30 sèk sou Railway/Render
 *
 * Estratèji: rele providers API dirèkteman (pa gen JS execution)
 * pou jwenn lyen embed, epi parse HTML pou jwenn src vídeo.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Referer': 'https://www.google.com/',
};

function extractQuality(url) {
  if (/1080/i.test(url)) return '1080p';
  if (/720/i.test(url))  return '720p';
  if (/480/i.test(url))  return '480p';
  if (/m3u8/i.test(url)) return 'HLS';
  return 'HD';
}

function isVideoUrl(url) {
  return /\.(m3u8|mp4)(\?|$)/i.test(url) || /\/hls\//i.test(url);
}

// Ekstrè lyen vídeo nan yon paj HTML
function extractLinks(html) {
  const links = [];
  const $ = cheerio.load(html);

  // 1. <video src="..."> ak <source src="...">
  $('video, source').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (isVideoUrl(src) && !links.find(l => l.url === src)) {
      links.push({ url: src, quality: extractQuality(src) });
    }
  });

  // 2. Chèche nan tout scripts pou lyen m3u8/mp4
  $('script').each((_, el) => {
    const txt = $(el).html() || '';
    const matches = txt.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/gi) || [];
    matches.forEach(url => {
      if (!links.find(l => l.url === url)) {
        links.push({ url, quality: extractQuality(url) });
      }
    });
  });

  // 3. Chèche nan tout HTML la (data attributes, JSON, etc.)
  const allMatches = html.match(/https?:\/\/[^"'\s\\]+\.(m3u8|mp4)[^"'\s\\]*/gi) || [];
  allMatches.forEach(url => {
    // Netwaye URL (retire karakters ki pa valid)
    const clean = url.replace(/[\\>)}\]]+$/, '');
    if (!links.find(l => l.url === clean)) {
      links.push({ url: clean, quality: extractQuality(clean) });
    }
  });

  return links;
}

// Rele yon provider ak axios
async function fetchProvider(url) {
  try {
    const resp = await axios.get(url, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5,
    });
    return extractLinks(resp.data);
  } catch (err) {
    console.warn(`  [WARN] ${url.substring(0, 60)}: ${err.message}`);
    return [];
  }
}

// Providers ki bay HTML dirèk (san JavaScript requis)
function buildProviders({ tmdb, type, season, episode }) {
  const tv = type === 'tv';
  return [
    // vidsrc.me — HTML static
    tv  ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
        : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`,

    // multiembed.mov
    tv  ? `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1`,

    // 2embed.cc
    tv  ? `https://2embed.cc/embedtv/${tmdb}&s=${season}&e=${episode}`
        : `https://2embed.cc/embed/${tmdb}`,

    // vidsrc.xyz
    tv  ? `https://vidsrc.xyz/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
        : `https://vidsrc.xyz/embed/movie?tmdb=${tmdb}`,
  ];
}

// Fonksyon prensipal
async function scrape({ tmdb, type, season, episode }) {
  const providers = buildProviders({ tmdb, type, season, episode });

  for (const url of providers) {
    console.log(`[TRY] ${url.substring(0, 70)}`);
    const links = await fetchProvider(url);

    if (links.length > 0) {
      const order = { '1080p': 0, '720p': 1, 'HLS': 2, '480p': 3, 'HD': 4 };
      links.sort((a, b) => (order[a.quality] ?? 9) - (order[b.quality] ?? 9));
      console.log(`[OK] ${links.length} lyen jwenn`);
      return links;
    }
  }

  console.log('[FAIL] Okenn lyen jwenn');
  return [];
}

module.exports = scrape;
