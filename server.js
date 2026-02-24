const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const PORT = process.env.PORT || 3000;
const app = express();

// Serve static files (images, css, js) - Assuming they are in the root directory
// We specify index: false so it doesn't automatically serve index.html for '/'
app.use(express.static(__dirname, { index: false }));

// Backend Proxy for DexScreener to bypass CORS
const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9'
};

function fetchJson(urlStr) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        https.get({
            hostname: url.hostname,
            path: url.pathname + url.search,
            family: 4, // Force IPv4 routing to bypass Node 18+ timeout bugs
            headers: fetchHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                } else {
                    reject(new Error(`API Error: Status ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

app.get('/api/token/:ca', async (req, res) => {
    try {
        const data = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(req.params.ca)}`);
        res.json(data);
    } catch (e) {
        console.error('API /token Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/trending', async (req, res) => {
    try {
        const data = await fetchJson('https://api.dexscreener.com/token-boosts/top/v1');
        res.json(data);
    } catch (e) {
        console.error('API /trending Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/*', async (req, res) => {
    let ca = req.params[0] ? req.params[0].replace(/\/$/, '') : '';

    // Ignore common static file extensions just in case
    if (ca.match(/\.(js|css|png|jpg|jpeg|svg|ico|json)$/)) {
        return res.status(404).send('Not found');
    }

    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    let title = 'DexScreener Votes • Elite Terminal';
    let ogTitle = 'Vote to Earn — DexScreener CORE';
    let ogDesc = '🗳 Vote and earn rewards from the community voting pool';
    let ogImage = '';
    let twImage = '';

    if (ca && ca.length > 10 && !ca.includes('/')) {
        try {
            // Native https bypasses Node's native fetch timeout issues
            const data = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`);
            if (data && data.pairs && data.pairs.length > 0) {
                const pairs = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
                const pair = pairs[0];
                const token = pair.baseToken;
                const tokenName = token.name || token.symbol || 'Unknown';
                const tokenSymbol = token.symbol || '???';
                const chainId = pair.chainId || 'unknown';

                const chainSymMap = { solana: 'SOL', ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC', arbitrum: 'ARB', avalanche: 'AVAX', base: 'BASE', optimism: 'OP', fantom: 'FTM', cronos: 'CRO', sui: 'SUI', ton: 'TON' };
                const chainRewardMap = { solana: 'SOL', ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC', arbitrum: 'ETH', avalanche: 'AVAX', base: 'ETH', optimism: 'ETH', fantom: 'FTM', cronos: 'CRO', sui: 'SUI', ton: 'TON' };
                const chainSym = chainRewardMap[chainId] || chainSymMap[chainId] || chainId.toUpperCase();

                const mcapRaw = pair.fdv || pair.marketCap || 0;
                let mcapStr = '$' + Math.round(mcapRaw);
                if (mcapRaw >= 1e9) mcapStr = '$' + (mcapRaw / 1e9).toFixed(1) + 'B';
                else if (mcapRaw >= 1e6) mcapStr = '$' + (mcapRaw / 1e6).toFixed(1) + 'M';
                else if (mcapRaw >= 1e3) mcapStr = '$' + (mcapRaw / 1e3).toFixed(1) + 'K';

                title = `${tokenName} (${tokenSymbol}) — Vote to Earn ${chainSym}`;
                ogTitle = title;
                ogDesc = `🗳 Vote ${tokenSymbol} and earn ${chainSym} rewards from the community voting pool. Market Cap: ${mcapStr}`;

                // We use Thum.io to take a screenshot of the page so Telegram shows the actual webpage layout.
                // The 'noanimate' flag is crucial: it prevents Thum.io from sending its placeholder spinner.
                // If Thum.io is busy, it will return an error instead of the spinner, meaning Telegram won't
                // permanently cache the spinner. On retry (or via @WebpageBot), the correct image will appear.
                const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
                const host = req.get('host');
                const siteUrl = `${protocol}://${host}/${ca}`;

                const screenshotUrl = `https://image.thum.io/get/width/1200/crop/630/wait/3/noanimate/${siteUrl}`;

                ogImage = screenshotUrl;
                twImage = screenshotUrl;
            }
        } catch (e) {
            console.error('API Error:', e);
        }
    }

    // Inject the exact CA we parsed on the backend straight into the JavaScript frontend
    // This bypasses any window.location.pathname issues on Vercel/Render!
    if (ca) {
        let injectionRegex = /function getCAFromURL\(\)\s*\{[\s\S]*?return null;\s*\}/;
        let injectionCode = `function getCAFromURL() { return "${ca}"; }`;
        html = html.replace(injectionRegex, injectionCode);
    }


    // Replace the placeholders in HTML with the dynamic values
    html = html.replace(/<title>.*?<\/title>/g, `<title>${title}</title>`);
    html = html.replace(/<meta property="og:title".*?>/g, `<meta property="og:title" content="${ogTitle}" id="ogTitle">`);
    html = html.replace(/<meta property="og:description".*?>/g, `<meta property="og:description" content="${ogDesc}" id="ogDesc">\n    <meta property="og:image:width" content="1200">\n    <meta property="og:image:height" content="630">`);
    html = html.replace(/<meta property="og:image".*?>/g, `<meta property="og:image" content="${ogImage}" id="ogImage">`);

    html = html.replace(/<meta name="twitter:title".*?>/g, `<meta name="twitter:title" content="${ogTitle}" id="twTitle">`);
    html = html.replace(/<meta name="twitter:description".*?>/g, `<meta name="twitter:description" content="${ogDesc}" id="twDesc">\n    <meta name="twitter:image:width" content="1200">\n    <meta name="twitter:image:height" content="630">`);
    html = html.replace(/<meta name="twitter:image".*?>/g, `<meta name="twitter:image" content="${twImage}" id="twImage">`);

    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Server running seamlessly! URL paths generate dynamic previews.`);
});
