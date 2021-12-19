import { Mnemonic, HdPrivateKey, Network } from "@node-lightning/bitcoin";
import { BitcoindClient, BlockHeader, Transaction } from "@node-lightning/bitcoind";
import { EventEmitter } from "stream";

const bitcoind = new BitcoindClient({
    port: 18443,
    host: "127.0.0.1",
    rpcuser: "kek",
    rpcpassword: "kek",
});

/**
 * - create private keys
 * - derive public keys
 * - distriute public key
 * - monitor for outputs
 * - created unsigned txes
 * - sign txes
 * - broadcast txes
 * - rescan to find controlled addresses
 *      > depends on the implementation and access to indexes
 *      > this implementation can use an abstraction to control rescan
 *
 * - should use abstraction the provides parsed block / transaction
 *   objects for common methods
 */
class Wallet {
    public bip32Account: WalletAccount;
    public bip84Account: WalletAccount;

    protected allAddresses: Set<string> = new Set();

    constructor(readonly seed: Buffer, readonly network: Network, lastHeight: number) {
        const coinType = network.isMainnet ? "0'" : "1'";

        const bip32AccountKey = HdPrivateKey.fromPath(`m/44'/${coinType}/0'`, seed, network);
        this.bip32Account = new WalletAccount(bip32AccountKey);

        const bip84AccountKey = HdPrivateKey.fromPath(`m/84'/${coinType}/0'`, seed, network);
        this.bip84Account = new WalletAccount(bip84AccountKey);
    }

    public async recover(
        bitcoind: BitcoindClient,
        height: number = 1,
        addressWindow: number = 2000,
    ) {
        return await this.bip84Account.recover(bitcoind, height, addressWindow);
    }

    public async recover2(bitcoind: BitcoindClient) {
        const filter = new BitcoindBlockScanner();
        this.bip32Account.recover2(filter);
        this.bip84Account.recover2(filter);

        let bestHash = await bitcoind.getBestBlockHash();
        let bestHeader = await bitcoind.getHeader(bestHash);

        let startHeight = 1;
        let endHeight = bestHeader.height;

        let complete = false;
        filter.on("complete", () => (complete = true));

        while (!complete) {
            startHeight = await filter.scan(startHeight, endHeight);
            if (!startHeight) break;
        }
    }

    public onBlockConnected(header: BlockHeader, txs: Transaction[]) {
        this.bip32Account.onBlockConnected(header, txs);
        this.bip84Account.onBlockConnected(header, txs);
    }

    public onBlockDisconnected() {}

    public getP2pkhAddress(): string {
        return this.bip32Account.getAddress();
    }

    public getP2wpkhAddress(): string {
        return this.bip84Account.getAddress();
    }

    // public sendToAddress(amount: Number, address: string): Tx {
    //     // select outputs using coin selection algorithm
    // }
}

type Address = string;
type OutPoint = string;
type InPoint = string;

export type BlockScanReceiveEvent = {
    address: string;
    outpoint: string;
};

export type BlockScanSpendEvent = {
    outpoint: string;
    inpoint: string;
};

export type BlockScannerEvent = {
    receive: (event: BlockScanReceiveEvent) => boolean;
    spend: (event: BlockScanSpendEvent) => boolean;
    start: () => void;
    block: (height: number) => void;
    complete: () => void;
};

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

// export declare interface BlockScanner {
//     on<U extends keyof BlockScannerEvent>(event: U, listener: BlockScannerEvent[U]): this;
//     off<U extends keyof BlockScannerEvent>(event: U, listener: BlockScannerEvent[U]): this;
//     emit<U extends keyof BlockScannerEvent>(
//         event: U,
//         ...args: Parameters<BlockScannerEvent[U]>
//     ): boolean;
// }

export enum BlockScannerState {
    Pending,
    Scanning,
    Canceled,
    Complete,
}

