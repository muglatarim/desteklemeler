import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { hashTC } from '../utils/crypto';

// DataRow unused, removing or keeping if used later? removing for now.
// interface DataRow {
//     [key: string]: any;
// }

// Optimized Format per Shard
interface ShardData {
    cols: string[];
    data: { [hash: string]: any[] }; // stored as array of values corresponding to cols
}

export const AdminConverter: React.FC = () => {
    // 1. FILES STATE (Multi-file support)
    const [files, setFiles] = useState<File[]>([]);
    const [shards, setShards] = useState<ShardData[] | null>(null); // Array of 100 shards
    const [processing, setProcessing] = useState(false);
    const [previewCount, setPreviewCount] = useState(0);
    const [fileId, setFileId] = useState('');

    // Manual Inputs
    const [headerRowNo, setHeaderRowNo] = useState<number>(1);
    const [tcColLetter, setTcColLetter] = useState<string>('');
    const [vknColLetter, setVknColLetter] = useState<string>(''); // NEW: VKN Selection
    const [useDoubleHeader, setUseDoubleHeader] = useState<boolean>(false);

    // Filter / Format / Mapping State
    const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
    const [currencyCols, setCurrencyCols] = useState<Set<number>>(new Set());
    const [statusMsg, setStatusMsg] = useState('');
    const [maskedCols, setMaskedCols] = useState<Set<number>>(new Set());
    const [ignoredCols, setIgnoredCols] = useState<Set<number>>(new Set());
    const [titleCol, setTitleCol] = useState<number | null>(null);

    // Helper: Mask Name (Ali Veli -> Al* Ve*)
    const maskName = (fullName: string) => {
        return fullName.split(' ').map(word => {
            if (word.length < 3) return word;
            return word.substring(0, 2) + '*'.repeat(word.length - 2);
        }).join(' ');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFiles = Array.from(e.target.files);
            setFiles(selectedFiles);

            // Use the FIRST file's name as default ID suggestion
            const name = selectedFiles[0].name.split('.')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '');
            setFileId(name);

            setShards(null);
            setStatusMsg(`${selectedFiles.length} dosya seçildi. Başlıkları görmek için önizleme yapın.`);
            setDetectedHeaders([]);
            setCurrencyCols(new Set());
            setMaskedCols(new Set());
            setIgnoredCols(new Set());
            setTitleCol(null);
            setTcColLetter('');
            setVknColLetter('');
        }
    };

    const getColIndex = (letter: string): number => {
        const decoded = XLSX.utils.decode_col(letter.toUpperCase());
        return decoded;
    };

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

            // FIXED LOGIC: Only use Parent if Child exists.
            // If Child is empty, ignore Parent (avoids "Oğlak Sayısı" in empty cols)
            if (childText && lastParent && !childText.startsWith(lastParent)) {
                mergedHeaders.push(`${lastParent} ${childText}`);
            } else if (childText) {
                mergedHeaders.push(childText);
            } else {
                mergedHeaders.push(`Sütun${i}`);
            }
        }
        return mergedHeaders;
    };

    const toggleCurrencyCol = (index: number) => {
        const newSet = new Set(currencyCols);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
            // Cannot be both currency and masked usually, but let's allow or handle if needed.
        }
        setCurrencyCols(newSet);
    };

    const toggleMaskedCol = (index: number) => {
        const newSet = new Set(maskedCols);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
            // If masking, perform check on ignored? usually mutually exclusive but user can toggle.
        }
        setMaskedCols(newSet);
    };

    const toggleIgnoredCol = (index: number) => {
        const newSet = new Set(ignoredCols);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setIgnoredCols(newSet);
    };

    const toggleTitleCol = (index: number) => {
        if (titleCol === index) {
            setTitleCol(null);
        } else {
            setTitleCol(index);
        }
    };

    const inspectFile = () => {
        if (files.length === 0) return;

        // Inspect only the first file
        const fileToInspect = files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
                const headerIndex = Math.max(0, headerRowNo - 1);

                if (headerIndex >= rawRows.length) {
                    alert("Satır okunamadı.");
                    return;
                }

                const computedHeaders = getMergedHeaders(rawRows, headerIndex, useDoubleHeader);
                setDetectedHeaders(computedHeaders);

                setStatusMsg(`Başlıklar algılandı. Lütfen T.C. ve varsa VKN sütununu seçin.`);
            } catch (e: any) {
                alert("Hata: " + e.message);
            }
        };
        reader.readAsBinaryString(fileToInspect);
    };

    // Helper to process content of one file
    const processContent = (bstr: any, globalShards: ShardData[], tcIndex: number, vknIndex: number): number => {
        const currentTitleCol = titleCol;

        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
        const headerIndex = Math.max(0, headerRowNo - 1);

        if (headerIndex >= rawRows.length) return 0;

        const headers = getMergedHeaders(rawRows, headerIndex, useDoubleHeader);
        let count = 0;

        // Prepare Column Mapping (Filter ignored, etc.)
        // We need a stable list of columns for the schema.
        // For simplicity, we'll rebuild this mapping per row or just once per file?
        // Actually, across multiple files, headers SHOULD be the same.
        // We will assume the FIRST file defines the schema or we unify them.
        // For this implementation, we assume all files have same relevant columns.
        // We'll collect the "Clean Headers" once to check global consistency if we wanted, 
        // but let's just use the current file's headers and map to the global shard structure.

        // Wait! different files might have different header ORDER? 
        // If user selects multiple files, usually they are same format parts.
        // We will initialize shards' "cols" based on the first file processed if empty.

        let activeIndices: number[] = [];
        let activeHeaderNames: string[] = [];

        headers.forEach((h: string, idx: number) => {
            if (ignoredCols.has(idx)) return;
            if (idx === tcIndex || idx === vknIndex) return;
            activeIndices.push(idx);
            activeHeaderNames.push(h.replace(/\./g, '').trim());
        });

        // Initialize Global Shards Columns if first time
        if (globalShards[0].cols.length === 0) {
            // Add _title as last col if needed, or we handle per row
            // Let's add '_title' explicitly to cols if titleCol is set? 
            // Or just appended. Let's append '_title' to the schema always or if present.
            const schema = [...activeHeaderNames];
            if (currentTitleCol !== null) schema.push('_title');

            for (let s = 0; s < 100; s++) {
                globalShards[s].cols = schema;
            }
        }

        const schemaCols = globalShards[0].cols;

        for (let i = headerIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || !Array.isArray(row) || row.length === 0) continue;
            if (row.every(cell => cell === null || cell === undefined || cell === '')) continue;

            let masterKey = '';

            // 1. Determine Identity Key
            if (tcIndex !== -1 && row[tcIndex]) {
                const val = String(row[tcIndex]).trim();
                if (val.length > 2) masterKey = val;
            }
            // Fallback to VKN if no TC
            if (!masterKey && vknIndex !== -1 && row[vknIndex]) {
                const val = String(row[vknIndex]).trim();
                if (val.length > 2) masterKey = val;
            }

            if (!masterKey) continue;

            // 2. Build Value Array
            // We must map current file's row to the global schema.
            // Since we assume same order/schema for multi-file batch:
            const rowValues: any[] = [];

            // Iterate over activeIndices to pull data in order
            activeIndices.forEach((colIdx) => {
                let val = row[colIdx];

                // Clean / Format
                if (val === undefined || val === null) val = "";

                if (currencyCols.has(colIdx)) {
                    const numVal = Number(val);
                    if (!isNaN(numVal)) {
                        val = new Intl.NumberFormat('tr-TR', {
                            style: 'currency',
                            currency: 'TRY',
                            minimumFractionDigits: 2
                        }).format(numVal).replace('₺', '').trim() + ' ₺';
                    } else {
                        val = String(val);
                    }
                }

                if (maskedCols.has(colIdx)) {
                    val = maskName(String(val));
                }

                // Check if header name matches the schema (simple sanity check? skipped for speed)
                rowValues.push(val);
            });

            // Handle Title
            if (currentTitleCol !== null) {
                // If title col is one of the displayed cols, we still add it as _title at the end?
                // Or if we selected it as title, do we display it twice?
                // The logical "Title" is metadata `_title`.
                const tVal = row[currentTitleCol];
                rowValues.push(tVal ? String(tVal).trim() : "");
            } else if (schemaCols.includes('_title')) {
                // If schema has title but this row doesn't (maybe mixed files?), push empty
                rowValues.push("");
            }

            // 3. Shard Logic
            const hash = hashTC(masterKey);
            // Calculate Mod 100
            // hash is hex string. Convert to BigInt.
            // BigInt("0x" + hash)
            const bigVal = BigInt("0x" + hash);
            const shardId = Number(bigVal % 100n);

            // Add to shard
            if (!globalShards[shardId].data[hash]) {
                globalShards[shardId].data[hash] = rowValues;
            } else {
                // Duplicate Handling?
                // New format: data[hash] = Array of Values.
                // If we have duplicates, we need to store Array of Arrays?
                // The Home component needs to handle it.
                // Current Home implementation handles array of objects.
                // Our optimized format: `hash: [val1, val2]` (Single)
                // OR `hash: [[val1, val2], [val1, val2]]` (Multiple)

                const existing = globalShards[shardId].data[hash];
                // Check if existing is Array of Values (depth 1) or Array of Arrays (depth 2)
                // Heursitic: check first element. If it's Array, it's list of records.
                if (Array.isArray(existing[0])) {
                    // It's already multiple list
                    existing.push(rowValues);
                } else {
                    // It is single record, convert to multiple
                    globalShards[shardId].data[hash] = [existing, rowValues];
                }
            }

            count++;
        }
        return count;
    };

    const processFile = async () => {
        if (files.length === 0) return;
        if (!tcColLetter && !vknColLetter) {
            alert("Lütfen en az bir Kimlik Sütunu (T.C. veya VKN) seçiniz.");
            return;
        }

        setProcessing(true);
        setStatusMsg('İşleniyor...');

        const tcIndex = tcColLetter ? getColIndex(tcColLetter) : -1;
        const vknIndex = vknColLetter ? getColIndex(vknColLetter) : -1;

        // Initialize 100 Shards
        const tempDataShards: ShardData[] = Array.from({ length: 100 }, () => ({
            cols: [],
            data: {}
        }));

        let totalCount = 0;
        let processedFiles = 0;

        for (const file of files) {
            try {
                const count = await new Promise<number>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        try {
                            const c = processContent(evt.target?.result, tempDataShards, tcIndex, vknIndex);
                            resolve(c);
                        } catch (e) { reject(e); }
                    };
                    reader.onerror = (e) => reject(e);
                    reader.readAsBinaryString(file);
                });

                totalCount += count;
                processedFiles++;
                setStatusMsg(`${processedFiles}/${files.length} dosya işlendi...`);
            } catch (err: any) {
                console.error(`Error processing file ${file.name}:`, err);
                alert(`Hata (${file.name}): ` + err.message);
            }
        }

        if (totalCount === 0) {
            alert(`UYARI: Hiçbir satırda geçerli kayıt bulunamadı!`);
            setStatusMsg('Hata: Kayıt bulunamadı.');
        } else {
            alert(`${totalCount} kişi/kurum başarıyla işlendi.`);
            setStatusMsg(`Tamamlandı: ${totalCount} satır.`);
        }

        setShards(tempDataShards);
        setPreviewCount(totalCount);
        setProcessing(false);
    };

    const downloadZip = async () => {
        if (!fileId || !shards) { alert("Dosya ID veya Veri yok."); return; }

        try {
            const zip = new JSZip();
            const folder = zip.folder(fileId);

            if (!folder) throw new Error("Folder creation failed");

            // Add each shard to zip
            shards.forEach((shard, idx) => {
                // Optimization: Don't keep empty shards? 
                // BUT: If a shard is missing, 404 error on client. 
                // Better to keep them all, even if empty 'data'. 
                // Small empty json is cheap.
                folder.file(`${idx}.json`, JSON.stringify(shard));
            });

            const content = await zip.generateAsync({ type: "blob" });

            const fileName = `${fileId}.zip`;
            const href = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = href;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e: any) {
            alert("ZIP oluşturma hatası: " + e.message);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Admin: Çoklu Excel Dönüştürücü (TC/VKN)</h1>

            <div className="bg-white p-6 rounded shadow mb-6 space-y-6">

                <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">1. Excel Dosyaları Seçin (Çoklu Seçim)</label>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        multiple
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700"
                    />
                    {files.length > 0 && (
                        <p className="mt-2 text-sm text-green-600 font-semibold">{files.length} dosya seçildi.</p>
                    )}
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
                        disabled={files.length === 0}
                        className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 w-full mb-4 font-semibold shadow"
                    >
                        🔍 Sütunları Listele (Önizle)
                    </button>

                    {detectedHeaders.length > 0 && (
                        <div className="mb-6">
                            <h3 className="font-bold text-lg mb-2 text-blue-800">Sütun Ayarları</h3>
                            <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-2 border-l-4 border-yellow-400">
                                Lütfen <strong>T.C.</strong> ve varsa <strong>VKN</strong> sütununu seçin.
                                (Bu veri gizlilik gereği JSON içeriğine kaydedilmez, sadece sorgulama anahtarı olur).
                            </p>

                            <div className="mb-4 bg-blue-50 p-4 rounded border border-blue-200 text-sm space-y-2">
                                <h4 className="font-bold text-blue-900 border-b border-blue-300 pb-1 mb-2">Seçenekler Rehberi</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded border">TC</span>
                                        <span className="bg-blue-600 text-white text-[10px] px-2 py-1 rounded border">VKN</span>
                                        <span className="text-gray-700 font-medium">= Sorgulama Anahtarı (Gizli tutulur)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-green-700 font-bold">Para Birimi (₺)</span>
                                        <span className="text-gray-600">= Sayısal değerleri para birimi formatına çevirir (örn: 1.234,56 ₺)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-purple-700 font-bold">Maskele (Ad Soyad)</span>
                                        <span className="text-gray-600">= İsimleri maskeler (örn: AL** VE**)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-red-700 font-bold line-through">Yoksay (Sil)</span>
                                        <span className="text-gray-600">= Bu sütun JSON dosyasına eklenmez</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-orange-700 font-bold">Başlık Yap (İşletme No)</span>
                                        <span className="text-gray-600">= Kart başlığı olarak kullanılır (örn: Kişinin birden fazla işletmesi varsa başlıklardan ayırabilir)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto border p-2 rounded bg-gray-50">
                                {detectedHeaders.map((header, idx) => {
                                    const colLetter = XLSX.utils.encode_col(idx);
                                    const isTc = tcColLetter === colLetter;
                                    const isVkn = vknColLetter === colLetter;
                                    const isCurrency = currencyCols.has(idx);

                                    return (
                                        <div key={idx} className={`p-2 rounded border flex flex-col justify-between ${isTc ? 'bg-red-100 border-red-500' : isVkn ? 'bg-blue-100 border-blue-500' : 'bg-white'}`}>
                                            <div className="flex items-start justify-between mb-2">
                                                <span className="font-mono text-xs font-bold bg-gray-200 px-1 rounded">{colLetter}</span>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => {
                                                            if (isTc) setTcColLetter('');
                                                            else {
                                                                setTcColLetter(colLetter);
                                                                if (isVkn) setVknColLetter('');
                                                            }
                                                        }}
                                                        className={`text-[10px] px-2 py-1 rounded border ${isTc ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-red-50'}`}
                                                    >
                                                        TC
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (isVkn) setVknColLetter('');
                                                            else {
                                                                setVknColLetter(colLetter);
                                                                if (isTc) setTcColLetter('');
                                                            }
                                                        }}
                                                        className={`text-[10px] px-2 py-1 rounded border ${isVkn ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50'}`}
                                                    >
                                                        VKN
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="font-semibold text-sm mb-2 break-words leading-tight" title={header}>
                                                {header}
                                            </div>

                                            <div className="mt-auto pt-2 border-t flex flex-col gap-1">
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`curr-${idx}`}
                                                        checked={isCurrency}
                                                        onChange={() => toggleCurrencyCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-green-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`curr-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${isCurrency ? 'text-green-700' : 'text-gray-500'}`}>
                                                        {isCurrency ? 'PARA (₺)' : 'Para Birimi'}
                                                    </label>
                                                </div>
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`mask-${idx}`}
                                                        checked={maskedCols.has(idx)}
                                                        onChange={() => toggleMaskedCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`mask-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${maskedCols.has(idx) ? 'text-purple-700' : 'text-gray-500'}`}>
                                                        {maskedCols.has(idx) ? 'GİZLİ (KVKK)' : 'Maskele(Ad Soyad)'}
                                                    </label>
                                                </div>
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`ignore-${idx}`}
                                                        checked={ignoredCols.has(idx)}
                                                        onChange={() => toggleIgnoredCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-red-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`ignore-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${ignoredCols.has(idx) ? 'text-red-700 line-through' : 'text-gray-500'}`}>
                                                        {ignoredCols.has(idx) ? 'YOKSAYILDI' : 'Yoksay (Sil)'}
                                                    </label>
                                                </div>
                                                <div className="flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        id={`title-${idx}`}
                                                        checked={titleCol === idx}
                                                        onChange={() => toggleTitleCol(idx)}
                                                        disabled={isTc || isVkn}
                                                        className="w-4 h-4 text-orange-600 rounded cursor-pointer"
                                                    />
                                                    <label htmlFor={`title-${idx}`} className={`ml-2 text-xs font-bold cursor-pointer ${titleCol === idx ? 'text-orange-700' : 'text-gray-500'}`}>
                                                        {titleCol === idx ? 'BAŞLIK ETİKETİ' : 'Başlık Yap(İşletme No)'}
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <button
                        onClick={processFile}
                        disabled={files.length === 0 || (!tcColLetter && !vknColLetter) || processing}
                        className="bg-green-600 text-white px-4 py-4 rounded disabled:opacity-50 hover:bg-green-700 w-full font-bold text-lg shadow-lg"
                    >
                        {processing ? 'İŞLENİYOR...' : '5. ÇEVİRMEK İÇİN TIKLA'}
                    </button>
                </div>

                {statusMsg && (
                    <div className={`p-3 text-center rounded font-medium ${statusMsg.includes('Hata') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {statusMsg}
                    </div>
                )}
            </div>

            {shards && (
                <div className="bg-gray-50 p-4 rounded">
                    <h2 className="text-xl font-semibold mb-2">Başarılı ({previewCount} kayıt)</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Veri 100 parçaya bölündü ve optimize edildi.
                        İdirdiğiniz <strong>ZIP</strong> dosyasını açıp klasörü <code>public/data/</code> içine atınız.
                    </p>
                    <button
                        onClick={downloadZip}
                        className="bg-purple-800 text-white px-6 py-3 rounded font-bold hover:bg-purple-900 w-full"
                    >
                        ZIP DOSYASINI İNDİR (MOD 100)
                    </button>
                </div>
            )}

            {/* INFO GUIDE SECTION */}
            <div className="mt-12 bg-yellow-50 border border-yellow-200 rounded p-6 text-sm text-gray-700">
                <h3 className="font-bold text-lg mb-4 text-yellow-800 flex items-center">
                    <span className="text-2xl mr-2">💡</span> Yönetici Bilgi Notları: Yeni Destek Nasıl Eklenir?
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h4 className="font-bold border-b border-yellow-300 pb-1 mb-2">1. İndirilen ZIP Dosyası (Klasör)</h4>
                        <p className="mb-2">
                            İndirdiğiniz <b>.zip</b> dosyasını açın (Klasöre Çıkart / Extract). İçinden çıkan klasörü şu konuma atın:
                        </p>
                        <code className="block bg-black text-white p-2 rounded mb-2 font-mono">
                            public/data/
                        </code>
                        <p className="text-xs text-gray-500">
                            Örneğin ID'si <b>buzagi2025</b> ise, klasör yapısı şöyle olmalıdır:<br />
                            <code>.../Desteklemeler/public/data/buzagi2025/</code> <br />
                            (İçinde 0.json, 1.json... gibi 100 adet dosya olacak)
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold border-b border-yellow-300 pb-1 mb-2">2. Sorgulama Listesine Nasıl Eklenir?</h4>
                        <p className="mb-2">
                            Yeni desteğin listede görünmesi için şu dosyayı düzenlemelisiniz:
                        </p>
                        <code className="block bg-black text-white p-2 rounded mb-2 font-mono">
                            src/config.ts
                        </code>
                        <p className="mb-2">Dosyayı açıp listeye şunun gibi ekleme yapın:</p>
                        <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                            {`{ id: 'klasor_ismi', label: 'Ekranda Görünecek İsim' },`}
                        </pre>
                        <p className="text-xs text-gray-500 mt-1">
                            Önemli: <b>id</b> kısmı, oluşturduğunuz dosya ID'si (klasör adı) ile birebir aynı olmalıdır.
                        </p>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-yellow-200">
                    <p className="font-bold">Örnek Senaryo:</p>
                    <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                        <li>Admin panelinden dosyayı <b>arilik2026</b> ID'si ile oluşturdunuz ve ZIP'i indirdiniz.</li>
                        <li>ZIP'i açıp içindeki <b>arilik2026</b> klasörünü <b>public/data/</b> altına attınız.</li>
                        <li><b>src/config.ts</b> dosyasına gidip <code>{`{ id: 'arilik2026', label: '2026 Arılık Desteği' }`}</code> satırını eklediniz.</li>
                        <li>Siteyi güncellediniz (Build & Push). Artık yayında!</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
