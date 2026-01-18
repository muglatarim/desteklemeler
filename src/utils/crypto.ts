import { SHA256, AES, enc } from 'crypto-js';

export const hashTC = (tc: string): string => {
    return SHA256(tc).toString();
};

export const encryptData = (data: any, parsedTc: string): string => {
    return AES.encrypt(JSON.stringify(data), parsedTc).toString();
};

export const decryptData = (ciphertext: string, parsedTc: string): any => {
    const bytes = AES.decrypt(ciphertext, parsedTc);
    return JSON.parse(bytes.toString(enc.Utf8));
};
