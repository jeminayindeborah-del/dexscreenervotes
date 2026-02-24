// script.js
const CONFIG = {
    dexApiBase: 'https://api.dexscreener.com/latest/dex',
    chain: 'solana',
    totalVotes: 250,
    rewardPerVote: 0.0002, // SOL per vote
    maxReward: 0.05 // SOL
};

// State
let currentVotes = 42; // Starting votes
let tokenData = null;
let tokenMint = null;

// DOM Elements
const els = {
    tokenSymbolHeader: document.getElementById('token-symbol-header'),
    tokenIconDisplay: document.getElementById('token-icon-display'),
    tokenNameDisplay: document.getElementById('token-name-display'),
    tokenSymbolDisplay: document.getElementById('token-symbol-display'),
    priceDisplay: document.getElementById('price-display'),
    changeDisplay: document.getElementById('change-display'),
    liquidityDisplay: document.getElementById('liquidity-display'),
    volumeDisplay: document.getElementById('volume-display'),
    mcapDisplay: document.getElementById('mcap-display'),
    voteNumbers: document.getElementById('vote-numbers'),
    votePercent: document.getElementById('vote-percent'),
    tokenNameSmall: document.getElementById('token-name-small'),
    tokenPercent: document.getElementById('token-percent'),
    contractDisplay: document.getElementById('contract-display'),
    earnBanner: document.getElementById('earn-banner'),
    subEarn1: document.getElementById('sub-earn-1'),
    subEarn2: document.getElementById('sub-earn-2'),
    voteButton: document.getElementById('vote-button'),
    error: document.getElementById('error-message')
};

// Helper functions
function formatNumber(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
    return '$' + num.toFixed(2);
}

function formatPrice(price) {
    if (!price) return '$0';
    if (price < 0.000001) return '$' + price.toExponential(4);
    if (price < 0.001) return '$' + price.toFixed(8);
    if (price < 1) return '$' + price.toFixed(6);
    return '$' + price.toFixed(4);
}

function formatChange(change) {
    if (!change) return '0.00%';
    return (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
}

function getTokenFromPath() {
    let path = window.location.pathname;
    path = path.replace(/^\/+/, '').replace(/\/+$/, '');
    path = path.replace('index.html', '').replace(/^\/+/, '');
    return path || null;
}

function updateVoteDisplay() {
    const percent = (currentVotes / CONFIG.totalVotes) * 100;
    els.voteNumbers.innerHTML = `${currentVotes} <span>/</span> ${CONFIG.totalVotes} votes`;
    els.votePercent.textContent = Math.round(percent) + '%';
    els.tokenPercent.textContent = Math.round(percent) + '%';
}

async function loadToken(mint) {
    if (!mint) {
        showError('Enter a token address in the URL (e.g., /TOKEN_MINT)');
        return;
    }

    try {
        const response = await fetch(`${CONFIG.dexApiBase}/tokens/${CONFIG.chain}/${mint}`);
        const data = await response.json();

        if (!data.pairs || data.pairs.length === 0) {
            throw new Error('No pairs found');
        }

        // Get best pair
        const pair = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
        tokenData = pair;
        tokenMint = mint;

        // Update UI with token data
        const baseToken = pair.baseToken;
        const price = parseFloat(pair.priceUsd) || 0;
        const change = pair.priceChange?.h24 || 0;
        const volume = pair.volume?.h24 || 0;
        const liquidity = pair.liquidity?.usd || 0;
        const fdv = pair.fdv || 0;

        // Token info
        els.tokenNameDisplay.textContent = baseToken.name || 'Unknown';
        els.tokenNameSmall.textContent = baseToken.name || 'Unknown';
        els.tokenSymbolDisplay.textContent = baseToken.symbol || '???';
        els.tokenSymbolHeader.textContent = baseToken.symbol || '???';
        
        // Price data
        els.priceDisplay.textContent = formatPrice(price);
        els.changeDisplay.innerHTML = `<i class="fas fa-arrow-${change >= 0 ? 'up' : 'down'}"></i> ${formatChange(change)}`;
        els.changeDisplay.style.color = change >= 0 ? '#6feb9a' : '#ff6b6b';
        
        // Metrics
        els.liquidityDisplay.textContent = formatNumber(liquidity);
        els.volumeDisplay.textContent = formatNumber(volume);
        els.mcapDisplay.textContent = formatNumber(fdv);

        // Contract
        const shortAddr = mint.slice(0, 6) + '...' + mint.slice(-4);
        els.contractDisplay.innerHTML = `<i class="fas fa-wallet"></i> ${shortAddr}`;

        // Banner text
        const rewardMsg = `${baseToken.name} (${baseToken.symbol}) — Vote to Earn SOL Rewards`;
        els.earnBanner.querySelector('span:first-child').innerHTML = `<i class="fas fa-gem"></i> ${rewardMsg}`;
        els.subEarn1.innerHTML = `<i class="fas fa-bolt"></i> ${baseToken.name}(${baseToken.symbol})-VotetoEarnSOL <i class="fas fa-bolt"></i>`;

        // Randomize icon based on token (just for fun)
        const iconLetters = ['★', '♦', '♠', '♣', '⚡', '🔥', '💎', '🚀'];
        const iconIndex = (mint.length % iconLetters.length);
        els.tokenIconDisplay.textContent = iconLetters[iconIndex];

        hideError();
    } catch (err) {
        console.error(err);
        showError(`Could not load token "${mint}". Make sure it's a valid Solana token.`);
    }
}

function handleVote() {
    if (currentVotes >= CONFIG.totalVotes) {
        alert('Voting is closed — all votes have been cast!');
        return;
    }

    currentVotes++;
    updateVoteDisplay();

    // Calculate rewards
    const earnedSol = (currentVotes * CONFIG.rewardPerVote).toFixed(4);
    const rewardElement = document.querySelector('.reward-amount');
    rewardElement.innerHTML = `<i class="fas fa-star"></i> ${earnedSol} SOL`;

    alert(`✅ Vote counted! You earned ${CONFIG.rewardPerVote} SOL. Total pool: ${earnedSol} SOL`);
}

function showError(msg) {
    els.error.textContent = msg;
    els.error.style.display = 'block';
}

function hideError() {
    els.error.style.display = 'none';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const mint = getTokenFromPath();
    loadToken(mint);
    updateVoteDisplay();

    // Set random reward amount (in production this would come from a backend)
    document.querySelector('.reward-amount').innerHTML = `<i class="fas fa-star"></i> ${CONFIG.maxReward} SOL`;

    els.voteButton.addEventListener('click', handleVote);
});