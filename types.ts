import { ContextOpts } from "./env";

export class TokenBalance {
  tokenAddress!: Address;
  tokenId: number = 0;
  amount!: number;
}

export class Balance {
  uco: number = 0;
  token: TokenBalance[] = []
}

export namespace TransactionType {
  export const Contract = "contract";
  export const Transfer = "transfer";
  export const Data = "data";
  export const Token = "token";
}
  
export type TransactionType = string;

export class Transaction {
  address!: Address;
  type!: TransactionType;
  data!: TransactionData;
  previousPublicKey!: PublicKey;
  genesis!: Address;
  validationStamp?: ValidationStamp;
};

export type TransactionData = {
  content?: string;
  code?: string;
  ledger?: Ledger;
};

export type Ledger = {
  uco?: UCOLedger;
  token?: TokenLedger;
};

export type UCOLedger = {
  transfers: UCOTransfer[];
};

export type UCOTransfer = {
  to: Address;
  amount: number;
};

export type TokenLedger = {
  transfers: TokenTransfer[];
};

export type TokenTransfer = {
  to: Address;
  amount: number;
  tokenAddress: Address;
  tokenId: number;
};

export type ValidationStamp = {
  ledgerOperations: LedgerOperations;
};

export type LedgerOperations = {
  unspentOutputs: UTXO[];
};

export type UTXO = UCOUTXO | TokenUTXO | StateUTXO;

export interface UnspentOutput {
  amount?: number;
  from: string;
}

export interface StateUTXO extends UnspentOutput {
  state: object;
  type: "state";
}

export interface UCOUTXO extends UnspentOutput {
  type: "UCO";
}

export interface TokenUTXO extends UnspentOutput {
  type: "token";
  tokenAddress: string;
  tokenIndex: number;
}

type FunctionWithParams = (input: any, opts?: ContextOpts) => FunctionResult
type FunctionWithOptions = (opts?: ContextOpts) => FunctionResult

export type ContractFunction = FunctionWithOptions & FunctionWithParams
export type ContractFunctions = Record<string, ContractFunction>;

export type TransactionResult = {
  transaction?: Transaction;
  state?: Record<string, any>;
};
export type FunctionResult = Record<string, any> | TransactionResult | undefined;

export class Nullable<T> {
  value!: T
}

export class Result<T> {
  ok: Nullable<T> | null = null
  error: string | null = null

  constructor(okValue: Nullable<T> | null, errValue: string | null) {
    if (okValue != null) this.ok = okValue
    this.error = errValue
  }

  static wrapOk<T>(value: T): Result<T> {
    return new Result<T>({ value }, null)
  }

  static wrapError<T>(message: string): Result<T> {
    return new Result<T>(null, message)
  }

  unwrap(): T {
    const okValue = this.ok
    const errValue = this.error
    if (okValue != null) { return okValue.value }
    if (errValue != null) throw new Error(`unwrap failed: ${errValue}`)
    throw new Error("unwrap failed: invalid Result")
  }

  unwrapWithDefault(def: T): T {
    const okValue = this.ok
    if (okValue != null) { return okValue.value }
    return def;
  }

  map<A>(fun: (r: T) => A): Result<A> {
    const okValue = this.ok
    const errValue = this.error
    if (okValue != null) {
      return Result.wrapOk(fun(okValue.value))
    }
    if (errValue != null) {
      return Result.wrapError<A>(errValue)
    }
    throw new Error("map failed: invalid Result")
  }
}

export class Hex {
  hex: string;

  constructor(hex: string) {
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 == 1) {
      throw new Error("not an hexadecimal")
    }
    this.hex = hex.toUpperCase();
  }

  static compare(a: Hex, b: Hex): boolean {
    return a.hex == b.hex
  }

  toString(): string {
    return this.hex;
  }
}

export class Address extends Hex { }
export class PublicKey extends Hex { }

export class HttpRequest {
  uri!: string;
  method: Method = Method.GET;
  headers: HttpHeader[] = [];
  body: string = "";
}

class HttpHeader {
  key!: string;
  value!: string;
}

export class HttpResponse {
  status!: number;
  body!: string
}

export enum Method {
  GET, //= "GET",
  PUT, //= "PUT",
  POST, //= "POST",
  PATCH, //= "PATCH",
  DELETE, //= "DELETE",
}

export enum HashFunction {
  SHA256,
  SHA512,
  SHA3_256,
  SHA3_512,
  // BLAKE2B,
  // KECCAK256 ,

}