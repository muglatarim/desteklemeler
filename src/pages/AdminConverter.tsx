import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { hashTC } from '../utils/crypto';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { ref, set, update, onValue } from 'firebase/database';

export const AdminConverter: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    const [files, setFiles] = useState<File[]>([]);
    const [processing, setProcessing] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [fileId, setFileId] = useState('');
    const [supportLabel, setSupportLabel] = useState('');

    // Manual Inputs
    const [headerRowNo, setHeaderRowNo] = useState<number>(1);
    const [tcColLetter, setTcColLetter] = useState<string>('');
    const [vknColLetter, setVknColLetter] = useState<string>('');
    const [useDoubleHeader, setUseDoubleHeader] = useState<boolean>(false);

    // Filter / Format / Mapping State
    const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
    const [previewRow, setPreviewRow] = useState<any[]>([]);
    const [currencyCols, setCurrencyCols] = useState<Set<number>>(new Set());
    const [maskedCols, setMaskedCols] = useState<Set<number>>(new Set());
    const [ignoredCols, setIgnoredCols] = useState<Set<number>>(new Set());
    const [titleCol, setTitleCol] = useState<number | null>(null);
    
    // Support Management State
    const [existingSupports, setExistingSupports] = useState<any[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);


    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const fetchSupports = () => {
            try {
                const supportsRef = ref(db, "support_types");
                onValue(supportsRef, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const supports = Object.keys(data).map(key => ({
                            ...data[key],
                            id: key
                        }));
                        const sortedSupports = supports.sort((a: any, b: any) => {
                            // 1. Sıralama Değeri (Order) varsa ona göre
                            if (a.order !== undefined && b.order !== undefined) {
                                return a.order - b.order;
                            }
                            
                            // 2. Görünürlük (True önce gelsin) - Fallback
                            const aVisible = a.isVisible !== false;
                            const bVisible = b.isVisible !== false;
                            if (aVisible !== bVisible) return aVisible ? -1 : 1;
                            
                            // 3. Güncellenme Tarihi (Yeni önce gelsin) - Fallback
                            const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                            const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                            return bDate - aDate;
                        });
                        setExistingSupports(sortedSupports);
                    } else {
                        setExistingSupports([]);
                    }
                });
            } catch (err) {
                console.error("Destekler yüklenemedi:", err);
            }
        };
        if (user) fetchSupports();
    }, [user, refreshTrigger]);

    const handleUpdateSupport = async (id: string, newLabel: string, isVisible: boolean) => {
        try {
            const supportRef = ref(db, `support_types/${id}`);
            await update(supportRef, {
                label: newLabel,
                isVisible: isVisible
            });
            setRefreshTrigger(prev => prev + 1);
        } catch (err: any) {
            alert("Hata: " + err.message);
        }
    };

    const handleReorder = async (draggedId: string, targetId: string) => {
        const newSupports = [...existingSupports];
        const draggedIdx = newSupports.findIndex(s => s.id === draggedId);
        const targetIdx = newSupports.findIndex(s => s.id === targetId);
        
        if (draggedIdx === -1 || targetIdx === -1) return;
        
        const [removed] = newSupports.splice(draggedIdx, 1);
        newSupports.splice(targetIdx, 0, removed);
        
        setExistingSupports(newSupports);
        
        // Veritabanını güncelle
        const updates: any = {};
        newSupports.forEach((sup, index) => {
            updates[`support_types/${sup.id}/order`] = index;
        });
        
        try {
            await update(ref(db), updates);
        } catch (err: any) {
            console.error("Sıralama güncellenemedi:", err);
        }
    };

    const handleDeleteSupport = async (id: string) => {
        if (!window.confirm(`"${id}" kimlikli desteği ve TÜM VERİLERİNİ silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) {
            return;
        }

        try {
            const updates: any = {};
            updates[`support_types/${id}`] = null;
            updates[`data/${id}`] = null;
            
            await update(ref(db), updates);
            setRefreshTrigger(prev => prev + 1);
            alert("Destek ve verileri başarıyla silindi.");
        } catch (err: any) {
            alert("Silme hatası: " + err.message);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            setLoginError('Giriş başarısız: ' + err.message);
        }
    };

    const handleLogout = () => signOut(auth);

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

            const name = selectedFiles[0].name.split('.')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '');
            setFileId(name);
            setSupportLabel(selectedFiles[0].name.split('.')[0]);

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
        return XLSX.utils.decode_col(letter.toUpperCase());
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

    const inspectFile = () => {
        if (files.length === 0) return;
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
                setPreviewRow(rawRows[headerIndex + 1] || []);
                setStatusMsg(`Başlıklar algılandı. Lütfen T.C. ve varsa VKN sütununu seçin.`);
            } catch (e: any) {
                alert("Hata: " + e.message);
            }
        };
        reader.readAsBinaryString(fileToInspect);
    };


    const processAndUpload = async () => {
        if (files.length === 0) return;
        if (!tcColLetter && !vknColLetter) {
            alert("Lütfen en az bir Kimlik Sütunu (T.C. veya VKN) seçiniz.");
            return;
        }
        if (!fileId || !supportLabel) {
            alert("Dosya Kimliği ve Destek Adı zorunludur.");
            return;
        }

        setProcessing(true);
        setStatusMsg('Veriler işleniyor...');

        try {
            const tcIndex = tcColLetter ? getColIndex(tcColLetter) : -1;
            const vknIndex = vknColLetter ? getColIndex(vknColLetter) : -1;
            
            // 1. Prepare Schema
            let activeIndices: number[] = [];
            let activeHeaderNames: string[] = [];
            detectedHeaders.forEach((h: string, idx: number) => {
                if (ignoredCols.has(idx)) return;
                if (idx === tcIndex || idx === vknIndex) return;
                activeIndices.push(idx);
                activeHeaderNames.push(h.replace(/\./g, '').trim());
            });
            const finalCols = [...activeHeaderNames];
            if (titleCol !== null) finalCols.push('_title');

            let totalCount = 0;
            const uploadQueue: Record<string, any> = {};

            for (const file of files) {
                setStatusMsg(`${file.name} okunuyor...`);
                const data = await new Promise<any[]>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const bstr = e.target?.result;
                            const wb = XLSX.read(bstr, { type: 'binary' });
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            const jsonData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
                            resolve(jsonData);
                        } catch (err) {
                            reject(new Error("Excel ayrıştırma hatası: " + (err as any).message));
                        }
                    };
                    reader.onerror = () => reject(new Error("Dosya okuma hatası."));
                    reader.readAsBinaryString(file);
                });

                setStatusMsg(`${file.name}: ${data.length} satır ayrıştırıldı. Kümeleniyor...`);

                const headerIndex = Math.max(0, headerRowNo - 1);
                for (let i = headerIndex + 1; i < data.length; i++) {
                    const row = data[i];
                    if (!row || (row as any[]).every(cell => !cell)) continue;

                    let masterKey = '';
                    if (tcIndex !== -1 && row[tcIndex]) masterKey = String(row[tcIndex]).trim();
                    if (!masterKey && vknIndex !== -1 && row[vknIndex]) masterKey = String(row[vknIndex]).trim();
                    let hashedKey = masterKey;
                    if (hashedKey.length < 11) {
                        hashedKey = hashedKey.padStart(10, '0');
                    }
                    hashedKey = hashTC(hashedKey);

                    const rowValues: any[] = [];
                    activeIndices.forEach((colIdx) => {
                        let val = row[colIdx] ?? "";
                        if (currencyCols.has(colIdx) && !isNaN(Number(val))) {
                            val = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(val)).replace('₺', '').trim() + ' ₺';
                        }
                        if (maskedCols.has(colIdx)) val = maskName(String(val));
                        rowValues.push(val);
                    });
                    
                    const resultData: any = { v: rowValues };
                    if (titleCol !== null) resultData._title = row[titleCol] ? String(row[titleCol]).trim() : "";

                    // Çoklu kayıt desteği: Her satır için benzersiz bir alt anahtar kullan
                    // Satır içeriğinden bir hash oluşturarak aynı verinin mükerrer kaydını da önleyebiliriz
                    const subKey = hashTC(JSON.stringify(rowValues) + (resultData._title || ''));
                    uploadQueue[`data/${fileId}/${hashedKey}/${subKey}`] = resultData;
                    totalCount++;

                    // Limit batch size to avoid huge memory/payload (approx 500 records per batch)
                    if (totalCount % 500 === 0) {
                        setStatusMsg(`Veriler yükleniyor: ${totalCount} kayıt...`);
                        await update(ref(db), uploadQueue);
                        // Clear queue
                        Object.keys(uploadQueue).forEach(key => delete uploadQueue[key]);
                    }
                }
            }

            // Final batch
            if (Object.keys(uploadQueue).length > 0) {
                setStatusMsg(`Son veriler yükleniyor...`);
                await update(ref(db), uploadQueue);
            }

            // 3. Destek Türünü Kaydet
            await set(ref(db, `support_types/${fileId}`), {
                id: fileId,
                label: supportLabel,
                cols: finalCols,
                updatedAt: new Date().toISOString(),
                isVisible: true,
                order: existingSupports.length // En sona ekle
            });

            setRefreshTrigger(prev => prev + 1);

            setStatusMsg(`Tamamlandı: ${totalCount} kayıt Firebase'e yüklendi.`);
            alert(`İşlem başarıyla tamamlandı. ${totalCount} kayıt yüklendi.`);
        } catch (err: any) {
            console.error(err);
            setStatusMsg('Hata: ' + err.message);
            alert('Hata oluştu: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
                    <h2 className="text-2xl font-bold text-center text-red-700 mb-6 font-mono tracking-tighter uppercase italic">ADMiN GiRiŞi</h2>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="email" placeholder="E-posta" value={email} onChange={e => setEmail(e.target.value)} className="w-full border p-3 rounded" required />
                        <input type="password" placeholder="Şifre" value={password} onChange={e => setPassword(e.target.value)} className="w-full border p-3 rounded" required />
                        <button type="submit" className="w-full bg-red-600 text-white p-3 rounded font-bold hover:bg-red-700">GİRİŞ YAP</button>
                    </form>
                    {loginError && <p className="text-red-600 text-sm mt-4 text-center">{loginError}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4 flex flex-col items-center">
            <div className="max-w-4xl w-full bg-white rounded-xl shadow-xl p-8 space-y-8">
                <div className="flex justify-between items-center border-b pb-4">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-red-700">●</span> Admin Veri Dönüştürücü
                    </h1>
                    <button onClick={handleLogout} className="text-sm bg-gray-100 px-4 py-2 rounded hover:bg-gray-200 text-gray-600 font-bold">ÇIKIŞ YAP</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-gray-700">1. Dosya Kimliği (Slug)</label>
                        <input type="text" value={fileId} onChange={e => setFileId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="sut_destegi_2025" className="w-full border p-3 rounded bg-gray-50 focus:ring-2 focus:ring-blue-500" />
                        <p className="text-[10px] text-gray-400 italic">* Veritabanı tablo adı olacaktır (Boşluksuz, küçük harf).</p>
                    </div>
                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-gray-700">2. Destek Görünen Adı</label>
                        <input type="text" value={supportLabel} onChange={e => setSupportLabel(e.target.value)} placeholder="2025 Süt Desteği" className="w-full border p-3 rounded bg-gray-50 focus:ring-2 focus:ring-blue-500" />
                        <p className="text-[10px] text-gray-400 italic">* Kullanıcının listede göreceği isim.</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <label className="block text-sm font-bold text-gray-700">3. Excel Dosyaları</label>
                        <input type="file" multiple accept=".xlsx, .xls" onChange={handleFileChange} className="w-full border p-2.5 rounded bg-gray-50 text-sm" />
                    </div>
                    <div className="w-24 space-y-2">
                        <label className="block text-sm font-bold text-gray-700">Başlık No</label>
                        <input type="number" value={headerRowNo} onChange={e => setHeaderRowNo(parseInt(e.target.value) || 1)} className="w-full border p-2.5 rounded text-center" min="1" />
                    </div>
                    <button onClick={inspectFile} className="bg-blue-600 text-white px-6 py-3 rounded font-bold hover:bg-blue-700 shadow-md">SÜTUNLARI LİSTELE</button>
                </div>

                <div className="flex items-center gap-4 py-2 px-4 bg-yellow-50 rounded border border-yellow-100">
                    <label className="flex items-center text-sm text-yellow-800 cursor-pointer">
                        <input type="checkbox" checked={useDoubleHeader} onChange={e => setUseDoubleHeader(e.target.checked)} className="mr-2" />
                        İki Satırlı Başlık Kullan (Üst satır ile birleştir)
                    </label>
                </div>

                {detectedHeaders.length > 0 && (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6">
                        <h3 className="font-bold text-blue-800 mb-2">Sütun Ayarları</h3>
                        <p className="text-sm text-blue-700 mb-4">Lütfen T.C. ve varsa VKN sütununu seçin. (Bu veri gizlilik gereği veritabanına sadece anahtar olarak kaydedilir, ham hali saklanmaz).</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-1">
                                <div className="font-bold border-b pb-1 mb-2">Seçenekler Rehberi</div>
                                <div className="flex gap-2"><b>TC / VKN</b> <span>= Sorgulama Anahtarı (Gizli tutulur)</span></div>
                                <div className="flex gap-2"><b>Para Birimi (₺)</b> <span>= Sayısal değerleri para birimi formatına çevirir</span></div>
                            </div>
                            <div className="space-y-1 md:mt-6">
                                <div className="flex gap-2"><b>Maskele (Ad Soyad)</b> <span>= İsimleri maskeler (örn: AL** VE**)</span></div>
                                <div className="flex gap-2"><b>Yoksay (Sil)</b> <span>= Bu sütun veritabanına eklenmez</span></div>
                                <div className="flex gap-2"><b>Başlık Yap (İşletme No)</b> <span>= Kart başlığı olarak kullanılır</span></div>
                            </div>
                        </div>
                    </div>
                )}

                {detectedHeaders.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 max-h-[400px] overflow-y-auto p-2 bg-gray-50 rounded border">
                        {detectedHeaders.map((header, idx) => {
                            const colLetter = XLSX.utils.encode_col(idx);
                            const isTc = tcColLetter === colLetter;
                            const isVkn = vknColLetter === colLetter;
                            const previewVal = previewRow[idx];
                            return (
                                <div key={idx} className={`p-3 rounded border bg-white ${isTc ? 'border-red-500 bg-red-50' : isVkn ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-mono bg-gray-100 px-1 rounded text-gray-500">{colLetter}</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => setTcColLetter(isTc ? '' : colLetter)} className={`text-[9px] px-1.5 py-0.5 rounded border transition ${isTc ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>TC</button>
                                            <button onClick={() => setVknColLetter(isVkn ? '' : colLetter)} className={`text-[9px] px-1.5 py-0.5 rounded border transition ${isVkn ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>VKN</button>
                                        </div>
                                    </div>
                                    <div className="text-xs font-bold truncate mb-0.5" title={header}>{header}</div>
                                    <div className="text-[10px] text-gray-400 italic mb-2 truncate" title={String(previewVal || '')}>
                                        Örn: {previewVal !== null && previewVal !== undefined ? String(previewVal) : '-'}
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                        <label className="flex items-center text-[10px] cursor-pointer"><input type="checkbox" checked={currencyCols.has(idx)} onChange={() => { const s = new Set(currencyCols); s.has(idx) ? s.delete(idx) : s.add(idx); setCurrencyCols(s); }} className="mr-1" /> Para</label>
                                        <label className="flex items-center text-[10px] cursor-pointer"><input type="checkbox" checked={maskedCols.has(idx)} onChange={() => { const s = new Set(maskedCols); s.has(idx) ? s.delete(idx) : s.add(idx); setMaskedCols(s); }} className="mr-1" /> Maske</label>
                                        <label className="flex items-center text-[10px] cursor-pointer text-red-600"><input type="checkbox" checked={ignoredCols.has(idx)} onChange={() => { const s = new Set(ignoredCols); s.has(idx) ? s.delete(idx) : s.add(idx); setIgnoredCols(s); }} className="mr-1" /> Sil</label>
                                        <label className="flex items-center text-[10px] cursor-pointer text-orange-600"><input type="checkbox" checked={titleCol === idx} onChange={() => setTitleCol(titleCol === idx ? null : idx)} className="mr-1" /> Başlık</label>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <button onClick={processAndUpload} disabled={processing || files.length === 0 || (!tcColLetter && !vknColLetter)} className="w-full bg-green-600 text-white py-4 rounded font-bold text-lg hover:bg-green-700 disabled:opacity-50 shadow-lg">
                    {processing ? 'İŞLENİYOR VE YÜKLENİYOR...' : 'VERİLERİ FIREBASE\'E YÜKLE'}
                </button>

                {statusMsg && (
                    <div className={`p-4 text-center rounded font-bold ${statusMsg.includes('Hata') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {statusMsg}
                    </div>
                )}

                {/* Destek Yönetimi Bölümü */}
                <div className="mt-12 pt-8 border-t space-y-6">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-blue-700">⚙</span> Yüklü Destekleri Yönet
                    </h2>
                    <p className="text-sm text-gray-500 italic">Yüklediğiniz listelerin adını değiştirebilir veya sorgulama ekranında gözüküp gözükmeyeceğini ayarlayabilirsiniz.</p>
                    
                    <div className="space-y-4">
                        {existingSupports.length === 0 ? (
                            <p className="text-gray-400 text-sm text-center py-4 italic">Henüz yüklü destek bulunamadı.</p>
                        ) : (
                            <div className="space-y-2">
                                {existingSupports.map((sup) => (
                                    <SupportItem 
                                        key={sup.id} 
                                        sup={sup} 
                                        onUpdate={handleUpdateSupport} 
                                        onReorder={handleReorder}
                                        onDelete={handleDeleteSupport}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SupportItem = ({ sup, onUpdate, onReorder, onDelete }: { sup: any, onUpdate: any, onReorder: any, onDelete: any }) => {
    const [label, setLabel] = useState(sup.label);
    const [isVisible, setIsVisible] = useState(sup.isVisible !== false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', sup.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDraggingOver(true);
    };

    const handleDragLeave = () => {
        setIsDraggingOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId !== sup.id) {
            onReorder(draggedId, sup.id);
        }
    };

    return (
        <div 
            draggable 
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col md:flex-row items-center gap-4 p-4 bg-white border rounded-lg shadow-sm transition-all duration-200 cursor-move ${isDraggingOver ? 'border-blue-500 bg-blue-50 transform scale-[1.01]' : 'hover:border-gray-300'}`}
        >
            <div className="flex items-center gap-3 flex-1 w-full">
                <div className="text-gray-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                </div>
                <div className="flex flex-col min-w-0 flex-1 text-left">
                    <span className="text-[10px] font-mono text-gray-500 truncate">{sup.id}</span>
                    <input 
                        type="text" 
                        value={label} 
                        onChange={(e) => setLabel(e.target.value)} 
                        className="w-full border-b border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none py-1 font-medium text-gray-800 transition-colors"
                        placeholder="Görünen Ad"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                        type="checkbox" 
                        checked={isVisible} 
                        onChange={(e) => setIsVisible(e.target.checked)} 
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-gray-600">Görünür</span>
                </label>

                <div className="flex gap-2">
                    <button 
                        onClick={() => onUpdate(sup.id, label, isVisible)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md text-xs font-bold hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm active:transform active:scale-95"
                        disabled={label === sup.label && isVisible === (sup.isVisible !== false)}
                    >
                        KAYDET
                    </button>
                    <button 
                        onClick={() => onDelete(sup.id)}
                        className="bg-red-50 text-red-600 p-2 rounded-md hover:bg-red-600 hover:text-white transition-all shadow-sm active:transform active:scale-95"
                        title="Sil"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
