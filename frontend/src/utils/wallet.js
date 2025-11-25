export function detectPlatform() {
    const userAgent = navigator.userAgent;
    const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
    const hasWalletExtension = typeof window.ethereum !== 'undefined';
    
    return { isMobile, hasWalletExtension };
}

export function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

export function formatBalance(balance) {
    if (balance === null || balance === undefined) return '0.00';
    const num = parseFloat(balance);
    return isNaN(num) ? '0.00' : num.toFixed(2);
}

export function validateAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return address.length === 42 && address.startsWith('0x');
}

export function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().replace(/[^a-zA-Z0-9\s\-_]/g, '');
}
