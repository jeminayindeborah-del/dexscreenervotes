const express = require('express');
const path    = require('path');
const fs      = require('fs');
const fetch   = require('node-fetch');

let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// ════════════════════════════════════════════════════
//  TOKEN DATA CACHE
// ════════════════════════════════════════════════════
const tokenCache = new Map();
const TOKEN_TTL  = 5 * 60 * 1000;

async function fetchTokenData(ca) {
  const key = ca.toLowerCase();
  const now = Date.now();
  const hit = tokenCache.get(key);
  if (hit && now - hit.ts < TOKEN_TTL) return hit.data;

  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`,
    { timeout: 10000 }
  );
  if (!res.ok) throw new Error(`DexScreener API ${res.status}`);
  const data = await res.json();
  tokenCache.set(key, { data, ts: now });
  return data;
}

function bestPair(data) {
  if (!data?.pairs?.length) return null;
  return data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
}

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════
const CHAIN_REWARDS = {
  solana:'SOL',ethereum:'ETH',bsc:'BNB',polygon:'MATIC',
  arbitrum:'ETH',avalanche:'AVAX',base:'ETH',optimism:'ETH',
  fantom:'FTM',cronos:'CRO',sui:'SUI',ton:'TON',
  pulsechain:'PLS',mantle:'MNT',linea:'LINEA',blast:'BLAST',
  scroll:'SCROLL',zksync:'ZK',manta:'MANTA',sei:'SEI',
  celo:'CELO',moonbeam:'GLMR',aptos:'APT',near:'NEAR'
};

const CHAIN_SYMBOLS = {
  solana:'SOL',ethereum:'ETH',bsc:'BNB',polygon:'MATIC',
  arbitrum:'ARB',avalanche:'AVAX',base:'BASE',optimism:'OP',
  fantom:'FTM',cronos:'CRO',sui:'SUI',ton:'TON'
};

function fmtBig(n) {
  if (!n) return '$0';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function fmtPrice(p) {
  if (!p || isNaN(p)) return '$0.00';
  p = parseFloat(p);
  if (p >= 1000) return '$' + p.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  const s = p.toFixed(15).split('.')[1] || '';
  let z = 0;
  for (const c of s) { if (c === '0') z++; else break; }
  return '$' + p.toFixed(Math.min(z + 4, 10));
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;')
                  .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
                  .replace(/'/g,'&apos;');
}

// ════════════════════════════════════════════════════
//  HTML TEMPLATE
// ════════════════════════════════════════════════════
const HTML_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'public', 'index.html'), 'utf8'
);

const META_DEFAULTS = {
  '%%PAGE_TITLE%%' : 'DexScreener Votes • Elite Terminal',
  '%%OG_TITLE%%'   : 'Vote to Earn — DexScreener CORE',
  '%%OG_DESC%%'    : 'Vote to Earn SOL',
  '%%OG_IMAGE%%'   : '',
  '%%OG_URL%%'     : '',
  '%%FAVICON%%'    : ''
};

// ════════════════════════════════════════════════════
//  STATIC FILES
// ════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ════════════════════════════════════════════════════
//  API PROXY
// ════════════════════════════════════════════════════
app.get('/api/token/:address', async (req, res) => {
  try {
    const data = await fetchTokenData(req.params.address);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'fetch failed' });
  }
});

app.get('/api/trending', async (_req, res) => {
  try {
    const r = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    if (!r.ok) throw new Error(r.status);
    res.json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'fetch failed' });
  }
});

// ════════════════════════════════════════════════════
//  OG IMAGE CACHE
// ════════════════════════════════════════════════════
const CACHE_DIR = path.join(__dirname, '.cache', 'og');
const OG_TTL    = 5 * 60 * 1000;
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}

function safeName(ca) {
  return ca.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

// ════════════════════════════════════════════════════
//  GENERATE OG IMAGE WITH SHARP
// ════════════════════════════════════════════════════
async function generateOgImage(ca, pair) {
  if (!sharp) throw new Error('Sharp not available');

  const token    = pair.baseToken;
  const chainId  = pair.chainId || 'unknown';
  const chainUp  = chainId.toUpperCase();
  const chainSym = CHAIN_REWARDS[chainId] || chainUp;

  // Token info
  let name = token.name || token.symbol || 'Unknown';
  if (name.length > 20) name = name.slice(0, 18) + '…';
  
  let sym = (token.symbol || '???').toUpperCase();
  if (sym.length > 10) sym = sym.slice(0, 8) + '…';

  const price = fmtPrice(pair.priceUsd || '0');
  const mcap  = fmtBig(pair.fdv || pair.marketCap || 0);
  const liq   = fmtBig(pair.liquidity?.usd || 0);
  const vol   = fmtBig(pair.volume?.h24 || 0);

  // Generate random vote count (like your page does)
  const voteCount = Math.floor(800 + Math.random() * 2500);
  const voteTotal = Math.ceil(voteCount / (0.4 + Math.random() * 0.52));
  const votePct   = Math.round((voteCount / voteTotal) * 100);

  // Chain badge width
  const chainBadgeW = chainUp.length * 12 + 40;

  // Create SVG that looks like your site
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020203"/>
      <stop offset="50%" stop-color="#050506"/>
      <stop offset="100%" stop-color="#020203"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0b0e"/>
      <stop offset="100%" stop-color="#060708"/>
    </linearGradient>
    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#16a34a"/>
      <stop offset="50%" stop-color="#22c55e"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="progressBg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000"/>
      <stop offset="100%" stop-color="#111"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <radialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(34,197,94,0.15)"/>
      <stop offset="100%" stop-color="rgba(34,197,94,0)"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  
  <!-- Subtle grid pattern -->
  <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
    <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(34,197,94,0.03)" stroke-width="1"/>
  </pattern>
  <rect width="1200" height="630" fill="url(#grid)"/>
  
  <!-- Green orb glow effects -->
  <ellipse cx="200" cy="100" rx="300" ry="200" fill="url(#orbGlow)"/>
  <ellipse cx="1000" cy="500" rx="250" ry="180" fill="url(#orbGlow)"/>

  <!-- Main card -->
  <rect x="40" y="40" width="1120" height="550" rx="28" fill="url(#cardGrad)" 
        stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  
  <!-- Header bar -->
  <rect x="40" y="40" width="1120" height="70" rx="28" fill="rgba(0,0,0,0.3)"/>
  <rect x="40" y="82" width="1120" height="28" fill="url(#cardGrad)"/>
  <line x1="40" y1="110" x2="1160" y2="110" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  
  <!-- Header text -->
  <text x="75" y="85" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="bold" fill="white">DEXSCREENER</text>
  <text x="220" y="85" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="bold" fill="#22c55e">VOTES</text>
  
  <!-- Chain badge in header -->
  <rect x="${1160 - chainBadgeW - 20}" y="58" width="${chainBadgeW}" height="32" rx="16" fill="rgba(34,197,94,0.12)"/>
  <text x="${1160 - chainBadgeW/2 - 20}" y="80" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold" fill="#22c55e" text-anchor="middle">${escXml(chainUp)}</text>

  <!-- Left side: Token info -->
  
  <!-- Token icon placeholder (circle with letter) -->
  <circle cx="150" cy="250" r="70" fill="none" stroke="rgba(34,197,94,0.2)" stroke-width="2"/>
  <circle cx="150" cy="250" r="62" fill="rgba(34,197,94,0.08)"/>
  <text x="150" y="268" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="bold" fill="rgba(34,197,94,0.7)" text-anchor="middle">${escXml(sym.charAt(0))}</text>
  
  <!-- Token name and symbol -->
  <text x="250" y="220" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="bold" fill="white">${escXml(name)}</text>
  <text x="250" y="260" font-family="Arial,Helvetica,sans-serif" font-size="22" fill="rgba(255,255,255,0.5)">$${escXml(sym)}</text>
  
  <!-- Price -->
  <text x="250" y="320" font-family="Courier New,monospace" font-size="36" font-weight="bold" fill="#22c55e">${escXml(price)}</text>
  
  <!-- Stats row -->
  <rect x="75" y="360" width="180" height="70" rx="14" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="165" y="395" font-family="Courier New,monospace" font-size="20" font-weight="bold" fill="white" text-anchor="middle">${escXml(mcap)}</text>
  <text x="165" y="418" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="rgba(255,255,255,0.4)" text-anchor="middle">MARKET CAP</text>
  
  <rect x="270" y="360" width="180" height="70" rx="14" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="360" y="395" font-family="Courier New,monospace" font-size="20" font-weight="bold" fill="white" text-anchor="middle">${escXml(liq)}</text>
  <text x="360" y="418" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="rgba(255,255,255,0.4)" text-anchor="middle">LIQUIDITY</text>
  
  <rect x="465" y="360" width="180" height="70" rx="14" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="555" y="395" font-family="Courier New,monospace" font-size="20" font-weight="bold" fill="#22c55e" text-anchor="middle">${escXml(vol)}</text>
  <text x="555" y="418" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="rgba(255,255,255,0.4)" text-anchor="middle">24H VOLUME</text>

  <!-- Right side: Vote panel -->
  <rect x="700" y="135" width="420" height="320" rx="24" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  
  <!-- Vote header -->
  <text x="720" y="175" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.4)">MILESTONE PROGRESS</text>
  <text x="1100" y="175" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold" fill="#22c55e" text-anchor="end">${votePct}%</text>
  
  <!-- Vote count -->
  <text x="720" y="245" font-family="Arial,Helvetica,sans-serif" font-size="56" font-weight="bold" fill="white">${voteCount.toLocaleString()}</text>
  <text x="${720 + String(voteCount.toLocaleString()).length * 32}" y="245" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="rgba(255,255,255,0.15)">/${voteTotal.toLocaleString()}</text>
  
  <!-- Progress bar -->
  <rect x="720" y="275" width="380" height="16" rx="8" fill="url(#progressBg)"/>
  <rect x="720" y="275" width="${Math.min(380, 380 * votePct / 100)}" height="16" rx="8" fill="url(#greenGrad)" filter="url(#glow)"/>
  
  <!-- Vote button -->
  <rect x="720" y="320" width="380" height="60" rx="16" fill="url(#greenGrad)"/>
  <text x="910" y="358" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="bold" fill="black" text-anchor="middle">VOTE TO EARN ${escXml(chainSym)} REWARD</text>

  <!-- Bottom branding -->
  <rect x="75" y="480" width="570" height="90" rx="18" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="100" y="520" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="bold" fill="rgba(255,255,255,0.3)">LIVE VOTES</text>
  <circle cx="180" cy="514" r="4" fill="#22c55e"/>
  <text x="100" y="550" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="rgba(255,255,255,0.2)">Community members voting in real-time</text>
  
  <!-- Chart placeholder -->
  <rect x="700" y="480" width="420" height="90" rx="18" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="720" y="520" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="bold" fill="rgba(255,255,255,0.3)">LIVE CHART</text>
  <text x="720" y="550" font-family="Courier New,monospace" font-size="12" fill="rgba(255,255,255,0.2)">${escXml(sym)}/USD</text>
  
  <!-- Mini chart lines (decorative) -->
  <polyline points="850,540 880,520 910,530 940,510 970,525 1000,505 1030,515 1060,495 1090,510" 
            fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
</svg>`;

  // Convert SVG to PNG
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  // Try to fetch and overlay the actual token icon
  try {
    let iconUrl = '';
    if (pair.info && pair.info.imageUrl) {
      iconUrl = pair.info.imageUrl;
    } else {
      iconUrl = `https://dd.dexscreener.com/ds-data/tokens/${chainId}/${ca}.png`;
    }

    const iconRes = await fetch(iconUrl, { timeout: 5000 });
    if (iconRes.ok) {
      const iconBuffer = Buffer.from(await iconRes.arrayBuffer());
      
      // Resize icon to fit the circle
      const resizedIcon = await sharp(iconBuffer)
        .resize(120, 120)
        .png()
        .toBuffer();

      // Create circular mask
      const mask = Buffer.from(`
        <svg width="120" height="120">
          <circle cx="60" cy="60" r="58" fill="white"/>
        </svg>
      `);

      const circularIcon = await sharp(resizedIcon)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      // Composite icon onto the main image
      const finalImage = await sharp(pngBuffer)
        .composite([{
          input: circularIcon,
          left: 90,  // center at x=150, icon is 120px wide
          top: 190   // center at y=250, icon is 120px tall
        }])
        .png()
        .toBuffer();

      return finalImage;
    }
  } catch (e) {
    // Icon fetch failed, use the image without icon
    console.log('[OG] Icon fetch failed, using fallback');
  }

  return pngBuffer;
}

