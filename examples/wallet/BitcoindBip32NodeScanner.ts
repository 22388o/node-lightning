import { HdPrivateKey } from "@node-lightning/bitcoin";
import { BitcoindClient, Transaction } from "@node-lightning/bitcoind";

type Address = string;
type OutPoint = string;
type InPoint = string;

/**
 * Implements address scanning for a single BIP32 node by scanning a
 * range of derived addresses. This technique scans the blockchain for
 * each supplied node, and as such is super efficient for BIP32 account
 * discovery.
 */
export class BitcoindBip32NodeScanner {
    constructor(readonly bitcoind: BitcoindClient, readonly node: HdPrivateKey) {}

    public async scan(height: number = 1, addressWindow: number = 2000) {
        const key = this.node;
        const foundAddresses: Map<string, { index: number; tx: Set<string> }> = new Map();
        const scanAddresses: Map<Address, number> = new Map();
        const outpoints: Map<OutPoint, InPoint> = new Map();

        while (height <= (await this._getBestHeight())) {
            this._expandAddressWindow(key, foundAddresses, scanAddresses, addressWindow);

            const hash = await this.bitcoind.getBlockHash(height);
            const block = await this.bitcoind.getBlock(hash);
            const txs = block.tx;

            this._scanBlock(txs, outpoints, foundAddresses, scanAddresses);

            if (foundAddresses.size < scanAddresses.size) {
                height += 1;
            }
        }

        console.log(foundAddresses);
        console.log(outpoints);
    }

    protected async _getBestHeight(): Promise<number> {
        let bestHash = await this.bitcoind.getBestBlockHash();
        let bestHeader = await this.bitcoind.getHeader(bestHash);
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

    protected _scanBlock(
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
}
