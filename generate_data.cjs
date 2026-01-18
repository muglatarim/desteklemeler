const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

const sampleData = [
    {
        "Sıra No": 1,
        "Köy/Mahalle": "CUMALI",
        "Sahibi": "ALİ TÜRKMEN",
        "İşletme No": "TR480001004781",
        "tcHash": sha256("12345678901"), // Hashed TC
        "Temel Destek Alan Buzağı Sayısı": 2,
        "Destek Tutarı Toplam": "5.600,00₺"
    },
    {
        "Sıra No": 2,
        "Köy/Mahalle": "CUMALI",
        "Sahibi": "MEHMET ATA PİLAVCI",
        "İşletme No": "TR480000014745",
        "tcHash": sha256("22222222222"),
        "Temel Destek Alan Buzağı Sayısı": 2,
        "Destek Tutarı Toplam": "5.600,00₺"
    },
    {
        "Sıra No": 3,
        "Köy/Mahalle": "EMECİK",
        "Sahibi": "FATMA AKDENİZ",
        "İşletme No": "TR480000004075",
        "tcHash": sha256("33333333333"),
        "Temel Destek Alan Buzağı Sayısı": 1,
        "Destek Tutarı Toplam": "3.780,00₺"
    }
];

const outputPath = path.join(__dirname, 'netlify', 'functions', 'uploaddata.json');
fs.writeFileSync(outputPath, JSON.stringify(sampleData, null, 2));
console.log(`Sample data created at ${outputPath} with hashes.`);
console.log("12345678901 Hash:", sha256("12345678901"));
