import { BitcoinError, BitcoinErrorCode, LockTime } from ".";
import { ICloneable } from "./ICloneable";

/**
 * Represents bitcoin value that can be converted to or from multiple
 * formats.
 */
export class Value implements ICloneable<Value> {
    /**
     * Creates a value object from value in bitcoin, eg: 1.12345678
     * @param num
     */
    public static fromBitcoin(num: number): Value {
        return Value.fromSats(Math.trunc(num * 1e8));
    }

    /**
     * Creates a value instance from value in satoshis where 1 satoshis
     * equates to 0.00000001 bitcoin.
     * @param num
     */
    public static fromSats(num: bigint | number) {
        return new Value(BigInt(num) * BigInt(1e12));
    }

    /**
     * Creates a value instance from value in millisatoshis, 1/1000 of a
     * satoshi.
     * eg: 123 millisatoshis equates to 0.123 satoshis
     * eg: 123 millisatoshis equates to 0.00000000123 bitcoin
     * @param num
     */
    public static fromMilliSats(num: bigint | number) {
        return new Value(BigInt(num) * BigInt(1e9));
    }

    /**
     * Creates a value instance from value in microsatoshis, 1/1e6 of a
     * satoshi.
     * eg: 123 microsatoshis equates to 0.000123 satoshis
     * eg: 123 microsatoshis equates to 0.00000000000123 bitcoin
     * @param num
     */
    public static fromMicroSats(num: bigint | number) {
        return new Value(BigInt(num) * BigInt(1e6));
    }

    /**
     * Creates a value instance from value in picosatoshis, 1/1e12 of a
     * satoshi.
     * eg: 123 picosatoshis equates to 0.000000000123 satoshis
     * eg: 123 picosatoshis equates to 0.00000000000000000123 bitcoin
     * @param num
     */
    public static fromPicoSats(num: bigint | number) {
        return new Value(BigInt(num));
    }

    /**
     * Generates a value instance of zero
     */
    public static zero(): Value {
        return new Value(BigInt(0));
    }

    private _picoSats: bigint;

    /**
     * Gets the value in picosatoshis (1/1e12 satoshis)
     */
    public get psats(): bigint {
        return this._picoSats;
    }

    /**
     * Gets the value in millionth of satoshis (1/1e6 satoshis)
     */
    public get microsats(): bigint {
        return this._picoSats / BigInt(1e6);
    }

    /**
     * Gets the value in millisatoshis (1/1000 satoshis)
     */
    public get msats(): bigint {
        return this._picoSats / BigInt(1e9);
    }

    /**
     * Gets the value in satoshis (1/1e8 bitcoin)
     */
    public get sats(): bigint {
        return this._picoSats / BigInt(1e12);
    }

    /**
     * Gets the value in bitcoin
     */
    public get bitcoin(): number {
        return Math.max(0, Number(this.sats) / 1e8);
    }

    private constructor(picoSats: bigint) {
        this._picoSats = picoSats;
    }

    /**
     * Clone via deep copy
     */
    public clone(): Value {
        return new Value(this._picoSats);
    }

    /**
     * Returns true if the current value is equal to the other value
     * @param other
     * @returns
     */
    public eq(other: Value): boolean {
        return other._picoSats === this._picoSats;
    }

    /**
     * Returns true if the current value is not equal to the other value
     * @param other
     * @returns
     */
    public neq(other: Value): boolean {
        return other._picoSats !== this._picoSats;
    }
}
