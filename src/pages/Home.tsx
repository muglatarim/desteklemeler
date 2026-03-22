import React, { useState, useEffect } from 'react';
import { hashTC } from '../utils/crypto';
import { db } from '../firebase';
import { ref, get, onValue } from 'firebase/database';

interface SupportType {
    id: string;
    label: string;
    cols: string[];
    isVisible?: boolean;
    order?: number;
}

export const Home: React.FC = () => {
    const [supportTypes, setSupportTypes] = useState<SupportType[]>([]);
    const [dataId, setDataId] = useState('');
    const [tc, setTc] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const typesRef = ref(db, "support_types");
        const unsubscribe = onValue(typesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const types = Object.keys(data)
                    .map(key => ({ ...data[key], id: key } as SupportType))
                    .filter(t => t.isVisible !== false)
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                setSupportTypes(types);
            } else {
                setSupportTypes([]);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        setResults([]);
        setError('');
    }, [dataId]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setResults([]);

        try {
            if (!dataId || !tc) {
                throw new Error('Lütfen tüm alanları doldurunuz.');
            }

            if (tc.length !== 11 && tc.length !== 10) {
                throw new Error('T.C. (11) veya Vergi No (10) giriniz.');
            }

            const hashedTc = hashTC(tc);
            const selectedSupport = supportTypes.find(t => t.id === dataId);

            if (!selectedSupport) throw new Error('Seçili destek türü bulunamadı.');

            let rawData = null;

            // Realtime Database üzerinden doğrudan oku
            const dataRef = ref(db, `data/${dataId}/${hashedTc}`);
            const snapshot = await get(dataRef);

            if (snapshot.exists()) {
                rawData = snapshot.val();
            }

            if (rawData) {
                const cols = selectedSupport.cols;
                const processedResults: any[] = [];

                // 1. Çoklu kayıt yapısı (Alt anahtarlar var mı?)
                if (typeof rawData === 'object' && !rawData.v) {
                    Object.values(rawData).forEach((item: any) => {
                        if (item.v) {
                            const obj: any = {};
                            cols.forEach((col, idx) => {
                                if (item.v[idx] !== undefined) obj[col] = item.v[idx];
                            });
                            if (item._title) obj['_title'] = item._title;
                            processedResults.push(obj);
                        }
                    });
                } 
                // 2. Tekil (eski) kayıt yapısı
                else if (rawData.v) {
                    const obj: any = {};
                    cols.forEach((col, idx) => {
                        if (rawData.v[idx] !== undefined) obj[col] = rawData.v[idx];
                    });
                    if (rawData._title) obj['_title'] = rawData._title;
                    processedResults.push(obj);
                }

                if (processedResults.length > 0) {
                    setResults(processedResults);
                } else {
                    setError('Kayıt içeriği okunamadı.');
                }
            } else {
                setError('Kayıt bulunamadı. Lütfen bilgileri kontrol ediniz.');
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10 px-4">
            <div className="max-w-3xl w-full bg-white rounded-lg shadow-xl overflow-hidden">
                <header className="bg-red-700 text-white p-4 relative flex items-center justify-center min-h-[120px]">
                    <div className="absolute left-6 hidden md:block">
                        <img
                            src="https://upload.wikimedia.org/wikipedia/commons/6/6d/Tar%C4%B1m_ve_Orman_Bakanl%C4%B1%C4%9F%C4%B1_logo.svg"
                            alt="Logo"
                            className="h-24 w-auto brightness-0 invert"
                        />
                    </div>

                    <div className="md:hidden mb-4">
                        <img
                            src="https://upload.wikimedia.org/wikipedia/commons/6/6d/Tar%C4%B1m_ve_Orman_Bakanl%C4%B1%C4%9F%C4%B1_logo.svg"
                            alt="Logo"
                            className="h-20 w-auto brightness-0 invert mx-auto"
                        />
                    </div>

                    <div className="text-center z-10 px-4 md:px-0">
                        <h1 className="text-xl md:text-2xl font-bold uppercase leading-tight tracking-wide">
                            T.C. MUĞLA VALİLİĞİ<br />
                            İL TARIM VE ORMAN MÜDÜRLÜĞÜ
                        </h1>
                        <h2 className="text-sm md:text-lg mt-2 font-medium text-red-100">Çiftçi Destekleme Sorgulama Sistemi</h2>
                    </div>
                </header>

                <div className="p-8">
                    <form onSubmit={handleSearch} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Destekleme Türü</label>
                            <select
                                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 p-2 border"
                                value={dataId}
                                onChange={(e) => setDataId(e.target.value)}
                            >
                                <option value="">Seçiniz</option>
                                {supportTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">T.C. Kimlik / Vergi Numarası</label>
                            <input
                                type="password"
                                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 p-2 border"
                                placeholder="T.C. (11) veya Vergi No (10)"
                                maxLength={11}
                                value={tc}
                                onChange={(e) => setTc(e.target.value.replace(/\D/g, ''))}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                * Kişisel verilerinizin güvenliği için T.C. Kimlik Numaranız şifrelenerek sorgulanmaktadır.
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                * Bu sistem bilgilendirme amaçlıdır. Lütfen kesin sonuçlar için askı listelerini kontrol ediniz.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || supportTypes.length === 0}
                            className="w-full bg-red-600 text-white font-bold py-3 rounded hover:bg-red-700 transition duration-200 disabled:opacity-50"
                        >
                            {loading ? 'Sorgulanıyor...' : 'Sorgula'}
                        </button>
                    </form>

                    {error && (
                        <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                            <p>{error}</p>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="mt-8 animate-fade-in space-y-8">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">
                                {supportTypes.find(t => t.id === dataId)?.label || 'Sorgulama Sonucu'}
                            </h3>

                            {results.map((result, idx) => (
                                <div key={idx} className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
                                    {result['_title'] && (
                                        <div className="bg-gray-50 px-4 py-2 border-b text-red-800 font-bold text-sm">
                                            {result['_title']}
                                        </div>
                                    )}
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {Object.entries(result).map(([key, value]) => {
                                                    if (
                                                        key === '_title' ||
                                                        key.trim() === '' ||
                                                        value === null ||
                                                        value === undefined ||
                                                        String(value).trim() === ''
                                                    ) return null;

                                                    return (
                                                        <tr key={key}>
                                                            <td className="px-4 py-2 font-medium text-gray-900 bg-gray-50 capitalize w-1/3 border-r">{key}</td>
                                                            <td className="px-4 py-2 text-gray-700">{String(value)}</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <footer className="bg-gray-800 text-gray-400 py-4 text-center text-xs">
                    <p>&copy; {new Date().getFullYear()} Muğla İl Tarım ve Orman Müdürlüğü</p>
                </footer>
            </div>
        </div>
    );
};
