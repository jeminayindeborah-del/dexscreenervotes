const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

// Try to load sharp (optional)
let sharp;
try {
    sharp = require('sharp');
    console.log('[Server] Sharp loaded ✅');
} catch (e) {
    console.log('[Server] Sharp not available, using SVG fallback');
    sharp = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = process.env.VERCEL === '1';

app.set('trust proxy', 1);

// ════════════════════════════════════════════════════
//  TOKEN DATA CACHE
// ════════════════════════════════════════════════════
const tokenCache = new Map();
const TOKEN_TTL = 5 * 60 * 1000;

async function fetchTokenData(ca) {
    const key = ca.toLowerCase();
    const now = Date.now();
    const hit = tokenCache.get(key);
    if (hit && now - hit.ts < TOKEN_TTL) return hit.data;

    const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
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
    solana: 'SOL', ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC',
    arbitrum: 'ETH', avalanche: 'AVAX', base: 'ETH', optimism: 'ETH',
    fantom: 'FTM', cronos: 'CRO', sui: 'SUI', ton: 'TON',
    pulsechain: 'PLS', mantle: 'MNT', linea: 'LINEA', blast: 'BLAST',
    scroll: 'SCROLL', zksync: 'ZK', manta: 'MANTA', sei: 'SEI'
};

function fmtBig(n) {
    if (!n) return '$0';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
}

function fmtPrice(p) {
    if (!p || isNaN(p)) return '$0.00';
    p = parseFloat(p);
    if (p >= 1000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return '$' + p.toFixed(2);
    if (p >= 0.01) return '$' + p.toFixed(4);
    return '$' + p.toFixed(8);
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ════════════════════════════════════════════════════
//  SVG GENERATOR
// ════════════════════════════════════════════════════
function generateSvg(pair, ca) {
    const token = pair.baseToken;
    const chainId = pair.chainId || 'unknown';
    const chainUp = chainId.toUpperCase();
    const chainSym = CHAIN_REWARDS[chainId] || chainUp;

    let name = token.name || token.symbol || 'Unknown';
    if (name.length > 18) name = name.slice(0, 16) + '…';

    let sym = (token.symbol || '???').toUpperCase();
    if (sym.length > 10) sym = sym.slice(0, 8);

    const price = fmtPrice(pair.priceUsd);
    const mcap = fmtBig(pair.fdv || pair.marketCap || 0);
    const liq = fmtBig(pair.liquidity?.usd || 0);
    const vol = fmtBig(pair.volume?.h24 || 0);

    const voteCount = Math.floor(800 + Math.random() * 2500);
    const voteTotal = Math.ceil(voteCount / (0.4 + Math.random() * 0.5));
    const votePct = Math.round((voteCount / voteTotal) * 100);

    const chainBadgeW = chainUp.length * 12 + 40;

    return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
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
    <radialGradient id="orbGlow1" cx="20%" cy="20%" r="50%">
      <stop offset="0%" stop-color="rgba(34,197,94,0.12)"/>
      <stop offset="100%" stop-color="rgba(34,197,94,0)"/>
    </radialGradient>
    <radialGradient id="orbGlow2" cx="80%" cy="80%" r="50%">
      <stop offset="0%" stop-color="rgba(34,197,94,0.08)"/>
      <stop offset="100%" stop-color="rgba(34,197,94,0)"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect width="1200" height="630" fill="url(#orbGlow1)"/>
  <rect width="1200" height="630" fill="url(#orbGlow2)"/>

  <rect x="30" y="30" width="1140" height="570" rx="24" fill="url(#cardGrad)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  
  <rect x="30" y="30" width="1140" height="65" rx="24" fill="rgba(0,0,0,0.4)"/>
  <rect x="30" y="75" width="1140" height="20" fill="url(#cardGrad)"/>
  <line x1="30" y1="95" x2="1170" y2="95" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  
  <text x="60" y="72" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="white">DEXSCREENER</text>
  <text x="210" y="72" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="#22c55e">VOTES</text>
  
  <rect x="${1140 - chainBadgeW}" y="48" width="${chainBadgeW}" height="30" rx="15" fill="rgba(34,197,94,0.15)"/>
  <text x="${1140 - chainBadgeW / 2}" y="69" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#22c55e" text-anchor="middle">${escXml(chainUp)}</text>

  <circle cx="130" cy="220" r="60" fill="none" stroke="rgba(34,197,94,0.25)" stroke-width="2"/>
  <circle cx="130" cy="220" r="52" fill="rgba(34,197,94,0.1)"/>
  <text x="130" y="235" font-family="Arial,sans-serif" font-size="40" font-weight="bold" fill="rgba(34,197,94,0.8)" text-anchor="middle">${escXml(sym.charAt(0))}</text>

  <text x="210" y="200" font-family="Arial,sans-serif" font-size="38" font-weight="bold" fill="white">${escXml(name)}</text>
  <text x="210" y="235" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.4)">$${escXml(sym)}</text>

  <text x="210" y="295" font-family="Courier New,monospace" font-size="36" font-weight="bold" fill="#22c55e">${escXml(price)}</text>

  <rect x="60" y="330" width="170" height="70" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="145" y="365" font-family="Courier New,monospace" font-size="18" font-weight="bold" fill="white" text-anchor="middle">${escXml(mcap)}</text>
  <text x="145" y="388" font-family="Arial,sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">MARKET CAP</text>

  <rect x="245" y="330" width="170" height="70" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="330" y="365" font-family="Courier New,monospace" font-size="18" font-weight="bold" fill="white" text-anchor="middle">${escXml(liq)}</text>
  <text x="330" y="388" font-family="Arial,sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">LIQUIDITY</text>

  <rect x="430" y="330" width="170" height="70" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="515" y="365" font-family="Courier New,monospace" font-size="18" font-weight="bold" fill="#22c55e" text-anchor="middle">${escXml(vol)}</text>
  <text x="515" y="388" font-family="Arial,sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">24H VOLUME</text>

  <rect x="660" y="120" width="480" height="300" rx="20" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  
  <text x="690" y="160" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="rgba(255,255,255,0.5)">MILESTONE PROGRESS</text>
  <text x="1110" y="160" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#22c55e" text-anchor="end">${votePct}%</text>

  <text x="690" y="220" font-family="Arial,sans-serif" font-size="52" font-weight="bold" fill="white">${voteCount.toLocaleString()}</text>
  <text x="${690 + String(voteCount.toLocaleString()).length * 30}" y="220" font-family="Arial,sans-serif" font-size="26" fill="rgba(255,255,255,0.15)">/${voteTotal.toLocaleString()}</text>

  <rect x="690" y="250" width="420" height="14" rx="7" fill="#111"/>
  <rect x="690" y="250" width="${Math.min(420, 420 * votePct / 100)}" height="14" rx="7" fill="url(#greenGrad)"/>

  <rect x="690" y="290" width="420" height="55" rx="14" fill="url(#greenGrad)"/>
  <text x="900" y="325" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="black" text-anchor="middle">VOTE TO EARN ${escXml(chainSym)} REWARD</text>

  <text x="900" y="395" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,0.3)" text-anchor="middle">🔥 Community members voting in real-time</text>

  <rect x="60" y="430" width="540" height="80" rx="16" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="85" y="465" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.4)">LIVE VOTES</text>
  <circle cx="165" cy="459" r="4" fill="#22c55e"/>
  <text x="85" y="490" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,0.2)">Community members earning rewards</text>

  <rect x="620" y="430" width="520" height="80" rx="16" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="645" y="465" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.4)">LIVE CHART</text>
  <text x="645" y="490" font-family="Courier New,monospace" font-size="11" fill="rgba(255,255,255,0.2)">${escXml(sym)}/USD</text>
  
  <polyline points="850,480 880,460 910,470 940,450 970,465 1000,445 1030,455 1060,435 1090,450 1110,440" 
            fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
