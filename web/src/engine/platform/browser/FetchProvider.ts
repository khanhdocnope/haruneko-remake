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
}