export abstract class BlockScanner extends EventEmitter implements IBlockScanner {
    private _state: BlockScannerState = BlockScannerState.Pending;

    public get state() {
        return this._state;
    }

    public async scan(startHeight: number, endHeight: number): Promise<number> {
        this._state = BlockScannerState.Scanning;
        this.emit("start");

        const result = await this._scanRange(startHeight, endHeight);

        this._state = BlockScannerState.Complete;
        this.emit("complete");

        return result;
    }

    public cancel() {
        this._state = BlockScannerState.Canceled;
    }

    protected abstract _scanRange(startHeight: number, endHeight: number): Promise<number>;
}

export class BitcoindBlockScanner extends BlockScanner {
    public async _scanRange(startHeight: number, endHeight: number): Promise<number> {
        for (let height = startHeight; height <= endHeight; height++) {
            this.emit("block", height);
            const hash = await bitcoind.getBlockHash(height);
            const block = await bitcoind.getBlock(hash);
            const txs = block.tx;

            this._scanBlock(txs);
            if (this.state === BlockScannerState.Canceled) {
                return height;
            }
        }
    }

    protected _scanBlock(txs: Transaction[]): boolean {
        // start scanning all txs
        for (const tx of txs) {
            // look for spends in transaction inputs
            for (let n = 0; n < tx.vin.length; n++) {
                const vin = tx.vin[n];

                // ignore coinbase
                if (!vin.txid) continue;

                this.emit("spend", {
                    outpoint: `${vin.txid}:${vin.vout}`,
                    inpoint: `${tx.txid}:${n}`,
                });
            }

            // look for recieves in transaction outputs
            for (let n = 0; n < tx.vout.length; n++) {
                const vout = tx.vout[n];
                const outpoint = `${tx.txid}:${n}`;

                // if no addresses, skip
                if (!vout.scriptPubKey.addresses) continue;

                // iterate all addresses
                for (const address of vout.scriptPubKey.addresses) {
                    this.emit("receive", {
                        address,
                        outpoint,
                    });
                }
            }
        }

        return true;
    }
}

class WalletAccount {
    protected external: HdPrivateKey;
    protected internal: HdPrivateKey;
    protected nextExternal: number = 0;
    protected nextInternal: number = 0;
    protected height: number = 0;

    protected addressTxs: Map<Address, OutPoint[]> = new Map();
    protected watchedTxs: Map<OutPoint, InPoint> = new Map();
    protected scanAddress: Map<Address, number> = new Map();

    constructor(readonly account: HdPrivateKey) {
        this.external = account.derive(0);
        this.internal = account.derive(1);

        for (let i = 0; i < 200; i++) {
            this.scanAddress.set(this.external.derive(i).toAddress(), i);
            this.scanAddress.set(this.internal.derive(i).toAddress(), i);
        }
    }

    public getAddress(): string {
        const address = this.external.derive(this.nextExternal).toAddress();
        this.addressTxs.set(address, []);
        this.nextExternal++;
        return address;
    }

    public getChange(): string {
        const address = this.internal.derive(this.nextInternal).toAddress();
        this.addressTxs.set(address, []);
        this.nextInternal++;
        return address;
    }

