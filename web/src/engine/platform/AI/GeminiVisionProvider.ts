import type { IVisionProvider } from './IVisionProvider';
import type { OCRBox } from './IOCRProvider';

export type GeminiVisionConfig = {
    apiKey: string;
    model?: string;
};

export class GeminiVisionProvider implements IVisionProvider {

    public readonly ID = 'gemini-vision';
    public readonly Label = 'Gemini Vision';

    constructor(private readonly config: GeminiVisionConfig) {}

    private get Model(): string {
        return this.config.model || 'gemini-1.5-flash';
    }

    public async Test(): Promise<boolean> {
        if (!this.config.apiKey) return false;
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`);
            return res.ok;
        } catch {
            return false;
        }
    }

    public async RecognizeAndTranslate(blob: Blob, targetLang: string): Promise<OCRBox[]> {
        const base64 = await this.ToBase64Pure(blob);
        const prompt = `Detect text bubbles in this manga image. Return JSON array [{"text":"original","translated":"vi translation","x":0,"y":0,"width":100,"height":50}] with 0-1000 relative coordinates. Keep proper nouns unchanged. Target: ${targetLang}. Only JSON.`;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.Model}:generateContent?key=${this.config.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: blob.type || 'image/jpeg', data: base64 } },
                    ],
                }],
            }),
        });
        if (!res.ok) throw new Error(`Gemini Vision failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
        const content = data.candidates[0]?.content?.parts[0]?.text ?? '[]';
        return this.ParseBoxes(content);
    }

    private async ToBase64Pure(blob: Blob): Promise<string> {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary);
    }

    private ParseBoxes(content: string): OCRBox[] {
        try {
            const json = content.match(/\[.*\]/s)?.[0] ?? '[]';
            const arr = JSON.parse(json) as { translated: string; text: string; x: number; y: number; width: number; height: number }[];
            return arr.map(e => ({
                text: e.translated || e.text,
                x: e.x,
                y: e.y,
                width: e.width,
                height: e.height,
                confidence: 0.9,
            }));
        } catch {
            return [];
        }
    }
}
