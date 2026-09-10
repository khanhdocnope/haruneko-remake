import type { IRemoteProcedureCallContract } from '../RemoteProcedureCallContract';

export default class RemoteProcedureCallContractBrowser implements IRemoteProcedureCallContract {
    public async LoadMediaContainerFromURL(_url: string): Promise<void> { /* no-op browser */ }
}
