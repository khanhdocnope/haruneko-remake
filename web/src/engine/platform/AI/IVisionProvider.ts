import type { OCRBox } from './IOCRProvider';

export interface IVisionProvider {
    readonly ID: string;
    readonly Label: string;
    RecognizeAndTranslate(blob: Blob, targetLang: string): Promise<OCRBox[]>;
    Test(): Promise<boolean>;
}