// ════════════════════════════════════════════════════
//  OG IMAGE ENDPOINT
// ════════════════════════════════════════════════════
app.get('/og/:ca.png', async (req, res) => {
  const ca = req.params.ca;
  const cacheFile = path.join(CACHE_DIR, safeName(ca) + '.png');

  // Check cache
  try {
    const stat = fs.statSync(cacheFile);
    if (Date.now() - stat.mtimeMs < OG_TTL) {
      console.log(`[OG] Cache hit: ${ca.slice(0,8)}...`);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
      return res.sendFile(path.resolve(cacheFile));
    }
  } catch (_) {}

  // Check sharp available
  if (!sharp) {
    console.error('[OG] Sharp not installed');
    return res.status(501).send('Image generation unavailable');
  }

  try {
    console.log(`[OG] Generating for ${ca.slice(0,8)}...`);
    
    const data = await fetchTokenData(ca);
    const pair = bestPair(data);
    
    if (!pair) {
      return res.status(404).send('Token not found');
    }

    const imageBuffer = await generateOgImage(ca, pair);
    
    // Save to cache
    fs.writeFileSync(cacheFile, imageBuffer);
    
    console.log(`[OG] ✅ Generated (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, s-maxage=300'
    });
    res.send(imageBuffer);

  } catch (err) {
    console.error('[OG] Error:', err.message);
    res.status(500).send('Image generation failed');
  }
});

// ════════════════════════════════════════════════════
//  CATCH-ALL — HTML with meta tags
// ════════════════════════════════════════════════════
app.get('*', async (req, res) => {
  if (/\.\w{2,5}$/.test(req.path)) return res.status(404).send('Not found');

  let ca = req.query.ca || req.query.token || null;
  if (!ca) {
    const seg = req.path.substring(1).replace(/\/$/, '');
    if (seg && seg.length > 10 && !seg.includes('/')) ca = seg.trim();
  }

  const reps   = { ...META_DEFAULTS };
  const origin = `${req.protocol}://${req.get('host')}`;
  reps['%%OG_URL%%'] = origin + req.originalUrl;

  if (ca && ca.length > 10) {
    try {
      const data = await fetchTokenData(ca);
      const pair = bestPair(data);

      if (pair) {
        const token    = pair.baseToken;
        const chainId  = pair.chainId || 'unknown';
        const name     = token.name || token.symbol || 'Unknown';
        const sym      = token.symbol || '???';
        const chainSym = CHAIN_REWARDS[chainId] || chainId.toUpperCase();
        const mcap     = fmtBig(pair.fdv || pair.marketCap || 0);

        const title = `${name} ($${sym}) — Vote to Earn ${chainSym}`;
        const desc  = `${name} ($${sym}) on ${chainId.toUpperCase()} • MCap ${mcap} • Vote to Earn ${chainSym}`;

        // OG image points to our generator
        const ogImage = `${origin}/og/${encodeURIComponent(ca)}.png`;

        const favicon = (pair.info && pair.info.imageUrl)
          || `https://dd.dexscreener.com/ds-data/tokens/${chainId}/${ca}.png`;

        reps['%%PAGE_TITLE%%'] = escHtml(title);
        reps['%%OG_TITLE%%']   = escHtml(title);
        reps['%%OG_DESC%%']    = escHtml(desc);
        reps['%%OG_IMAGE%%']   = ogImage;
        reps['%%FAVICON%%']    = favicon;
      }
    } catch (e) {
      console.error('[SSR] Error:', e.message);
    }
  }

  let html = HTML_TEMPLATE;
  for (const [k, v] of Object.entries(reps)) {
    html = html.split(k).join(v);
  }

  res.send(html);
});

// ════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('');
  console.log('🚀  Server running on port ' + PORT);
  console.log('');
  console.log('   Sharp: ' + (sharp ? '✅ installed' : '❌ NOT installed'));
  console.log('');
  console.log('   Test: http://localhost:' + PORT + '/?ca=YOUR_TOKEN');
  console.log('   OG:   http://localhost:' + PORT + '/og/YOUR_TOKEN.png');
  console.log('');
});
