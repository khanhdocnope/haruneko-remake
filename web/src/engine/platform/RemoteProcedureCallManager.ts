import type { SettingsManager } from '../SettingsManager';
import { Runtime } from './PlatformInfo';
import { PlatformInstanceActivator } from './PlatformInstanceActivator';
import NodeWebkitRemoteProcedureCallManager from './nw/RemoteProcedureCallManager';
import ElectronRemoteProcedureCallManager from './electron/RemoteProcedureCallManager';
import BrowserRemoteProcedureCallManager from './browser/RemoteProcedureCallManager';

export interface IRemoteProcedureCallManager {
    Stop(): Promise<void>;
    Restart(port: number, secret: string): Promise<void>;
}

export function CreateRemoteProcedureCallManager(settingsManager: SettingsManager): IRemoteProcedureCallManager {
    return new PlatformInstanceActivator<IRemoteProcedureCallManager>()
        .Configure(Runtime.NodeWebkit, () => new NodeWebkitRemoteProcedureCallManager(settingsManager))
        .Configure(Runtime.Electron, () => new ElectronRemoteProcedureCallManager(settingsManager))
        .Configure(Runtime.Chrome, () => new BrowserRemoteProcedureCallManager())
        .Configure(Runtime.Gecko, () => new BrowserRemoteProcedureCallManager())
        .Configure(Runtime.WebKit, () => new BrowserRemoteProcedureCallManager())
        .Configure(Runtime.Unknown, () => new BrowserRemoteProcedureCallManager())
        .Create();
}