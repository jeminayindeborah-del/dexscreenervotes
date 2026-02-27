const fetch = require('node-fetch');

// Try to load sharp (works on Vercel Node.js runtime)
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.log('Sharp not available, using SVG fallback');
    sharp = null;
}

const CHAIN_REWARDS = {
    solana: 'SOL', ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC',
    arbitrum: 'ETH', avalanche: 'AVAX', base: 'ETH', optimism: 'ETH',
    fantom: 'FTM', cronos: 'CRO', sui: 'SUI', ton: 'TON',
    pulsechain: 'PLS', mantle: 'MNT', linea: 'LINEA', blast: 'BLAST'
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

function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function fetchTokenData(ca) {
    const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
}

function bestPair(data) {
    if (!data?.pairs?.length) return null;
    return data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
}

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

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect width="1200" height="630" fill="url(#orbGlow1)"/>
  <rect width="1200" height="630" fill="url(#orbGlow2)"/>

  <!-- Main card -->
  <rect x="30" y="30" width="1140" height="570" rx="24" fill="url(#cardGrad)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  
  <!-- Header -->
  <rect x="30" y="30" width="1140" height="65" rx="24" fill="rgba(0,0,0,0.4)"/>
  <rect x="30" y="75" width="1140" height="20" fill="url(#cardGrad)"/>
  <line x1="30" y1="95" x2="1170" y2="95" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  
  <!-- Header text -->
  <text x="60" y="72" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="white">DEXSCREENER</text>
  <text x="210" y="72" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="#22c55e">VOTES</text>
  
  <!-- Chain badge -->
  <rect x="${1140 - chainBadgeW}" y="48" width="${chainBadgeW}" height="30" rx="15" fill="rgba(34,197,94,0.15)"/>
  <text x="${1140 - chainBadgeW / 2}" y="69" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#22c55e" text-anchor="middle">${escXml(chainUp)}</text>

  <!-- Token icon circle -->
  <circle cx="130" cy="220" r="60" fill="none" stroke="rgba(34,197,94,0.25)" stroke-width="2"/>
  <circle cx="130" cy="220" r="52" fill="rgba(34,197,94,0.1)"/>
  <text x="130" y="235" font-family="Arial,sans-serif" font-size="40" font-weight="bold" fill="rgba(34,197,94,0.8)" text-anchor="middle">${escXml(sym.charAt(0))}</text>

  <!-- Token name -->
  <text x="210" y="200" font-family="Arial,sans-serif" font-size="38" font-weight="bold" fill="white">${escXml(name)}</text>
  <text x="210" y="235" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.4)">$${escXml(sym)}</text>

  <!-- Price -->
  <text x="210" y="295" font-family="Courier New,monospace" font-size="36" font-weight="bold" fill="#22c55e">${escXml(price)}</text>

  <!-- Stats boxes -->
  <rect x="60" y="330" width="170" height="70" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="145" y="365" font-family="Courier New,monospace" font-size="18" font-weight="bold" fill="white" text-anchor="middle">${escXml(mcap)}</text>
  <text x="145" y="388" font-family="Arial,sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">MARKET CAP</text>

  <rect x="245" y="330" width="170" height="70" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="330" y="365" font-family="Courier New,monospace" font-size="18" font-weight="bold" fill="white" text-anchor="middle">${escXml(liq)}</text>
  <text x="330" y="388" font-family="Arial,sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">LIQUIDITY</text>

  <rect x="430" y="330" width="170" height="70" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="515" y="365" font-family="Courier New,monospace" font-size="18" font-weight="bold" fill="#22c55e" text-anchor="middle">${escXml(vol)}</text>
  <text x="515" y="388" font-family="Arial,sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">24H VOLUME</text>

  <!-- Vote panel -->
  <rect x="660" y="120" width="480" height="300" rx="20" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  
  <!-- Vote header -->
  <text x="690" y="160" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="rgba(255,255,255,0.5)">MILESTONE PROGRESS</text>
  <text x="1110" y="160" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#22c55e" text-anchor="end">${votePct}%</text>

  <!-- Vote count -->
  <text x="690" y="220" font-family="Arial,sans-serif" font-size="52" font-weight="bold" fill="white">${voteCount.toLocaleString()}</text>
  <text x="${690 + String(voteCount.toLocaleString()).length * 30}" y="220" font-family="Arial,sans-serif" font-size="26" fill="rgba(255,255,255,0.15)">/${voteTotal.toLocaleString()}</text>

  <!-- Progress bar -->
  <rect x="690" y="250" width="420" height="14" rx="7" fill="#111"/>
  <rect x="690" y="250" width="${Math.min(420, 420 * votePct / 100)}" height="14" rx="7" fill="url(#greenGrad)"/>

  <!-- Vote button -->
  <rect x="690" y="290" width="420" height="55" rx="14" fill="url(#greenGrad)"/>
  <text x="900" y="325" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="black" text-anchor="middle">VOTE TO EARN ${escXml(chainSym)} REWARD</text>

  <!-- Subtext -->
  <text x="900" y="395" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,0.3)" text-anchor="middle">🔥 Community members voting in real-time</text>

  <!-- Bottom section -->
  <rect x="60" y="430" width="540" height="80" rx="16" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="85" y="465" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.4)">LIVE VOTES</text>
  <circle cx="165" cy="459" r="4" fill="#22c55e"/>
  <text x="85" y="490" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,0.2)">Community members earning rewards</text>

  <rect x="620" y="430" width="520" height="80" rx="16" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <text x="645" y="465" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="rgba(255,255,255,0.4)">LIVE CHART</text>
  <text x="645" y="490" font-family="Courier New,monospace" font-size="11" fill="rgba(255,255,255,0.2)">${escXml(sym)}/USD</text>
  
  <!-- Mini chart line -->
  <polyline points="850,480 880,460 910,470 940,450 970,465 1000,445 1030,455 1060,435 1090,450 1110,440" 
            fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
