import { BitcoindClient, Transaction } from "@node-lightning/bitcoind";
import { BlockScanner, BlockScannerState } from "./BlockScanner";

/**
 * Implements an IBlockScanner using bitcoind.
 */
export class BitcoindBlockScanner extends BlockScanner {
    constructor(readonly bitcoind: BitcoindClient) {
        super();
    }

    public async _scanRange(startHeight: number, endHeight: number): Promise<void> {
        for (let height = startHeight; height <= endHeight; height++) {
            this.lastBlock = height;
            const hash = await this.bitcoind.getBlockHash(height);
            const block = await this.bitcoind.getBlock(hash);
            const txs = block.tx;

            this._scanBlock(txs);
            if (this.state === BlockScannerState.Canceled) return;
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
