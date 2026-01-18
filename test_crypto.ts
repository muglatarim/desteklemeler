import CryptoJS from 'crypto-js';
const { SHA256 } = CryptoJS;

const tc = "12345678901";
const hash = SHA256(tc).toString();

console.log(`TC: ${tc}`);
console.log(`Hash (crypto-js): ${hash}`);

// Expected independent verify
// Node crypto: 254aa248acb47dd654ca3ea53f48c2c26d641d23d7e2e93a1ec56258df7674c4
// If they match, then hash logic is fine.
