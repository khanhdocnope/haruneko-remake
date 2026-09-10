import type { IVisionProvider } from './IVisionProvider';
import type { OCRBox } from './IOCRProvider';

export type GoogleVisionConfig = {
    apiKey?: string;
};

export class GoogleVisionProvider implements IVisionProvider {

    public readonly ID = 'google-vision';
    public readonly Label = 'Google Vision';

    constructor(private readonly _config: GoogleVisionConfig = {}) {}

    public async Test(): Promise<boolean> {
        return true;
    }

    public async RecognizeAndTranslate(blob: Blob, targetLang: string): Promise<OCRBox[]> {
        // Step 1: OCR via Google Vision (or free translate.googleapis if no key)
        // For free tier without key, we mock single box covering center with translated placeholder
        if (!this._config.apiKey) {
            return [{
                text: `[Dịch ${targetLang} cần API key]`,
                x: 300,
                y: 400,
                width: 400,
                height: 120,
                confidence: 0.5,
            }];
        }
        const base64 = await this.ToBase64Pure(blob);
        const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this._config.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { content: base64 },
                    features: [{ type: 'TEXT_DETECTION' }],
                    imageContext: { languageHints: ['ja', 'ko', 'zh', 'en'] },
                }],
            }),
        });
        if (!res.ok) throw new Error(`Google Vision failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { responses: { textAnnotations: { description: string; boundingPoly: { vertices: { x: number; y: number }[] } }[] }[] };
        const ann = data.responses[0]?.textAnnotations?.slice(1) ?? [];
        return ann.slice(0, 10).map(a => {
            const verts = a.boundingPoly.vertices;
            const xs = verts.map(v => v.x);
            const ys = verts.map(v => v.y);
            return {
                text: a.description,
                x: Math.min(...xs),
                y: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys),
                confidence: 0.8,
            };
        });
    }

    private async ToBase64Pure(blob: Blob): Promise<string> {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary);
    }
}
