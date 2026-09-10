import { Runtime } from './PlatformInfo';
import { PlatformInstanceActivator } from './PlatformInstanceActivator';
import NodeWebkitRemoteProcedureCallContract from './nw/RemoteProcedureCallContract';
import ElectronRemoteProcedureCallContract from './electron/RemoteProcedureCallContract';
import BrowserRemoteProcedureCallContract from './browser/RemoteProcedureCallContract';

export interface IRemoteProcedureCallContract {
    LoadMediaContainerFromURL(url: string): Promise<void>;
}

export function CreateRemoteProcedureCallContract(): IRemoteProcedureCallContract {
    return new PlatformInstanceActivator<IRemoteProcedureCallContract>()
        .Configure(Runtime.NodeWebkit, () => new NodeWebkitRemoteProcedureCallContract())
        .Configure(Runtime.Electron, () => new ElectronRemoteProcedureCallContract())
        .Configure(Runtime.Chrome, () => new BrowserRemoteProcedureCallContract())
        .Configure(Runtime.Gecko, () => new BrowserRemoteProcedureCallContract())
        .Configure(Runtime.WebKit, () => new BrowserRemoteProcedureCallContract())
        .Configure(Runtime.Unknown, () => new BrowserRemoteProcedureCallContract())
        .Create();
}