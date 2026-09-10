import type { IRemoteProcedureCallManager } from '../RemoteProcedureCallManager';

export default class RemoteProcedureCallManagerBrowser implements IRemoteProcedureCallManager {
    public async Stop(): Promise<void> {}
    public async Restart(_port: number, _secret: string): Promise<void> {}
}
