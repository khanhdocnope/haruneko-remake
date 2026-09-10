import type { IOCRProvider, OCRBox } from './IOCRProvider';

export class TesseractProvider implements IOCRProvider {

    public readonly ID = 'tesseract';
    public readonly Label = 'Tesseract';

    public async Test(): Promise<boolean> {
        return true;
    }

    public async Recognize(blob: Blob, _options?: { language?: string }): Promise<OCRBox[]> {
        // Lazy import to avoid bundling when not installed; fallback if missing
        let createWorker: (langs: string, oem?: number) => Promise<{ recognize: (blob: Blob) => Promise<{ data: { words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }[] } }>; terminate: () => Promise<void> }>;
        try {
            const spec = 'tesseract' + '.js';
            const mod = await import(/* @vite-ignore */ spec as string);
            createWorker = (mod as unknown as { createWorker: typeof createWorker }).createWorker;
        } catch {
            throw new Error('Tesseract.js chưa cài (npm i tesseract.js) — chọn Vision provider khác');
        }
        const worker = await createWorker('eng+vie+jpn+kor+chi_sim');
        try {
            const { data } = await worker.recognize(blob);
            const boxes: OCRBox[] = (data as { words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }[] }).words
                .filter(w => w.text.trim())
                .map(w => ({
                    text: w.text,
                    x: w.bbox.x0,
                    y: w.bbox.y0,
                    width: w.bbox.x1 - w.bbox.x0,
                    height: w.bbox.y1 - w.bbox.y0,
                    confidence: w.confidence / 100,
                }));
            return boxes;
        } finally {
            await worker.terminate();
        }
    }
}
