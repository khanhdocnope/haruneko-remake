import { Observable, type IObservable } from '../../Observable';
import type { IAppWindow } from '../AppWindow';

export default class implements IAppWindow {

    constructor(private readonly _splashURL: string) {}

    public async ShowSplash(): Promise<void> {
        const el = document.querySelector<HTMLElement>('#hakuneko-notice');
        if (el) el.style.display = '';
    }

    public async HideSplash(): Promise<void> {
        const el = document.querySelector<HTMLElement>('#hakuneko-notice');
        if (el) el.style.display = 'none';
        const app = document.querySelector<HTMLElement>('#app');
        if (app) app.style.visibility = 'visible';
    }

    public get HasControls(): boolean {
        return false;
    }

    readonly #maximized = new Observable<boolean, IAppWindow>(false, this);
    public get Maximized(): IObservable<boolean, IAppWindow> {
        return this.#maximized;
    }

    public Minimize(): void { /* browser - no-op */ }
    public Maximize(): void { /* browser - no-op */ }
    public Restore(): void { /* browser - no-op */ }
    public Close(): void { window.close(); }
}
