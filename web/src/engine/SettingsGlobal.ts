import { type SettingsManager, Check, Numeric, Text, Secret, Choice, Directory } from './SettingsManager';
import { EngineResourceKey as R, LocaleID } from '../i18n/ILocale';
import type { IFrontendInfo } from '../frontend/IFrontend';
import { Info as InfoClassic } from '../frontend/classic/FrontendInfo';
import { MangaExportFormat } from './exporters/MangaExporterRegistry';

export const Scope = '*';

export const enum Key {
    Frontend = 'frontend',
    Language = 'language',
    MediaDirectory = 'media-directory',
    UseWebsiteSubDirectory = 'website-subdirectory',
    MangaExportFormat = 'manga-export-format',
    DescramblingFormat = 'descrambling-format',
    DescramblingQuality = 'descrambling-quality',
    UserAgent = 'UserAgent',
    CaptchaToken = 'captcha-token',
    PostCommand = 'post-command',
    CheckNewContent = 'check-new-content',
    CheckNewContentPeriod = 'check-new-content-period',
    NotifyNewContent = 'notify-new-content',
    RPCEnabled = 'RPCEnabled',
    RPCPort = 'RPCPort',
    RPCSecret = 'RPCSecret',
    SyncProvider = 'sync-provider',
    SyncToken = 'sync-token',
    SyncWebDAVUrl = 'sync-webdav-url',
    SyncWebDAVUser = 'sync-webdav-user',
    SyncWebDAVPass = 'sync-webdav-pass',
    SyncAuto = 'sync-auto',
    SyncInterval = 'sync-interval',
    SyncEncryption = 'sync-encryption',
    SyncPassphrase = 'sync-passphrase',
    AIProvider = 'ai-provider',
    AIModel = 'ai-model',
    AIKey = 'ai-key',
    AITargetLanguage = 'ai-target-language',
    AIAutoTranslate = 'ai-autotranslate',
    OCRProvider = 'ocr-provider',
    OCRLanguage = 'ocr-language',
    OCROverlay = 'ocr-overlay',
}