    public async recover2(filter: IBlockScanner) {
        const key = this.account.derive(0);
        const foundAddresses: Map<Address, { index: number; tx: Set<string> }> = new Map();
        const scanAddresses: Map<Address, number> = new Map();
        const outpoints: Map<OutPoint, InPoint> = new Map();

        filter.on("start", () => {
            this._expandAddressWindow(key, foundAddresses, scanAddresses, 2000);
        });

        filter.on("receive", (e: BlockScanReceiveEvent) => {
            const { address, outpoint } = e;

            if (!scanAddresses.has(address)) return true;

            if (!foundAddresses.has(address)) {
                foundAddresses.set(address, {
                    index: scanAddresses.get(address),
                    tx: new Set(),
                });
            }

            // get the found address record
            const record = foundAddresses.get(address);

            // ignore if we previously processed this. This will
            // happen during a reprocessing of a block where we
            // need to expand the search parameters
            if (record.tx.has(outpoint)) return true;

            // add the outpoint to the address
            record.tx.add(outpoint);

            // add the outpoint as a watched outpoint
            outpoints.set(outpoint, null);

            return foundAddresses.size < scanAddresses.size;
        });

        filter.on("spend", (e: BlockScanSpendEvent) => {
            const { outpoint, inpoint } = e;

            // not currently watching this outpoint
            if (!outpoints.has(outpoint)) return true;

            // mark the watched outpoint as spent with this input
            outpoints.set(outpoint, inpoint);
        });

        filter.on("complete", () => {
            console.log(foundAddresses);
            console.log(outpoints);
        });
    }

    /**
     * Rescan algorithm
     * 1) expand address window to look for
     * 2) begin scanning at block height
     * 3) add found addresses + outpoints to wallet
     * 4) go back to step 1. incrementing block if window wasn't breached, otherwise rescan block
     */
    public async recover(
        bitcoind: BitcoindClient,
        height: number = 1,
        addressWindow: number = 2000,
    ) {
        const key = this.account.derive(0);
        const foundAddresses: Map<Address, { index: number; tx: Set<string> }> = new Map();
        const scanAddresses: Map<Address, number> = new Map();
        const outpoints: Map<OutPoint, InPoint> = new Map();

        while (height <= (await this._getBestHeight())) {
            this._expandAddressWindow(key, foundAddresses, scanAddresses, addressWindow);

            const hash = await bitcoind.getBlockHash(height);
            const block = await bitcoind.getBlock(hash);
            const txs = block.tx;

            this._recoverBlock(txs, outpoints, foundAddresses, scanAddresses);

            if (foundAddresses.size < scanAddresses.size) {
                height += 1;
            }
        }

        console.log(foundAddresses);
        console.log(outpoints);
    }

    protected async _getBestHeight(): Promise<number> {
        let bestHash = await bitcoind.getBestBlockHash();
        let bestHeader = await bitcoind.getHeader(bestHash);
        return bestHeader.height;
    }

    protected _expandAddressWindow(
        key: HdPrivateKey,
        foundAddresses: Map<Address, { index: number; tx: Set<string> }>,
        scanAddresses: Map<Address, number>,
        addressWindow: number,
    ) {
        if (scanAddresses.size >= foundAddresses.size + addressWindow) return;

        let maxIndex = -1;
        for (const index of scanAddresses.values()) {
            if (index > maxIndex) {
                maxIndex = index;
            }
        }

        const used = foundAddresses.size;
        const startIndex = maxIndex + 1;
        const endIndex = used + addressWindow;

        for (let i = startIndex; i < endIndex; i++) {
            const prvkey = key.derive(i);
            scanAddresses.set(prvkey.toAddress(), i);
        }

        console.log("added", endIndex - startIndex, "addresses to scan list");
    }

