export type AIProviderID = 'none' | 'openai' | 'gemini' | 'deepl' | 'google';

export type TranslateOptions = {
    targetLang: string;
    context?: string;
};

export interface IAITranslationProvider {
    readonly ID: AIProviderID;
    readonly Label: string;
    Translate(text: string, options: TranslateOptions): Promise<string>;
    Test(): Promise<boolean>;
}
