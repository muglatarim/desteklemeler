import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { hashTC, encryptData } from '../utils/crypto';

interface DataRow {
    [key: string]: any;
}

// Key = HashedTC, Value = EncryptedString
interface EncryptedOutput {
    [key: string]: string;
}

export const AdminConverter: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [jsonOutput, setJsonOutput] = useState<EncryptedOutput | null>(null);
    const [processing, setProcessing] = useState(false);
    const [previewCount, setPreviewCount] = useState(0);
    const [fileId, setFileId] = useState('');

    // Manual Inputs
    const [headerRowNo, setHeaderRowNo] = useState<number>(1);
    const [tcColLetter, setTcColLetter] = useState<string>('');
    const [useDoubleHeader, setUseDoubleHeader] = useState<boolean>(false);

    // Inspection State
    const [inspectionData, setInspectionData] = useState<{ col: string; val: string; index: number }[] | null>(null);
    const [statusMsg, setStatusMsg] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);

            const name = selectedFile.name.split('.')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '');
            setFileId(name);

            setJsonOutput(null);
            setStatusMsg('');
            setInspectionData(null);
        }
    };

    const getColIndex = (letter: string): number => {
        const decoded = XLSX.utils.decode_col(letter.toUpperCase());
        return decoded;
    };

    // Helper to merge parent row (with fill-forward) and child row
    const getMergedHeaders = (rawRows: any[], headerIndex: number, useDouble: boolean) => {
        const childRow = rawRows[headerIndex];

        if (!useDouble || headerIndex === 0) {
            return childRow.map((h: any, idx: number) => String(h || `Sütun${idx}`).trim());
        }

        const parentRow = rawRows[headerIndex - 1];
        const mergedHeaders: string[] = [];
        let lastParent = '';

        for (let i = 0; i < childRow.length; i++) {
            const pVal = parentRow[i];
            const cVal = childRow[i];

            if (pVal !== undefined && pVal !== null && String(pVal).trim() !== '') {
                lastParent = String(pVal).trim();
            }

            const childText = String(cVal || '').trim();

            if (childText && lastParent && !childText.startsWith(lastParent)) {
                mergedHeaders.push(`${lastParent} ${childText}`);
            } else if (childText) {
                mergedHeaders.push(childText);
            } else if (lastParent) {
                mergedHeaders.push(lastParent);
            } else {
                mergedHeaders.push(`Sütun${i}`);
            }
        }
        return mergedHeaders;
    };

    const inspectFile = () => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });

                const headerIndex = Math.max(0, headerRowNo - 1);
                const dataRowIndex = headerIndex + 1;

                if (dataRowIndex >= rawRows.length) {
                    alert("Veri satırı okunamadı. Başlık satırı numarasını kontrol edin.");
                    return;
                }

                const row = rawRows[dataRowIndex];
                if (!row || !Array.isArray(row)) {
                    alert("Veri satırı boş.");
                    return;
                }

                const map = row.map((val: any, idx: number) => {
                    const letter = XLSX.utils.encode_col(idx);
                    return { col: letter, val: String(val ?? '(boş)'), index: idx };
                });

                setInspectionData(map);
                setStatusMsg(`Veri satırı (${dataRowIndex + 1}) görüntülendi. T.C. kutusuna tıklayın.`);
            } catch (e: any) {
                alert("Hata: " + e.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    const processFile = async () => {
        if (!file) return;
        if (!tcColLetter) {
            alert("Lütfen T.C. Sütununu seçiniz.");
            return;
        }

        setProcessing(true);
        setStatusMsg('İşleniyor...');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
                const headerIndex = Math.max(0, headerRowNo - 1);

                if (headerIndex >= rawRows.length) throw new Error(`Satır ${headerRowNo} bulunamadı.`);

                const headers = getMergedHeaders(rawRows, headerIndex, useDoubleHeader);
                console.log("Final Headers:", headers);

                const tcIndex = getColIndex(tcColLetter);

                // NEW: Use Dictionary for O(1) lookup and security
                const encryptedMap: EncryptedOutput = {};
                let count = 0;

                for (let i = headerIndex + 1; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || !Array.isArray(row) || row.length === 0) continue;
                    if (row.every(cell => cell === null || cell === undefined || cell === '')) continue;

                    const obj: DataRow = {};
                    let tcValueForKey = '';

                    headers.forEach((headerName: string, colIdx: number) => {
                        const val = row[colIdx];
                        const cleanHeader = headerName.replace(/\./g, '').trim();

                        if (colIdx === tcIndex) {
                            if (val !== undefined && val !== null) {
                                const tcStr = String(val).trim();
                                if (tcStr.length > 2) {
                                    tcValueForKey = tcStr;
                                }
                            }
                        } else {
                            if (val !== undefined && val !== null) {
                                obj[cleanHeader] = val;
                            }
                        }
                    });

                    if (tcValueForKey) {
                        const lookupKey = hashTC(tcValueForKey);      // Key: SHA256(TC)
                        const cipherText = encryptData(obj, tcValueForKey); // Value: AES(Row, key=TC)

                        encryptedMap[lookupKey] = cipherText;
                        count++;
                    }
                }

                if (count === 0) {
                    alert(`UYARI: "${tcColLetter}" sütununda veri bulunamadı!`);
                    setStatusMsg('Hata: Kayıt bulunamadı.');
                } else {
                    alert(`${count} kişi şifrelendi ve güvenli formata dönüştürüldü.`);
                    setStatusMsg(`Tamamlandı: ${count} satır.`);
                }

                setJsonOutput(encryptedMap);
                setPreviewCount(count);

            } catch (err: any) {
                console.error(err);
                alert("Hata: " + err.message);
                setStatusMsg("İşlem başarısız.");
            } finally {
                setProcessing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const downloadJson = () => {
        if (!fileId) { alert("Dosya ID giriniz."); return; }
        const fileName = `${fileId}.json`;
        const json = JSON.stringify(jsonOutput, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Admin: Gelişmiş Excel Dönüştürücü</h1>

            <div className="bg-white p-6 rounded shadow mb-6 space-y-6">

                <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">1. Excel Dosyası Seçin</label>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded border">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">2. Başlık Satır Numarası (ALT SATIR)</label>
                        <input
                            type="number"
                            min="1"
                            value={headerRowNo}
                            onChange={(e) => setHeaderRowNo(parseInt(e.target.value) || 1)}
                            className="w-full border p-2 rounded"
                        />
                        <div className="mt-2 flex items-center">
                            <input
                                type="checkbox"
                                id="doubleHeader"
                                checked={useDoubleHeader}
                                onChange={(e) => setUseDoubleHeader(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <label htmlFor="doubleHeader" className="ml-2 text-sm text-gray-700 font-semibold cursor-pointer">
                                Üst satırla birleştir (Merge Headers)
                            </label>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">"Kuzu Sayısı" gibi genel başlıklar üst satırda ise işaretleyin.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">3. Dosya Kimliği (ID)</label>
                        <input
                            type="text"
                            value={fileId}
                            onChange={(e) => setFileId(e.target.value)}
                            placeholder="orn: buzagi2025"
                            className="w-full border p-2 rounded"
                        />
                    </div>
                </div>

                <div className="border-t pt-4">
                    <button
                        onClick={inspectFile}
                        disabled={!file}
                        className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 w-full mb-4 font-semibold shadow"
                    >
                        🔍 Dosya Yapısını ve Sütunları Göster
                    </button>

                    {inspectionData && (
                        <div className="bg-blue-50 p-4 rounded max-h-80 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 border border-blue-200">
                            {inspectionData.map((item) => (
                                <div
                                    key={item.col}
                                    onClick={() => setTcColLetter(item.col)}
                                    className={`p-2 rounded cursor-pointer border text-center transition-colors ${tcColLetter === item.col ? 'bg-red-600 text-white border-red-800 shadow-md transform scale-105' : 'bg-white hover:bg-red-50 border-gray-300'}`}
                                >
                                    <div className="font-bold text-xs mb-1">{item.col}</div>
                                    <div className="text-xs truncate font-mono" title={item.val}>{item.val || '-'}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-bold text-red-700 mb-1">4. Seçili T.C. Sütunu:</label>
                    <input
                        type="text"
                        value={tcColLetter}
                        readOnly
                        className="w-full border p-2 rounded bg-gray-100 font-bold text-red-900"
                    />
                </div>

                <button
                    onClick={processFile}
                    disabled={!file || !tcColLetter || processing}
                    className="bg-green-600 text-white px-4 py-4 rounded disabled:opacity-50 hover:bg-green-700 w-full font-bold text-lg shadow-lg"
                >
                    {processing ? 'İŞLENİYOR...' : '5. ÇEVİR VE ŞİFRELE'}
                </button>

                {statusMsg && (
                    <div className={`p-3 text-center rounded font-medium ${statusMsg.includes('Hata') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {statusMsg}
                    </div>
                )}
            </div>

            {jsonOutput && (
                <div className="bg-gray-50 p-4 rounded">
                    <h2 className="text-xl font-semibold mb-2">Başarılı ({previewCount} kayıt)</h2>
                    <p className="text-sm text-gray-600 mb-4">Veriler kişisel T.C. numaraları ile şifrelendi. Orijinal T.C. numarası olmadan bu dosyayı kimse okuyamaz.</p>
                    <button
                        onClick={downloadJson}
                        className="bg-blue-800 text-white px-6 py-3 rounded font-bold hover:bg-blue-900 w-full"
                    >
                        ŞİFRELİ VERİ DOSYASINI İNDİR ({fileId}.json)
                    </button>
                </div>
            )}
        </div>
    );
};