</svg>`;
}

module.exports = async (req, res) => {
    try {
        // Get CA from query or path
        let ca = req.query.ca;
        if (!ca && req.url) {
            const match = req.url.match(/\/og\/([^/.]+)/);
            if (match) ca = match[1];
        }

        if (!ca || ca.length < 10) {
            res.status(400).send('Invalid token address');
            return;
        }

        console.log(`[OG] Generating for: ${ca.slice(0, 8)}...`);

        // Fetch token data
        const data = await fetchTokenData(ca);
        const pair = bestPair(data);

        if (!pair) {
            res.status(404).send('Token not found');
            return;
        }

        // Generate SVG
        const svg = generateSvg(pair, ca);

        // Convert to PNG if sharp is available
        if (sharp) {
            try {
                const pngBuffer = await sharp(Buffer.from(svg))
                    .png()
                    .toBuffer();

                // Try to fetch and overlay token icon
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

                        // Circular mask
                        const mask = Buffer.from(`
              <svg width="100" height="100">
                <circle cx="50" cy="50" r="48" fill="white"/>
              </svg>
            `);

                        const circularIcon = await sharp(resizedIcon)
                            .composite([{ input: mask, blend: 'dest-in' }])
                            .png()
                            .toBuffer();

                        const finalImage = await sharp(pngBuffer)
                            .composite([{
                                input: circularIcon,
                                left: 80,
                                top: 170
                            }])
                            .png()
                            .toBuffer();

                        res.setHeader('Content-Type', 'image/png');
                        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
                        res.send(finalImage);
                        return;
                    }
                } catch (iconErr) {
                    console.log('[OG] Icon fetch failed, using fallback');
                }

                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
                res.send(pngBuffer);
                return;

            } catch (sharpErr) {
                console.error('[OG] Sharp error:', sharpErr.message);
            }
        }

        // Fallback: Return SVG directly
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
        res.send(svg);

    } catch (error) {
        console.error('[OG] Error:', error.message);

        // Fallback error image
        const fallbackSvg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#020203"/>
      <rect x="30" y="30" width="1140" height="570" rx="24" fill="#0a0b0e" stroke="rgba(255,255,255,0.08)"/>
      <text x="600" y="290" font-family="Arial,sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle">DEXSCREENER</text>
      <text x="600" y="340" font-family="Arial,sans-serif" font-size="32" font-weight="bold" fill="#22c55e" text-anchor="middle">VOTES</text>
      <text x="600" y="400" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.5)" text-anchor="middle">Vote to Earn SOL</text>
    </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.send(fallbackSvg);
    }
};