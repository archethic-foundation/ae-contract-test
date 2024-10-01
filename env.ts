import {Context, ContextOpts, Transaction, TransactionData} from "./types"

export class ResultError extends Error {
  constructor(
    message: string,
    public fileName: string,
    public line: number,
    public column: number,
  ) {
    super(message);
    this.stack = ` Error: ${message}\nat ${fileName}(${line}:${column})`;
  }
}

export class IOMemory {
  buffer!: Uint8Array;
  bufferOffset!: bigint;
  input!: Uint8Array;
  output!: Uint8Array;
  error: ResultError | undefined;

  constructor() {
    this.reset();
  }

  reset() {
    this.input = new Uint8Array(0);
    this.output = new Uint8Array(0);
    this.bufferOffset = 0n;
    this.error = undefined;
    this.buffer = new Uint8Array(0)
  }

  getOutput(): Record<string, any> {
    if (this.output.byteLength == 0) {
      return {};
    }
    return JSON.parse(new TextDecoder().decode(this.output));
  }

  setInput(input: Context) {
    this.input = new TextEncoder().encode(JSON.stringify(input));
    const inputSize = this.input.byteLength

    const newBuffer = new ArrayBuffer(inputSize);
    const resizedBuffer = new Uint8Array(newBuffer);
    resizedBuffer.set(this.buffer);
    this.buffer = resizedBuffer;
    this.bufferOffset += BigInt(inputSize)

    for (let i = 0; i < inputSize; i++) {
      this.buffer[i] = this.input[i]
    }
  }
}

export function isContextOpts(opts: any): opts is ContextOpts {
  if (typeof opts !== "object") {
    return false;
  }
  const isStateOpt = "state" in opts && isState(opts.state);
  const isTransactionOpt =
    "transaction" in opts && isTransaction(opts.transaction);
  const isBalanceOpt = "balance" in opts && isBalance(opts.balance)
  return isStateOpt || isTransactionOpt || isBalanceOpt;
}

function isState(state: any): state is object {
  return typeof state === "object";
}

function isTransaction(tx: any): tx is Transaction {
  return typeof tx === "object" && "data" in tx && isTransactionData(tx);
}

function isBalance(balance: any): balance is Transaction {
  return typeof balance === "object" && ("uco" in balance || "tokens" in balance);
}

function isTransactionData(txData: any): txData is TransactionData {
  return (
    typeof txData === "object" &&
    ("content" in txData ||
      "code" in txData ||
      "ledger" in txData ||
      "recipients" in txData ||
      "ownerships" in txData)
  );
}