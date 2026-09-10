import type { IAITranslationProvider, TranslateOptions } from './AITranslationProvider';

export class GoogleProvider implements IAITranslationProvider {

    public readonly ID = 'google' as const;
    public readonly Label = 'Google';

    public async Test(): Promise<boolean> {
        return true;
    }

    public async Translate(text: string, options: TranslateOptions): Promise<string> {
        const target = options.targetLang.toLowerCase().split('-')[0];
        // Use POST to avoid URL length limit (~2k)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `q=${encodeURIComponent(text)}`,
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`Google translate failed: ${res.status}`);
        const data = await res.json() as unknown[];
        const arr = data[0] as unknown[][] | undefined;
        if (!arr || !Array.isArray(arr[0])) return text;
        return (arr[0]?.[0] as string) ?? text;
    }
}
