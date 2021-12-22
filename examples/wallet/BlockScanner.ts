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
    receive: (event: BlockScanReceiveEvent) => void;
    spend: (event: BlockScanSpendEvent) => void;
    start: () => void;
    block: (height: number) => void;
    complete: () => void;
};

/**
 * Defines the interface for a BlockScanner and overrides the
 * EventEmitter methods to enable type inference
 */
export interface IBlockScanner {
    scan(startHeight: number, endHeight: number): Promise<void>;
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
    private _lastBlock: number;

    public get state() {
        return this._state;
    }

    protected get lastBlock() {
        return this._lastBlock;
    }

    protected set lastBlock(height: number) {
        this._lastBlock = height;
        this.emit("block", height);
    }

    public async scan(startHeight: number, endHeight: number): Promise<void> {
        this._lastBlock = startHeight;
        do {
            this._state = BlockScannerState.Scanning;
            this.emit("start");
            console.log("starting");

            await this._scanRange(this.lastBlock, endHeight);
        } while (this.state === BlockScannerState.Canceled);

        this._state = BlockScannerState.Complete;
        this.emit("complete");
    }

    public cancel() {
        this._state = BlockScannerState.Canceled;
    }

    protected abstract _scanRange(startHeight: number, endHeight: number): Promise<void>;
}
