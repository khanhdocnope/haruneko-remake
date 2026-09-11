import type { IRemoteBrowserWindow } from '../RemoteBrowserWindow';
import { Observable } from '../../Observable';

export default class RemoteBrowserWindowBrowser implements IRemoteBrowserWindow {

    private readonly domReady = new Observable<void, IRemoteBrowserWindow>(undefined, this);
    public get DOMReady() { return this.domReady; }

    private readonly beforeNavigate = new Observable<URL, IRemoteBrowserWindow>(undefined, this);
    public get BeforeWindowNavigate() { return this.beforeNavigate; }

    private readonly beforeFrame = new Observable<URL, IRemoteBrowserWindow>(undefined, this);
    public get BeforeFrameNavigate() { return this.beforeFrame; }

    public async Open(request: Request, _show: boolean, _preload: string): Promise<void> {
        throw new Error(`Bản web không mở được cửa sổ ẩn cho ${new URL(request.url).hostname}. Site này cần render JS — hãy dùng bản .exe offline để đọc.`);
    }
    public async Close(): Promise<void> {}
    public async Show(): Promise<void> {}
    public async Hide(): Promise<void> {}
    public async ExecuteScript<T>(_script: string): Promise<T> { throw new Error('Not supported in browser'); }
    public async SendDebugCommand<T>(_method: string, _params?: JSONObject): Promise<T> { throw new Error('Not supported in browser'); }
}
