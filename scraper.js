/**
 * scraper.js
 * Itilize Puppeteer pou louvri providers embed, entèsepte
 * network requests, epi kaptire lyen MP4 / M3U8 reyèl.
 */

const puppeteer  = require('puppeteer-core');
const chromium   = require('@sparticuz/chromium');

// ── Providers yo (chak youn gen pwòp URL embed li) ──────────
function buildProviderUrls({ tmdb, type, season, episode }) {
  const t = type === 'tv';
  return [
    // vidsrc.me
    t ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
      : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`,

    // vidsrc.to
    t ? `https://vidsrc.to/embed/tv/${tmdb}/${season}/${episode}`
      : `https://vidsrc.to/embed/movie/${tmdb}`,

    // vidsrc.xyz
    t ? `https://vidsrc.xyz/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
      : `https://vidsrc.xyz/embed/movie?tmdb=${tmdb}`,

    // multiembed.mov
    t ? `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}`
      : `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1`,

    // 2embed.cc
    t ? `https://2embed.cc/embedtv/${tmdb}&s=${season}&e=${episode}`
      : `https://2embed.cc/embed/${tmdb}`,
  ];
}

// ── Regex pou rekonèt lyen vídeo ─────────────────────────────
const VIDEO_PATTERNS = [
  /\.m3u8(\?[^"'\s]*)?/i,
  /\.mp4(\?[^"'\s]*)?/i,
  /\/hls\//i,
  /\/stream\//i,
  /\/playlist\.m3u8/i,
];

function isVideoUrl(url) {
  return VIDEO_PATTERNS.some(p => p.test(url));
}

function extractQuality(url) {
  if (/1080/.test(url)) return '1080p';
  if (/720/.test(url))  return '720p';
  if (/480/.test(url))  return '480p';
  if (/360/.test(url))  return '360p';
  if (/m3u8/i.test(url)) return 'HLS';
  return 'HD';
}

// ── Lance Puppeteer ──────────────────────────────────────────
async function launchBrowser() {
  return puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required',
    ],
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

// ── Scrape yon sèl provider ──────────────────────────────────
async function scrapeProvider(browser, url, timeoutMs = 25000) {
  const page = await browser.newPage();
  const links = [];

  try {
    // Bloke resous inutile (imaj, fonts, CSS) pou ale pi vit
    await page.setRequestInterception(true);
    page.on('request', req => {
      const rt = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(rt)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Koute TOUT network requests
    page.on('request', req => {
      const u = req.url();
      if (isVideoUrl(u) && !links.find(l => l.url === u)) {
        links.push({ url: u, quality: extractQuality(u) });
        console.log(`  [NET] Jwenn: ${u.substring(0, 80)}...`);
      }
    });

    // Koute responses tou (pou m3u8 ki nan body)
    page.on('response', async resp => {
      const u = resp.url();
      if (isVideoUrl(u) && !links.find(l => l.url === u)) {
        links.push({ url: u, quality: extractQuality(u) });
      }
    });

    // User-agent reyèl pou evite deteksyon bot
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/119.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    // Chaje paj la
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: timeoutMs,
    });

    // Klike play button si genyen — kèk players bezwen sa
    try {
      await page.click('button[class*="play"], .play-btn, [id*="play"], video', { timeout: 3000 });
      await page.waitForTimeout(5000); // Tann requests apre klike
    } catch (_) {
      // Pa gen bouton — normale
      await page.waitForTimeout(4000);
    }

    // Chèche nan DOM tou (src dirèk sou <video> ak <source>)
    const domLinks = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('video, source').forEach(el => {
        const s = el.src || el.getAttribute('src') || '';
        if (s && (s.includes('.m3u8') || s.includes('.mp4'))) urls.push(s);
      });
      return urls;
    });

    domLinks.forEach(u => {
      if (!links.find(l => l.url === u)) {
        links.push({ url: u, quality: extractQuality(u) });
      }
    });

  } catch (err) {
    console.warn(`  [WARN] Provider ${url.substring(0, 50)} echwe: ${err.message}`);
  } finally {
    await page.close();
  }

  return links;
}

// ── Fonksyon prensipal ekspòte ────────────────────────────────
async function scrape({ tmdb, type, season, episode }) {
  const providers = buildProviderUrls({ tmdb, type, season, episode });
  let browser;

  try {
    browser = await launchBrowser();
    console.log(`[BROWSER] Louvri — ${providers.length} providers pou eseye`);

    for (const provUrl of providers) {
      console.log(`[TRY] ${provUrl.substring(0, 70)}...`);
      const links = await scrapeProvider(browser, provUrl);

      if (links.length > 0) {
        // Klase pa kalite: 1080p > 720p > 480p > rès
        const order = { '1080p': 0, '720p': 1, 'HLS': 2, '480p': 3, '360p': 4, 'HD': 5 };
        links.sort((a, b) => (order[a.quality] ?? 9) - (order[b.quality] ?? 9));
        console.log(`[SUCCESS] ${links.length} lyen jwenn nan ${provUrl.substring(0, 50)}`);
        return links; // ← Retounen premye provider ki mache
      }

      // Ti poz ant providers
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('[FAIL] Okenn provider pa jwenn lyen');
    return [];

  } finally {
    if (browser) {
      await browser.close();
      console.log('[BROWSER] Fèmen');
    }
  }
}

module.exports = scrape;
