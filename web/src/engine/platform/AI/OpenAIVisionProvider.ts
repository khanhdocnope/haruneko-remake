import type { IVisionProvider } from './IVisionProvider';
import type { OCRBox } from './IOCRProvider';

export type OpenAIVisionConfig = {
    apiKey: string;
    model?: string;
};

export class OpenAIVisionProvider implements IVisionProvider {

    public readonly ID = 'openai-vision';
    public readonly Label = 'OpenAI Vision';

    constructor(private readonly config: OpenAIVisionConfig) {}

    private get Model(): string {
        return this.config.model || 'gpt-4o-mini';
    }

    public async Test(): Promise<boolean> {
        if (!this.config.apiKey) return false;
        try {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: { Authorization: `Bearer ${this.config.apiKey}` },
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    public async RecognizeAndTranslate(blob: Blob, targetLang: string): Promise<OCRBox[]> {
        const base64 = await this.ToBase64(blob);
        const prompt = `Detect all text bubbles in this manga image. For each bubble, return the original text and bounding box (x,y,width,height as 0-1000 relative coordinates) and Vietnamese translation. Keep proper nouns unchanged. Target language: ${targetLang}. Return ONLY JSON array: [{"text":"...","translated":"...","x":0,"y":0,"width":100,"height":50}]`;
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: this.Model,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: base64 } },
                    ],
                }],
                temperature: 0.2,
            }),
        });
        if (!res.ok) throw new Error(`OpenAI Vision failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { choices: { message: { content: string } }[] };
        return this.ParseBoxes(data.choices[0]?.message?.content ?? '[]');
    }

    private async ToBase64(blob: Blob): Promise<string> {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
    }

    private ParseBoxes(content: string): OCRBox[] {
        try {
            const json = content.match(/\[.*\]/s)?.[0] ?? '[]';
            const arr = JSON.parse(json) as { text: string; translated: string; x: number; y: number; width: number; height: number }[];
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
