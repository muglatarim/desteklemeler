
const CryptoJS = require('crypto-js');
const fs = require('fs');

const tc = "66724004144";
const hash = CryptoJS.SHA256(tc).toString();

console.log(`Checking TC: ${tc}`);
console.log(`Hash: ${hash}`);

const absPath = "c:\\Users\\OZCAN\\.gemini\\antigravity\\scratch\\ciftci-destek-sorgulama\\Desteklemeler\\public\\data\\buzagi2025_1.json";

try {
    if (fs.existsSync(absPath)) {
        const fileContent = fs.readFileSync(absPath, 'utf-8');
        const json = JSON.parse(fileContent);

        const record = json[hash];
        if (record) {
            console.log("SUCCESS: Record FOUND!");
            console.log("Type of record:", typeof record);
            console.log("Raw Record Content:", record);

            if (typeof record === 'string') {
                console.log("It is a STRING. Trying to parse...");
                try {
                    const parsed = JSON.parse(record);
                    console.log("Parsed content:", parsed);
                    console.log("Keys:", Object.keys(parsed));
                } catch (e) {
                    console.log("Parse Error:", e.message);
                }
            } else {
                console.log("It is NOT a string (Already Object).");
                console.log("Keys:", Object.keys(record));
            }
        } else {
            console.log("FAILURE: Record NOT found.");
        }
    } else {
        console.log("File not found.");
    }
} catch (e) {
    console.error("Error:", e);
}
