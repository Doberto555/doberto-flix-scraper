# 🎬 DOBERTO-FLIX Scraper API

Sèvè Node.js ki scrape lyen MP4/M3U8 reyèl pou DOBERTO-FLIX.  
Itilize Puppeteer + Chromium pou ekzekite JavaScript sou providers embed yo.

---

## 🚀 Deploy sou Render.com (gratis)

### Etap 1 — Push sou GitHub
```bash
git init
git add .
git commit -m "DOBERTO-FLIX scraper API"
git remote add origin https://github.com/TON-USERNAME/doberto-flix-scraper.git
git push -u origin main
```

### Etap 2 — Kreye sèvis sou Render
1. Ale sou [render.com](https://render.com) → **New → Web Service**
2. Konekte repo GitHub ou a
3. Render detekte `render.yaml` otomatikman
4. Klike **Deploy**

### Etap 3 — Kopye URL sèvè a
Apre deploy, ou jwenn yon URL tankou:
```
https://doberto-flix-scraper.onrender.com
```

### Etap 4 — Mete URL a nan index.html
Nan `index.html`, chanje liy sa a:
```js
const SCRAPER_API = 'https://doberto-flix-scraper.onrender.com';
```

---

## 📡 Endpoints

### `GET /health`
Verifye si sèvè a vivan.
```json
{ "status": "ok", "uptime": 123.4, "cache": {...} }
```

### `GET /scrape?tmdb=550&type=movie`
Jwenn lyen pou yon fim.

### `GET /scrape?tmdb=1399&type=tv&season=1&episode=1`
Jwenn lyen pou yon episòd série.

**Repons:**
```json
{
  "links": [
    { "url": "https://....m3u8", "quality": "1080p" },
    { "url": "https://....mp4",  "quality": "720p"  }
  ],
  "source": "live"
}
```

---

## ⚡ Flou konplè

```
DOBERTO-FLIX (Vercel)
        ↓  GET /scrape?tmdb=550&type=movie
Scraper API (Render)
        ↓  Puppeteer louvri vidsrc.me
        ↓  Entèsepte network requests
        ↓  Kaptire .m3u8 / .mp4
        ↓  { links: [...] }
DOBERTO-FLIX jwe lyen dirèk la
        (pa gen iframe, pa gen pub, vitès maximòm)
```

---

## ⚠️ Nòt enpòtan

- **Free tier Render** dòmi apre 15 minit inaktivite — premye request ka pran 30-60s
- **Cache 2 èdtan** — menm film pa re-scrape pou 2h
- Scraping pran 10-30 sèk pa film selon vitès providers yo
- Si ou vle evite dòmi, itilize [UptimeRobot](https://uptimerobot.com) pou ping `/health` chak 10 minit (gratis)