    protected _recoverBlock(
        txs: Transaction[],
        outpoints: Map<OutPoint, InPoint>,
        foundAddresses: Map<Address, { index: number; tx: Set<string> }>,
        scanAddresses: Map<Address, number>,
    ) {
        // start scanning all txs
        for (const tx of txs) {
            // look for spends in transaction inputs
            for (let n = 0; n < tx.vin.length; n++) {
                const vin = tx.vin[n];

                // ignore coinbase
                if (!vin.txid) continue;

                const outpoint = `${vin.txid}:${vin.vout}`;
                const inpoint = `${tx.txid}:${n}`;

                // not currently watching this outpoint
                if (!outpoints.has(outpoint)) continue;

                // mark the watched outpoint as spent with this input
                outpoints.set(outpoint, inpoint);

                console.log("spent", outpoint, "with", inpoint);
            }

            // look for recieves in transaction outputs
            for (let n = 0; n < tx.vout.length; n++) {
                const vout = tx.vout[n];
                const outpoint = `${tx.txid}:${n}`;

                // if no addresses, skip
                if (!vout.scriptPubKey.addresses) continue;

                // iterate all addresses
                for (const address of vout.scriptPubKey.addresses) {
                    // skip if we don't care about this one
                    if (!scanAddresses.has(address)) continue;

                    // first time seeing this address we construt a new
                    // found address record
                    if (!foundAddresses.has(address)) {
                        foundAddresses.set(address, {
                            index: scanAddresses.get(address),
                            tx: new Set(),
                        });
                    }

                    // get the found address record
                    const record = foundAddresses.get(address);

                    // ignore if we previously processed this. This will
                    // happen during a reprocessing of a block where we
                    // need to expand the search parameters
                    if (record.tx.has(outpoint)) continue;

                    // add the outpoint to the address
                    record.tx.add(outpoint);

                    // add the outpoint as a watched outpoint
                    outpoints.set(outpoint, null);

                    console.log("received payment", address, outpoint);
                }
            }
        }
    }

    public onBlockConnected(block: BlockHeader, txs: Transaction[]) {
        for (const tx of txs) {
            this._onTransactionConnected(tx);
        }
        this.height += block.height;
    }

    protected _onTransactionConnected(tx: Transaction) {
        // look for spends in transaction inputs!
        for (let n = 0; n < tx.vin.length; n++) {
            const vin = tx.vin[n];

            // ignore coinbase
            if (!vin.txid) continue;

            const outpoint = `${vin.txid}:${vin.vout}`;
            const inpoint = `${tx.txid}:${n}`;

            if (!this.watchedTxs.has(outpoint)) continue;

            // mark the watched outpoint as spent
            this.watchedTxs.set(outpoint, inpoint);

            console.log("spent", outpoint, "with", inpoint);
        }

        // look for recieves in transaction outputs
        for (let n = 0; n < tx.vout.length; n++) {
            const vout = tx.vout[n];
            const outpoint = `${tx.txid}:${n}`;
            if (!vout.scriptPubKey.addresses) continue;
            for (const address of vout.scriptPubKey.addresses) {
                if (!this.scanAddress.has(address)) continue;

                // see if this is the first time we found this address
                let txids = this.addressTxs.get(address);
                if (!txids) {
                    txids = [];
                    this.addressTxs.set(address, txids);
                }

                // add the outpoint to the address
                txids.push(outpoint);

                // add the outpoint as a watched outpoint
                this.watchedTxs.set(outpoint, null);

                console.log("received payment", address, outpoint);
            }
        }
    }

    public onBlockDisconnected(block: any) {}
}

const network = Network.regtest;
const seed = Mnemonic.phraseToSeed("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"); // prettier-ignore

const wallet = new Wallet(seed, network, 0);

// console.log(wallet.getP2wpkhAddress());
// console.log(wallet.getP2wpkhAddress());

// wallet.recover(bitcoind).catch(console.error);

wallet.recover2(bitcoind).catch(console.error);

// async function sync() {
//     let height = 0;
//     let cont = true;

//     while (cont) {
//         const hash = await bitcoind.getBlockHash(++height);
//         const block = await bitcoind.getBlock(hash);
//         cont = !!block.nextblockhash;
//         wallet.onBlockConnected(block as BlockHeader, block.tx);
//     }
// }
// sync().catch(console.error);

// const root = HdPrivateKey.fromPath("m/84'/0'", seed, network);

// const acct0 = root.deriveHardened(0);
// const external = acct0.derive(0);
// const ext0 = external.derive(0);
// const ext1 = external.derive(1);
// const ext2 = external.derive(2);

// const change = acct0.derive(1); //
// const chg0 = change.derive(0);

// console.log("coinbase address\n  ", ext0.toAddress());

