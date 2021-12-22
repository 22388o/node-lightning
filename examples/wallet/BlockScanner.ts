import { EventEmitter } from "events";

/**
 * Emits a receive event
 */
export type BlockScanReceiveEvent = {
    address: string;
    outpoint: string;
};

/**
 * Emits a spend event
 */
export type BlockScanSpendEvent = {
    outpoint: string;
    inpoint: string;
};

/**
 * Defines the state a BlockScanner can be in.
 */
export enum BlockScannerState {
    Pending,
    Scanning,
    Canceled,
    Complete,
}

/**
 * Defines the types used by IBlockScanner
 */
export type BlockScannerEvent = {
    receive: (event: BlockScanReceiveEvent) => boolean;
    spend: (event: BlockScanSpendEvent) => boolean;
    start: () => void;
    block: (height: number) => void;
    complete: () => void;
};

/**
 * Defines the interface for a BlockScanner and overrides the
 * EventEmitter methods to enable type inference
 */
export interface IBlockScanner {
    scan(startHeight: number, endHeight: number): Promise<number>;
    cancel(): void;

    on<U extends keyof BlockScannerEvent>(event: U, listener: BlockScannerEvent[U]): this;
    off<U extends keyof BlockScannerEvent>(event: U, listener: BlockScannerEvent[U]): this;
    emit<U extends keyof BlockScannerEvent>(
        event: U,
        ...args: Parameters<BlockScannerEvent[U]>
    ): boolean;
}

/**
 * Abstract implementation of an IBlockScanner that implements a basic
 * state machine to allow starting/stopping scanning.
 */
export abstract class BlockScanner extends EventEmitter implements IBlockScanner {
    private _state: BlockScannerState = BlockScannerState.Pending;

    public get state() {
        return this._state;
    }

    public async scan(startHeight: number, endHeight: number): Promise<number> {
        this._state = BlockScannerState.Scanning;
        this.emit("start");

        const result = await this._scanRange(startHeight, endHeight);
        console.log("scan result", result);

        this._state = BlockScannerState.Complete;
        this.emit("complete");

        return result;
    }

    public cancel() {
        this._state = BlockScannerState.Canceled;
    }

    protected abstract _scanRange(startHeight: number, endHeight: number): Promise<number>;
}
