import type { IBloatGuard } from '../BloatGuard';

export default class BloatGuardBrowser implements IBloatGuard {
    public async Initialize(): Promise<void> { /* no-op for browser */ }
}
