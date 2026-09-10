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

    public async RecognizeAndTranslate(blob: Blob, _targetLang: string): Promise<OCRBox[]> {
        if (!this._config.apiKey) {
            throw new Error('Google Vision cần API key trong Cài đặt');
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
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1] ?? '');
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }
}
