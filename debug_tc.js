
import { SHA256 } from 'crypto-js';
import * as fs from 'fs';
import * as path from 'path';

const tc = "66724004144";
const hash = SHA256(tc).toString();

console.log(`TC: ${tc}`);
console.log(`Calculated Hash: ${hash}`);

const absPath = "c:\\Users\\OZCAN\\.gemini\\antigravity\\scratch\\ciftci-destek-sorgulama\\Desteklemeler\\public\\data\\buzagi2025_1.json";

try {
    if (fs.existsSync(absPath)) {
        const fileContent = fs.readFileSync(absPath, 'utf-8');
        const json = JSON.parse(fileContent);

        if (json[hash]) {
            console.log("SUCCESS: Record FOUND!");
            console.log("Value:", json[hash]);
        } else {
            console.log("FAILURE: Record NOT found in JSON.");
            console.log("Calculated Hash:", hash);
        }
    } else {
        console.log(`File not found at: ${absPath}`);
    }
} catch (e) {
    console.error("Error reading file:", e);
}
