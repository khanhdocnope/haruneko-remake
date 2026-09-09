/**
 * Service Worker with versioned cache, precache manifest and
 * strategy-based routing (Workbox-like without external dependency).
 * BuildID is injected via Vite define or fallback to hostname.
 */
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// BuildID injected at build time via Vite; fallback to hostname for dev
declare const BUILD_ID: string | undefined;
const sw = self as unknown as ServiceWorkerGlobalScope;
const buildID: string = typeof BUILD_ID !== 'undefined' ? BUILD_ID : sw.location.hostname;
const CACHE_VERSION = `hakuneko-${buildID}`;
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Filled by Vite at build time (injectManifest). In dev it is empty.
const precacheManifest: Array<{ url: string; revision: string | null }> = (self as unknown as { __WB_MANIFEST?: typeof precacheManifest }).__WB_MANIFEST ?? [];

let precacheCache: Cache | undefined;
let runtimeCache: Cache | undefined;
let imageCache: Cache | undefined;

async function GetPrecache(): Promise<Cache> {
    precacheCache ??= await caches.open(PRECACHE);
    return precacheCache;
}

async function GetRuntime(): Promise<Cache> {
    runtimeCache ??= await caches.open(RUNTIME);
    return runtimeCache;
}

async function GetImageCache(): Promise<Cache> {
    imageCache ??= await caches.open(IMAGE_CACHE);
    return imageCache;
}

async function CleanOldCaches(): Promise<void> {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== PRECACHE && k !== RUNTIME && k !== IMAGE_CACHE).map(k => caches.delete(k)));
}

async function Precache(): Promise<void> {
    if (precacheManifest.length === 0) return;
    const cache = await GetPrecache();
    const requests = precacheManifest.map(e => new Request(e.url, { cache: 'reload' }));
    // AddAll with cache-bust; ignore failures individually
    await Promise.allSettled(requests.map(async req => {
        try {
            const res = await fetch(req);
            if (res.ok) await cache.put(req, res);
        } catch { /* ignore */ }
    }));
}

async function PutSafe(cache: Cache, request: Request, response: Response): Promise<void> {
    try {
        if (response.ok) await cache.put(request, response.clone());
    } catch (e) {
        console.warn('[SW] put failed', request.url, e);
    }
}

// Strategies
async function CacheFirst(request: Request, cache: Cache): Promise<Response> {
    const hit = await cache.match(request);
    if (hit) return hit;
    try {
        const res = await fetch(request);
        PutSafe(cache, request, res);
        return res;
    } catch {
        return hit ?? new Response('Offline', { status: 503 });
    }
}

async function StaleWhileRevalidate(request: Request, cache: Cache): Promise<Response> {
    const hit = await cache.match(request);
    const fetchPromise = fetch(request).then(async res => {
        PutSafe(cache, request, res);
        return res;
    }).catch(() => undefined);
    return hit ?? await fetchPromise ?? new Response('Offline', { status: 503 });
}

async function NetworkFirst(request: Request, cache: Cache, timeoutMs = 3000): Promise<Response> {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(request, { signal: controller.signal });
        clearTimeout(t);
        PutSafe(cache, request, res);
        return res;
    } catch {
        const hit = await cache.match(request);
        return hit ?? new Response('Offline', { status: 503 });
    }
}

function IsSameOrigin(url: URL): boolean {
    return url.origin === sw.location.origin;
}

function IsAsset(url: URL): boolean {
    return /\.(js|css|woff2?|ttf|ico|webp|png|jpg|jpeg|svg)$/i.test(url.pathname);
}

function IsImage(url: URL): boolean {
    return /\.(webp|png|jpg|jpeg|gif|avif)$/i.test(url.pathname) || url.pathname.includes('/uploads.') || url.href.includes('uploads.mangadex.org');
}

function IsNavigation(request: Request): boolean {
    return request.mode === 'navigate' || (request.headers.get('accept') ?? '').includes('text/html');
}

async function HandleFetch(event: FetchEvent): Promise<Response> {
    const url = new URL(event.request.url);
    const req = event.request;

    // Only handle GET
    if (req.method !== 'GET') return fetch(req);

    // Navigation → NetworkFirst (precache fallback to index)
    if (IsNavigation(req) && IsSameOrigin(url)) {
        const cache = await GetPrecache();
        const network = await NetworkFirst(req, cache);
        if (network.status !== 503) return network;
        const fallback = await cache.match('/index.html') ?? await cache.match('/');
        return fallback ?? network;
    }

    // Images (manga pages, icons) → CacheFirst with image cache
    if (IsImage(url)) {
        return CacheFirst(req, await GetImageCache());
    }

    // Same-origin assets / chunks → StaleWhileRevalidate
    if (IsSameOrigin(url) && IsAsset(url)) {
        return StaleWhileRevalidate(req, await GetRuntime());
    }

    // Same-origin other → NetworkFirst
    if (IsSameOrigin(url)) {
        return NetworkFirst(req, await GetRuntime());
    }

    // Cross-origin: passthrough (let browser handle, do not cache opaque aggressively)
    return fetch(req);
}

function OnInstall(event: ExtendableEvent): void {
    event.waitUntil((async () => {
        await CleanOldCaches();
        await Precache();
        await (sw as unknown as { skipWaiting: () => Promise<void> }).skipWaiting();
    })());
}

function OnActivate(event: ExtendableEvent): void {
    event.waitUntil((async () => {
        await CleanOldCaches();
        await sw.clients.claim();
    })());
}

function OnFetch(event: FetchEvent): void {
    try {
        event.respondWith(HandleFetch(event));
    } catch (e) {
        console.warn('[SW] fetch handler error', e);
    }
}

function OnMessage(event: ExtendableMessageEvent): void {
    if (event.data?.type === 'SKIP_WAITING') {
        sw.skipWaiting();
    }
    if (event.data?.type === 'GET_VERSION') {
        (event.source as Client)?.postMessage?.({ type: 'VERSION', version: CACHE_VERSION });
    }
}

// Background Sync for deferred sync queue (Phase 2 SyncManager)
type SyncEvent = ExtendableEvent & { tag: string };
function OnSync(event: SyncEvent): void {
    if (event.tag === 'hakuneko-sync') {
        event.waitUntil((async () => {
            const clients = await sw.clients.matchAll();
            for (const c of clients) c.postMessage({ type: 'SYNC_REQUESTED' });
        })());
    }
}

sw.addEventListener('install', OnInstall);
sw.addEventListener('activate', OnActivate);
sw.addEventListener('fetch', OnFetch);
sw.addEventListener('message', OnMessage as EventListener);
sw.addEventListener('sync', OnSync as EventListener);

// Export for testing
export { CACHE_VERSION, PRECACHE, RUNTIME, IMAGE_CACHE };
