/**
 * DOBERTO-FLIX Scraper API
 * Deploy sou Render.com (Free tier mache)
 *
 * Endpoints:
 *   GET /scrape?tmdb=12345&type=movie
 *   GET /scrape?tmdb=12345&type=tv&season=1&episode=3
 *   GET /health
 */

const express  = require('express');
const cors     = require('cors');
const NodeCache = require('node-cache');
const scrape   = require('./scraper');

const app   = express();
const cache = new NodeCache({ stdTTL: 7200, checkperiod: 300 }); // cache 2 èdtan

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://doberto-flix.vercel.app',
    /\.vercel\.app$/,
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ],
  methods: ['GET'],
}));

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'DOBERTO-FLIX');
  next();
});

// ── Health check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), cache: cache.getStats() });
});

// ── /scrape ─────────────────────────────────────────────────
app.get('/scrape', async (req, res) => {
  const { tmdb, type, season, episode } = req.query;

  // Validasyon
  if (!tmdb || !type) {
    return res.status(400).json({ error: 'Paramèt manke: tmdb ak type obligatwa' });
  }
  if (!['movie', 'tv'].includes(type)) {
    return res.status(400).json({ error: 'type dwe "movie" oswa "tv"' });
  }
  if (type === 'tv' && (!season || !episode)) {
    return res.status(400).json({ error: 'season ak episode obligatwa pou type=tv' });
  }

  // Kle cache
  const cacheKey = type === 'tv'
    ? `tv-${tmdb}-s${season}e${episode}`
    : `movie-${tmdb}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] ${cacheKey}`);
    return res.json({ links: cached, source: 'cache' });
  }

  console.log(`[SCRAPING] ${cacheKey}`);

  try {
    const links = await scrape({ tmdb, type, season, episode });

    if (!links || links.length === 0) {
      return res.status(404).json({ error: 'Pa jwenn lyen pou tit sa a', links: [] });
    }

    cache.set(cacheKey, links);
    console.log(`[OK] ${cacheKey} → ${links.length} lyen jwenn`);
    res.json({ links, source: 'live' });

  } catch (err) {
    console.error(`[ERREUR] ${cacheKey}:`, err.message);
    res.status(500).json({ error: 'Scraping echwe', detail: err.message, links: [] });
  }
});

// ── Keep-Alive: sèvè a ping tèt li chak 10 minit ────────────
// Sa evite Render Free Tier dòmi apre 15 min inaktivite.
const http = require('http');

function selfPing() {
  const host = process.env.RENDER_EXTERNAL_URL;
  if (!host) return; // Pa sou Render — pa fè anyen

  // Render mete URL a san trailing slash
  const urlStr = host.startsWith('http') ? `${host}/health` : `https://${host}/health`;

  try {
    const mod = urlStr.startsWith('https') ? require('https') : http;
    mod.get(urlStr, (res) => {
      console.log(`[KEEP-ALIVE] Ping → ${res.statusCode}`);
    }).on('error', (err) => {
      console.warn(`[KEEP-ALIVE] Echwe: ${err.message}`);
    });
  } catch(e) {
    console.warn('[KEEP-ALIVE] Erè:', e.message);
  }
}

// Ping chak 10 minit — Render dòmi apre 15 min
const PING_INTERVAL_MS = 10 * 60 * 1000;

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎬 DOBERTO-FLIX Scraper API`);
  console.log(`   Pò: ${PORT}`);
  console.log(`   Cache TTL: 2h`);
  console.log(`   Prè pou scrape!\n`);

  // Kòmanse keep-alive apre 1 minit (bay sèvè tan pou boot nèt)
  setTimeout(() => {
    selfPing();
    setInterval(selfPing, PING_INTERVAL_MS);
    console.log('[KEEP-ALIVE] Aktive — ping chak 10 minit');
  }, 60 * 1000);
});