// // TODO - shorthand HdPublicKey.toBuffer()
// const fundingScript = ScriptFactory.fundingScript(
//     ext1.toPubKey().toSecBuffer(),
//     ext2.toPubKey().toSecBuffer(),
// );

// const fundingAddress = fundingScript.toP2wshAddress(network);
// console.log("funding address\n  ", fundingAddress);

// // TODO - Script.p2wpkhLock to use argument type Buffer|PublicKey
// const tx = new TxBuilder();
// tx.version = 2;
// tx.addInput("548a01fa1bde6fcdd6759a4d48adfaee2b5e64d7cbfa6b10e6c0d5140852c12d:0");
// tx.addOutput(11.9999, Script.p2wpkhLock(chg0.toPubKey().toSecBuffer()));
// tx.addOutput(0.5, Script.p2wshLock(fundingScript));
// tx.addWitness(
//     0,
//     tx.signSegWitv0(0, Script.p2pkhLock(ext0.toPubKey().toSecBuffer()), ext0.toBuffer(), 12.5),
// );
// tx.addWitness(0, ext0.toPubKey().toSecBuffer());
// console.log("tx hex\n  ", tx.toHex());
// console.log("tx id\n  ", tx.toTx().txId.toString());
// // 006e457f515067dd0bb52bba91128aa950a95bc1aa1adc69c8b22308caa3df1e

// async function indexBlocks(): Promise<Map<string, string[]>> {
//     console.log("indexing...");
//     let cont = true;
//     let height = 0;
//     const addressMap = new Map();

//     while (cont) {
//         height += 1;
//         const hash = await bitcoind.getBlockHash(height);
//         const block = await bitcoind.getBlock(hash);
//         cont = !!block.nextblockhash;

//         if (height % 100 === 0) {
//             console.log("indexing block...", height);
//         }

//         // construct address:outpoint map
//         for (const txid of block.tx) {
//             const tx = await bitcoind.getTransaction(txid);
//             for (const vout of tx.vout) {
//                 if (!vout.scriptPubKey.addresses) continue;

//                 const outpoint = `${txid}:${vout.n}`;

//                 for (const address of vout.scriptPubKey.addresses) {
//                     if (!addressMap.has(address)) {
//                         addressMap.set(address, []);
//                     }
//                     addressMap.get(address).push(outpoint);
//                 }
//             }
//         }
//     }
//     return addressMap;
// }
// indexBlocks()
//     .then(scanAccounts)
//     .catch(console.error);

// function scanAccounts(addressIndex: Map<string, string[]>) {
//     // scan accounts
//     let i = 0;
//     let last = -1;
//     while (i - last < 20) {
//         const acct = root.deriveHardened(i);
//         if (scanAccount(acct.toPubKey(), addressIndex)) {
//             last = i;
//         }
//         i++;
//     }
//     return last >= 0;
// }

// function scanAccount(acct: HdPublicKey, addressIndex: Map<string, string[]>): boolean {
//     const external = acct.derive(0);
//     const change = acct.derive(1);

//     const path = "m/84'/0'/" + acct.number;
//     const found = scanChange(path + "/0", external, addressIndex);
//     if (found) {
//         scanChange(path + "/1", change, addressIndex);
//     }
//     return found;
// }

// function scanChange(
//     path: string,
//     change: HdPublicKey,
//     addressIndex: Map<string, string[]>,
// ): boolean {
//     let i = 0;
//     let last = -1;
//     while (i - last < 20) {
//         const node = change.derive(i);
//         const addr = node.toAddress();

//         console.log("    scanning", path + "/" + i, last, addr);
//         // if (addr === "bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx") {
//         //     console.log("woohooo");
//         // }

//         if (addressIndex.has(addr)) {
//             console.log("  found", addr, path + "/" + change.number);
//             last = i;
//         }
//         i++;
//     }
//     return last >= 0;
// }
