export type OCRBox = {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    lang?: string;
};

export type OCROptions = {
    language?: string;
};

export interface IOCRProvider {
    readonly ID: string;
    readonly Label: string;
    Recognize(blob: Blob, options?: OCROptions): Promise<OCRBox[]>;
    Test(): Promise<boolean>;
}