</svg>`;
}

// ════════════════════════════════════════════════════
//  HTML TEMPLATE
// ════════════════════════════════════════════════════
const HTML_TEMPLATE = fs.readFileSync(
    path.join(__dirname, 'public', 'index.html'), 'utf8'
);

const META_DEFAULTS = {
    '%%PAGE_TITLE%%': 'DexScreener Votes • Elite Terminal',
    '%%OG_TITLE%%': 'Vote to Earn — DexScreener CORE',
    '%%OG_DESC%%': 'Vote to Earn SOL',
    '%%OG_IMAGE%%': '',
    '%%OG_URL%%': '',
    '%%FAVICON%%': ''
};

// ════════════════════════════════════════════════════
//  STATIC FILES
// ════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ════════════════════════════════════════════════════
//  API ROUTES
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
//  OG IMAGE ROUTE (for non-Vercel hosting)
// ════════════════════════════════════════════════════
if (!IS_VERCEL) {
    app.get('/og/:ca.png', async (req, res) => {
        try {
            const ca = req.params.ca;
            if (!ca || ca.length < 10) {
                return res.status(400).send('Invalid token address');
            }

            console.log(`[OG] Generating for: ${ca.slice(0, 8)}...`);

            const data = await fetchTokenData(ca);
            const pair = bestPair(data);

            if (!pair) {
                return res.status(404).send('Token not found');
            }

            const svg = generateSvg(pair, ca);

            // Try to convert to PNG with sharp
            if (sharp) {
                try {
                    let pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

                    // Try to overlay token icon
                    try {
                        const iconUrl = pair.info?.imageUrl ||
                            `https://dd.dexscreener.com/ds-data/tokens/${pair.chainId}/${ca}.png`;

                        const iconRes = await fetch(iconUrl, { timeout: 5000 });
                        if (iconRes.ok) {
                            const iconBuffer = Buffer.from(await iconRes.arrayBuffer());

                            const resizedIcon = await sharp(iconBuffer)
                                .resize(100, 100)
                                .png()
                                .toBuffer();

                            const mask = Buffer.from(`
                <svg width="100" height="100">
                  <circle cx="50" cy="50" r="48" fill="white"/>
                </svg>
              `);

                            const circularIcon = await sharp(resizedIcon)
                                .composite([{ input: mask, blend: 'dest-in' }])
                                .png()
                                .toBuffer();

                            pngBuffer = await sharp(pngBuffer)
                                .composite([{ input: circularIcon, left: 80, top: 170 }])
                                .png()
                                .toBuffer();
                        }
                    } catch (iconErr) {
                        console.log('[OG] Icon fetch failed');
                    }

                    res.set('Content-Type', 'image/png');
                    res.set('Cache-Control', 'public, max-age=300');
                    return res.send(pngBuffer);

                } catch (sharpErr) {
                    console.error('[OG] Sharp error:', sharpErr.message);
                }
            }

            // Fallback to SVG
            res.set('Content-Type', 'image/svg+xml');
            res.set('Cache-Control', 'public, max-age=300');
            res.send(svg);

        } catch (err) {
            console.error('[OG] Error:', err.message);
            res.status(500).send('Image generation failed');
        }
    });
}

