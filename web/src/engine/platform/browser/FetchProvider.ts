import { FetchProvider } from '../FetchProviderCommon';
import { FetchConcealedRequest } from '../FetchConcealedRequest';
import type { FeatureFlags } from '../../FeatureFlags';

export default class FetchProviderBrowser extends FetchProvider {

    #initialized = false;

    public Initialize(featureFlags: FeatureFlags): void {
        if (this.#initialized) return;
        this.#initialized = true;
        super.Initialize(featureFlags);
        if (globalThis.Request !== FetchConcealedRequest) {
            globalThis.Request = FetchConcealedRequest;
        }
    }

    public async Fetch(request: Request): Promise<Response> {
        return super.FetchConcealed(request, []);
    }

    /**
     * Browser fallback: no hidden window available, so try direct fetch +
     * evaluate the script against the parsed DOM. Works for static pages
     * (most MangaCSS list extractors). Throws immediately with a clear
     * message for JS-rendered sites instead of hanging until timeout.
     */
    public override async FetchWindowPreloadScript<T extends void | JSONElement>(request: Request, _preload: string, script: string, delay = 0, timeout = 15_000): Promise<T> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await this.Fetch(new Request(request.url, { headers: request.headers }));
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const base = doc.createElement('base');
            base.href = request.url;
            doc.head.prepend(base);
            if (delay > 0) await new Promise(resolve => setTimeout(resolve, Math.min(delay, 3000)));
            // Scripts are single expressions evaluated in page context (see Electron ExecuteScript).
            // Emulate with document/window bound to the parsed DOM.
            const fn = new Function('document', 'window', `"use strict"; return (${script});`);
            return fn(doc, { location: new URL(request.url) }) as T;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                const { Exception } = await import('../../Error');
                const { EngineResourceKey } = await import('../../../i18n/ILocale');
                throw new Exception(EngineResourceKey.FetchProvider_FetchWindow_TimeoutError);
            }
            throw new Error(`Bản web không đọc được site ${new URL(request.url).hostname} (cần render JS). Hãy dùng bản .exe offline. Chi tiết: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            clearTimeout(timer);
        }
    }
}
