import { type ILocale, LocaleID, type VariantResource, VariantResourceKey, InvariantResourceKey } from './ILocale';
import type { Choice } from '../engine/SettingsManager';
import { Scope, Key } from '../engine/SettingsGlobal';
import { invariant } from './locales/_invariant';
import ar_SA from './locales/ar_SA';
import de_DE from './locales/de_DE';
import en_US from './locales/en_US';
import es_ES from './locales/es_ES';
import fil_PH from './locales/fil_PH';
import fr_FR from './locales/fr_FR';
import hi_IN from './locales/hi_IN';
import id_ID from './locales/id_ID';
import pt_PT from './locales/pt_PT';
import th_TH from './locales/th_TH';
import tr_TR from './locales/tr_TR';
import vi_VN from './locales/vi_VN';
import zh_CN from './locales/zh_CN';
import crowdinPseudoLanguage from './locales/zu_ZA';

/**
 * List of all available localizations in the application.
 * See: https://www.localeplanet.com/icu/
 */
const resources: Record<LocaleID, ILocale> = {
    Locale_arSA: CreateLocale(ar_SA),
    Locale_deDE: CreateLocale(de_DE),
    Locale_enUS: CreateLocale(en_US),
    Locale_esES: CreateLocale(es_ES),
    Locale_filPH: CreateLocale(fil_PH),
    Locale_frFR: CreateLocale(fr_FR),
    Locale_hiIN: CreateLocale(hi_IN),
    Locale_idID: CreateLocale(id_ID),
    Locale_ptPT: CreateLocale(pt_PT),
    Locale_thTH: CreateLocale(th_TH),
    Locale_trTR: CreateLocale(tr_TR),
    Locale_viVN: CreateLocale(vi_VN),
    Locale_zhCN: CreateLocale(zh_CN),
};

const crowdinPseudoResource = CreateLocale(crowdinPseudoLanguage);

function Format(this: string, ...params: string[]) {
    let text = this.toString();
    for(const index in params) {
        text = text.replaceAll(`{${index}}`, params[index]);
    }
    return text;
}

export function CreateLocale(resource: VariantResource): ILocale {
    const result = {};
    for(const key in InvariantResourceKey) {
        result[key] = Format.bind(invariant[key] ?? key);
    }
    for(const key in VariantResourceKey) {
        result[key] = Format.bind(resource[key] ?? key);
    }
    return result as ILocale;
}

/**
 * Search the localized resource for the given language code.
 * If no language code is given, it is determined from the global settings.
 */
function DetectDefaultLocale(): LocaleID {
    try {
        const nav = (navigator.language ?? '').toLowerCase();
        if (nav === 'vi' || nav.startsWith('vi-')) return LocaleID.Locale_viVN;
        if (nav === 'ja' || nav.startsWith('ja-')) return LocaleID.Locale_enUS;
        if (nav === 'de' || nav.startsWith('de-')) return LocaleID.Locale_deDE;
        if (nav === 'fr' || nav.startsWith('fr-')) return LocaleID.Locale_frFR;
        if (nav === 'ar' || nav.startsWith('ar-')) return LocaleID.Locale_arSA;
        if (nav === 'es' || nav.startsWith('es-')) return LocaleID.Locale_esES;
        if (nav === 'th' || nav.startsWith('th-')) return LocaleID.Locale_thTH;
        if (nav === 'tr' || nav.startsWith('tr-')) return LocaleID.Locale_trTR;
        if (nav === 'zh' || nav.startsWith('zh-')) return LocaleID.Locale_zhCN;
    } catch { /* ignore */ }
    return LocaleID.Locale_enUS;
}

export function GetLocale(code?: LocaleID): ILocale {
    if(code) {
        return resources[code] ?? resources[DetectDefaultLocale()];
    }
    if(HakuNeko?.FeatureFlags?.CrowdinTranslationMode?.Value) {
        return crowdinPseudoResource;
    }
    try {
        const stored = HakuNeko?.SettingsManager?.OpenScope(Scope)?.Get<Choice>(Key.Language)?.Value as LocaleID;
        if (stored && resources[stored]) return resources[stored];
    } catch { /* fallback to detection */ }
    return resources[DetectDefaultLocale()];
}