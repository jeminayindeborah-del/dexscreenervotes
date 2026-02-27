const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

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
    solana: 'SOL', ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC',
    arbitrum: 'ETH', avalanche: 'AVAX', base: 'ETH', optimism: 'ETH',
    fantom: 'FTM', cronos: 'CRO', sui: 'SUI', ton: 'TON',
    pulsechain: 'PLS', mantle: 'MNT', linea: 'LINEA', blast: 'BLAST',
    scroll: 'SCROLL', zksync: 'ZK', manta: 'MANTA', sei: 'SEI',
    celo: 'CELO', moonbeam: 'GLMR', aptos: 'APT', near: 'NEAR'
};

function fmtBig(n) {
    if (!n) return '$0';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
//  API PROXY ROUTES
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
//  GENERATE OG IMAGE URL (uses free external service)
// ════════════════════════════════════════════════════
function generateOgImageUrl(origin, ca) {
    // The page URL we want to screenshot
    const pageUrl = `${origin}/?ca=${encodeURIComponent(ca)}`;

    // Use thum.io — FREE screenshot service
    // Format: https://image.thum.io/get/width/1200/crop/630/YOURURL
    const ogImage = `https://image.thum.io/get/width/1200/crop/630/${encodeURIComponent(pageUrl)}`;

    return ogImage;
}

// Alternative services (uncomment to switch):
// 
// // Option 2: urlbox (need free API key from urlbox.io)
// function generateOgImageUrl(origin, ca) {
//   const pageUrl = `${origin}/?ca=${encodeURIComponent(ca)}`;
//   return `https://api.urlbox.io/v1/YOUR_API_KEY/png?url=${encodeURIComponent(pageUrl)}&width=1200&height=630`;
// }
//
// // Option 3: screenshot.guru (free)
// function generateOgImageUrl(origin, ca) {
//   const pageUrl = `${origin}/?ca=${encodeURIComponent(ca)}`;
//   return `https://api.screenshot.guru/api/screenshot?url=${encodeURIComponent(pageUrl)}&width=1200&height=630`;
// }
//
// // Option 4: Just use token icon (simplest fallback)
// function generateOgImageUrl(origin, ca, pair) {
//   if (pair?.info?.imageUrl) return pair.info.imageUrl;
//   return `https://dd.dexscreener.com/ds-data/tokens/${pair?.chainId || 'solana'}/${ca}.png`;
// }

// ════════════════════════════════════════════════════
//  CATCH-ALL — HTML with injected meta tags
// ════════════════════════════════════════════════════
app.get('*', async (req, res) => {
    // Skip file requests
    if (/\.\w{2,5}$/.test(req.path)) return res.status(404).send('Not found');

    // Extract CA from URL
    let ca = req.query.ca || req.query.token || null;
    if (!ca) {
        const seg = req.path.substring(1).replace(/\/$/, '');
        if (seg && seg.length > 10 && !seg.includes('/')) ca = seg.trim();
    }

    // Build meta tag replacements
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

                // Generate screenshot URL via external service
                const ogImage = generateOgImageUrl(origin, ca);

                const favicon = (pair.info && pair.info.imageUrl)
                    || `https://dd.dexscreener.com/ds-data/tokens/${chainId}/${ca}.png`;

                reps['%%PAGE_TITLE%%'] = escHtml(title);
                reps['%%OG_TITLE%%'] = escHtml(title);
                reps['%%OG_DESC%%'] = escHtml(desc);
                reps['%%OG_IMAGE%%'] = ogImage;
                reps['%%FAVICON%%'] = favicon;
            }
        } catch (e) {
            console.error('[SSR] meta error:', e.message);
        }
    }

    // Inject into template
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
    console.log('   Local:  http://localhost:' + PORT + '/?ca=YOUR_TOKEN');
    console.log('');
    console.log('   ✅ Universal build — works on any hosting');
    console.log('   ✅ No Chrome/Puppeteer required');
    console.log('   ✅ Using external screenshot service (thum.io)');
    console.log('');
});