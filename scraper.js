/**
 * scraper.js — Optimize RAM pou Railway/Render free tier
 * Itilize chrome-aws-lambda (pi lejè ke @sparticuz/chromium)
 * + flags agresif pou redui konsomasyon memwa
 */

const puppeteer = require('puppeteer-core');
const chromium  = require('chrome-aws-lambda');

// ── Providers ────────────────────────────────────────────────
function buildProviderUrls({ tmdb, type, season, episode }) {
  const tv = type === 'tv';
  return [
    tv  ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
        : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`,

    tv  ? `https://vidsrc.to/embed/tv/${tmdb}/${season}/${episode}`
        : `https://vidsrc.to/embed/movie/${tmdb}`,

    tv  ? `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1`,
  ];
}

// ── Rekonèt lyen vídeo ───────────────────────────────────────
function isVideoUrl(url) {
  return /\.(m3u8|mp4)(\?|$)/i.test(url) || /\/hls\//i.test(url);
}

function extractQuality(url) {
  if (/1080/i.test(url)) return '1080p';
  if (/720/i.test(url))  return '720p';
  if (/480/i.test(url))  return '480p';
  if (/m3u8/i.test(url)) return 'HLS';
  return 'HD';
}

// ── Lance browser ak RAM minimòm ─────────────────────────────
async function launchBrowser() {
  return puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',       // Kritik pou RAM ba
      '--disable-gpu',
      '--no-zygote',                   // Ekonomize RAM
      '--single-process',              // Yon sèl proses
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--js-flags=--max-old-space-size=128', // Limite JS heap a 128MB
    ],
    defaultViewport: { width: 800, height: 600 }, // Ti ekran = mwens RAM
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
}

// ── Scrape yon sèl provider ──────────────────────────────────
async function scrapeProvider(browser, url, timeoutMs = 20000) {
  const page  = await browser.newPage();
  const links = [];

  try {
    // Bloke tout sa ki pa nesesè
    await page.setRequestInterception(true);
    page.on('request', req => {
      const rt  = req.resourceType();
      const url = req.url();
      // Kite sèlman script ak XHR/fetch (kote lyen yo kache)
      if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(rt)) {
        req.abort();
      } else if (isVideoUrl(url)) {
        if (!links.find(l => l.url === url)) {
          links.push({ url, quality: extractQuality(url) });
          console.log(`  [NET REQ] ${url.substring(0, 70)}`);
        }
        req.continue();
      } else {
        req.continue();
      }
    });

    // Koute responses
    page.on('response', async resp => {
      const u = resp.url();
      if (isVideoUrl(u) && !links.find(l => l.url === u)) {
        links.push({ url: u, quality: extractQuality(u) });
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/119.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });

    // Klike play si genyen
    try {
      await page.click('video, .play-btn, [class*="play"]', { timeout: 2000 });
      await new Promise(r => setTimeout(r, 3000));
    } catch (_) {
      await new Promise(r => setTimeout(r, 3000));
    }

    // Chèche nan DOM
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
    console.warn(`  [WARN] ${url.substring(0, 50)}: ${err.message}`);
  } finally {
    await page.close();
  }

  return links;
}

// ── Fonksyon prensipal ───────────────────────────────────────
async function scrape({ tmdb, type, season, episode }) {
  const providers = buildProviderUrls({ tmdb, type, season, episode });
  let browser;

  try {
    browser = await launchBrowser();
    console.log(`[BROWSER] Louvri — ${providers.length} providers`);

    for (const provUrl of providers) {
      console.log(`[TRY] ${provUrl.substring(0, 70)}`);
      const links = await scrapeProvider(browser, provUrl);

      if (links.length > 0) {
        const order = { '1080p': 0, '720p': 1, 'HLS': 2, '480p': 3, 'HD': 4 };
        links.sort((a, b) => (order[a.quality] ?? 9) - (order[b.quality] ?? 9));
        console.log(`[OK] ${links.length} lyen jwenn`);
        return links;
      }

      await new Promise(r => setTimeout(r, 800));
    }

    console.log('[FAIL] Okenn lyen jwenn');
    return [];

  } finally {
    if (browser) {
      await browser.close();
      console.log('[BROWSER] Fèmen');
    }
  }
}

module.exports = scrape;
