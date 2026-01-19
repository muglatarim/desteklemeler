// BU DOSYANIN KONUMU: src/config.ts
export interface SupportType {
    id: string;      // Unique filename ID (e.g., 'buzagi2025_1')
    label: string;   // Display name (e.g., '2025 Yılı 1. Dönem Buzağı')
}

// Data IDs must match the uploaded filename IDs (without .json)
export const SUPPORT_TYPES: SupportType[] = [
    { id: 'buzagi2025_1', label: '2025 Yılı Buzağı Desteklemesi (1.Dönem)' },
    { id: 'kuzuoglak2025_1', label: '2025 Yılı Kuzu ve Oğlak Desteği (1.Dönem)' },
];