// ════════════════════════════════════════════════════
//  CATCH-ALL — HTML with meta tags
// ════════════════════════════════════════════════════
app.get('*', async (req, res) => {
    if (/\.\w{2,5}$/.test(req.path)) return res.status(404).send('Not found');
    if (req.path.startsWith('/og/') || req.path.startsWith('/api/')) return res.status(404).send('Not found');

    let ca = req.query.ca || req.query.token || null;
    if (!ca) {
        const seg = req.path.substring(1).replace(/\/$/, '');
        if (seg && seg.length > 10 && !seg.includes('/')) ca = seg.trim();
    }

    const reps = { ...META_DEFAULTS };
    const origin = `${req.protocol}://${req.get('host')}`;
    reps['%%OG_URL%%'] = origin + req.originalUrl;

    if (ca && ca.length > 10) {
        try {
            const data = await fetchTokenData(ca);
            const pair = bestPair(data);

            if (pair) {
                const token = pair.baseToken;
                const chainId = pair.chainId || 'unknown';
                const name = token.name || token.symbol || 'Unknown';
                const sym = token.symbol || '???';
                const chainSym = CHAIN_REWARDS[chainId] || chainId.toUpperCase();
                const mcap = fmtBig(pair.fdv || pair.marketCap || 0);

                const title = `${name} ($${sym}) — Vote to Earn ${chainSym}`;
                const desc = `${name} ($${sym}) on ${chainId.toUpperCase()} • MCap ${mcap} • Vote to Earn ${chainSym}`;
                const ogImage = `${origin}/og/${encodeURIComponent(ca)}.png`;

                const favicon = (pair.info && pair.info.imageUrl)
                    || `https://dd.dexscreener.com/ds-data/tokens/${chainId}/${ca}.png`;

                reps['%%PAGE_TITLE%%'] = escHtml(title);
                reps['%%OG_TITLE%%'] = escHtml(title);
                reps['%%OG_DESC%%'] = escHtml(desc);
                reps['%%OG_IMAGE%%'] = ogImage;
                reps['%%FAVICON%%'] = favicon;
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
//  EXPORT & START
// ════════════════════════════════════════════════════
module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('🚀  Server running on port ' + PORT);
        console.log('');
        console.log('   Environment: ' + (IS_VERCEL ? 'Vercel' : 'Standalone'));
        console.log('   Sharp: ' + (sharp ? '✅' : '❌ (using SVG fallback)'));
        console.log('');
        console.log('   Test: http://localhost:' + PORT + '/?ca=YOUR_TOKEN');
        console.log('   OG:   http://localhost:' + PORT + '/og/YOUR_TOKEN.png');
        console.log('');
    });
}