export async function Initialize(settingsManager: SettingsManager, frontends: IFrontendInfo[]): Promise<void> {
    const settings = settingsManager.OpenScope(Scope);
    await settings.Initialize(
        new Choice(
            Key.Frontend,
            R.Settings_Global_Frontend,
            R.Settings_Global_FrontendInfo,
            InfoClassic.ID,
            ...frontends.map(info => {
                return { key: info.ID, label: info.Label /* description: info.Description */ };
            })
        ),
        new Choice(
            Key.Language,
            R.Settings_Global_Language,
            R.Settings_Global_LanguageInfo,
            typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi') ? LocaleID.Locale_viVN : LocaleID.Locale_enUS,
            ...Object.entries(LocaleID).map(([key, label]) => {
                return { key, label };
            })
        ),
        new Directory(
            Key.MediaDirectory,
            R.Settings_Global_MediaDirectory,
            R.Settings_Global_MediaDirectoryInfo,
            null
        ),
        new Check(
            Key.UseWebsiteSubDirectory,
            R.Settings_Global_WebsiteSubDirectory,
            R.Settings_Global_WebsiteSubDirectoryInfo,
            false
        ),
        new Choice(
            Key.MangaExportFormat,
            R.Settings_Global_MangaExportFormat,
            R.Settings_Global_MangaExportFormatInfo,
            MangaExportFormat.RAWs,
            { key: MangaExportFormat.RAWs, label: R.Settings_Global_MangaExportFormat_FolderWithImages },
            { key: MangaExportFormat.CBZ, label: R.Settings_Global_MangaExportFormat_ComicBookArchive },
            { key: MangaExportFormat.EPUB, label: R.Settings_Global_MangaExportFormat_ElectronicPublication },
            { key: MangaExportFormat.PDF, label: R.Settings_Global_MangaExportFormat_PortableDocumentFormat },
        ),
        new Choice(
            Key.DescramblingFormat,
            R.Settings_Global_DescramblingFormat,
            R.Settings_Global_DescramblingFormatInfo,
            'image/png',
            { key: 'image/png', label: R.Settings_Global_Format_PNG },
            { key: 'image/jpeg', label: R.Settings_Global_Format_JPEG },
            { key: 'image/webp', label: R.Settings_Global_Format_WEBP },
        ),
        new Numeric(
            Key.DescramblingQuality,
            R.Settings_Global_DescramblingQuality,
            R.Settings_Global_DescramblingQualityInfo,
            95, 25, 100
        ),
        new Text(
            Key.UserAgent,
            R.Settings_Global_UserAgent,
            R.Settings_Global_UserAgentInfo,
            null
        ),
        new Secret(
            Key.CaptchaToken,
            R.Settings_Global_HCaptchaToken,
            R.Settings_Global_HCaptchaTokenInfo,
            ''
        ),
        new Text(
            Key.PostCommand,
            R.Settings_Global_PostCommand,
            R.Settings_Global_PostCommandInfo,
            ''
        ),
        new Check(
            Key.CheckNewContent,
            R.Settings_NewContent_Check,
            R.Settings_NewContent_CheckInfo,
            false
        ),
        new Check(
            Key.RPCEnabled,
            R.Settings_Global_RPCEnabled,
            R.Settings_Global_RPCEnabledInfo,
            false
        ),
        new Numeric(
            Key.RPCPort,
            R.Settings_Global_RPCPort,
            R.Settings_Global_RPCPortInfo,
            27544, 1024, 65535
        ),
        new Text(
            Key.RPCSecret,
            R.Settings_Global_RPCSecret,
            R.Settings_Global_RPCSecretInfo,
            'Connection#Secret'
        ),
        new Choice(
            Key.SyncProvider,
            R.Settings_Global_SyncProvider,
            R.Settings_Global_SyncProviderInfo,
            'none',
            { key: 'none', label: R.Settings_Global_SyncProvider_None },
            { key: 'gist', label: R.Settings_Global_SyncProvider_Gist },
            { key: 'webdav', label: R.Settings_Global_SyncProvider_WebDAV },
        ),
        new Secret(
            Key.SyncToken,
            R.Settings_Global_SyncToken,
            R.Settings_Global_SyncTokenInfo,
            ''
        ),
        new Text(
            Key.SyncWebDAVUrl,
            R.Settings_Global_SyncWebDAVUrl,
            R.Settings_Global_SyncWebDAVUrlInfo,
            ''
        ),
        new Text(
            Key.SyncWebDAVUser,
            R.Settings_Global_SyncWebDAVUser,
            R.Settings_Global_SyncWebDAVUserInfo,
            ''
        ),
        new Secret(
            Key.SyncWebDAVPass,
            R.Settings_Global_SyncWebDAVPass,
            R.Settings_Global_SyncWebDAVPassInfo,
            ''
        ),
        new Check(
            Key.SyncAuto,
            R.Settings_Global_SyncAuto,
            R.Settings_Global_SyncAutoInfo,
            true
        ),
        new Numeric(
            Key.SyncInterval,
            R.Settings_Global_SyncInterval,
            R.Settings_Global_SyncIntervalInfo,
            300, 60, 3600
        ),
        new Check(
            Key.SyncEncryption,
            R.Settings_Global_SyncEncryption,
            R.Settings_Global_SyncEncryptionInfo,
            false
        ),
        new Secret(
            Key.SyncPassphrase,
            R.Settings_Global_SyncPassphrase,
            R.Settings_Global_SyncPassphraseInfo,
            ''
        ),
        new Choice(
            Key.AIProvider,
            R.Settings_Global_AIProvider,
            R.Settings_Global_AIProviderInfo,
            'none',
            { key: 'none', label: R.Settings_Global_AIProvider_None },
            { key: 'openai', label: R.Settings_Global_AIProvider_OpenAI },
            { key: 'gemini', label: R.Settings_Global_AIProvider_Gemini },
            { key: 'deepl', label: R.Settings_Global_AIProvider_DeepL },
            { key: 'google', label: R.Settings_Global_AIProvider_Google },
        ),
        new Text(
            Key.AIModel,
            R.Settings_Global_AIModel,
            R.Settings_Global_AIModelInfo,
            'gpt-4o-mini'
        ),
        new Secret(
            Key.AIKey,
            R.Settings_Global_AIKey,
            R.Settings_Global_AIKeyInfo,
            ''
        ),
        new Choice(
            Key.AITargetLanguage,
            R.Settings_Global_AITargetLanguage,
            R.Settings_Global_AITargetLanguageInfo,
            'vi',
            { key: 'vi', label: R.Settings_Global_AITargetLanguage },
            { key: 'en', label: R.Settings_Global_AITargetLanguage },
        ),
        new Check(
            Key.AIAutoTranslate,
            R.Settings_Global_AIAutoTranslate,
            R.Settings_Global_AIAutoTranslateInfo,
            false
        ),
        new Choice(
            Key.OCRProvider,
            R.Settings_Global_OCRProvider,
            R.Settings_Global_OCRProviderInfo,
            'none',
            { key: 'none', label: R.Settings_Global_OCRProvider_None },
            { key: 'tesseract', label: R.Settings_Global_OCRProvider_Tesseract },
            { key: 'openai-vision', label: R.Settings_Global_OCRProvider_OpenAIVision },
            { key: 'gemini-vision', label: R.Settings_Global_OCRProvider_GeminiVision },
            { key: 'google-vision', label: R.Settings_Global_OCRProvider_GoogleVision },
        ),
        new Choice(
            Key.OCRLanguage,
            R.Settings_Global_OCRLanguage,
            R.Settings_Global_OCRLanguageInfo,
            'auto',
            { key: 'auto', label: R.Settings_Global_OCRLanguage },
            { key: 'ja', label: R.Settings_Global_OCRLanguage },
            { key: 'ko', label: R.Settings_Global_OCRLanguage },
            { key: 'zh', label: R.Settings_Global_OCRLanguage },
        ),
        new Choice(
            Key.OCROverlay,
            R.Settings_Global_OCROverlay,
            R.Settings_Global_OCROverlayInfo,
            'bubble',
            { key: 'bubble', label: R.Settings_Global_OCROverlay },
            { key: 'none', label: R.Settings_Global_OCROverlay },
        ),
    );
}