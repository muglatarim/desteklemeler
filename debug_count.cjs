
const fs = require('fs');

const absPath = "c:\\Users\\OZCAN\\.gemini\\antigravity\\scratch\\ciftci-destek-sorgulama\\Desteklemeler\\public\\data\\buzagi2025_1.json";

try {
    if (fs.existsSync(absPath)) {
        const fileContent = fs.readFileSync(absPath, 'utf-8');
        const json = JSON.parse(fileContent);
        const keys = Object.keys(json);

        console.log(`File: ${absPath}`);
        console.log(`Total Records: ${keys.length}`);

        if (keys.length > 0) {
            console.log("Sample Key (Hash):", keys[0]);
            console.log("Sample Value:", json[keys[0]]);
        }
    } else {
        console.log(`File not found at: ${absPath}`);
    }
} catch (e) {
    console.error("Error reading file:", e);
}
