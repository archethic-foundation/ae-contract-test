import { IOMemory, ResultError, Context, isContextOpts } from "./env";
import { Balance, Transaction, TransactionType, Address, PublicKey, Result, HashFunction, HttpRequest, HttpResponse, ContractFunctions, FunctionResult } from "./types";
import { combineNumber, toHex } from "./utils";

type ContractWithFunctions = BaseContract & ContractFunctions;
type ContextWrappedFunction = (context?: Context) => FunctionResult;

type ContractOptions = {
  balance?: Balance,
  transaction?: Transaction,
  ioMocks?: IOMock
}

type InitOptions = {
  init?: boolean
}

export enum InputType {
  UCO,
  Token
}

export type Input = {
  from?: String
  amount: number
  type: InputType
  tokenAddress?: String
  tokenId?: number
}

const reservedFunctions = ["onInit", "onUpgrade"];

function executeFn(
  fn: Function,
  ioMem: IOMemory,
  input: Context,
): FunctionResult {
  // Reset the memory foreach new function call
  ioMem.reset();
  ioMem.setInput(input);
  try {
    const response = fn();
    if (!response || response == 0) {
      return ioMem.getOutput();
    }
  } catch (e) {
    if (ioMem.error !== undefined) {
      throw ioMem.error;
    }
    throw e;
  }
}

function wrapFunctionWithContext(
  fn: Function,
  ioMem: IOMemory,
): ContextWrappedFunction {
  return (context?: Context) => {
    const input = Object.assign({ state: {} }, context);
    return executeFn(fn, ioMem, input);
  };
}

function mutateContractWithFnResult(
  result: FunctionResult,
  contract: BaseContract,
): FunctionResult {
  if (result?.transaction || result?.state) {
    contract.state = result.state;
    contract.transaction = result.transaction;
    return { state: result.state, transaction: result.transaction }
  }
  return result;
}

class BaseContract {
  memory: IOMemory;
  transaction: undefined | Transaction;
  state!: Record<string, any>;
  functions: Map<string, ContextWrappedFunction>;
  wasmBytes!: Uint8Array;

  constructor(
    functions: Map<string, ContextWrappedFunction>,
    memory: IOMemory,
  ) {
    this.functions = functions;
    this.memory = memory;
  }

  static fromWASM(
    wasmInstance: WebAssembly.Instance,
    ioMem: IOMemory,
    opts: ContractOptions & InitOptions | undefined
  ): ContractWithFunctions {
    const exportedFunctions = new Map<string, Function>();
    for (let key in wasmInstance.exports) {
      if (wasmInstance.exports[key] instanceof Function) {
        exportedFunctions.set(key, wasmInstance.exports[key] as Function)
      }
    }

    const contextWrappedFunctions = new Map<string, ContextWrappedFunction>();
    for (let [name, fn] of exportedFunctions) {
      const wrapFn = wrapFunctionWithContext(fn, ioMem);
      contextWrappedFunctions.set(name, wrapFn);
    }

    const contract = new BaseContract(contextWrappedFunctions, ioMem) as ContractWithFunctions;
    contextWrappedFunctions.forEach((wrappedFn, name) => {
      if (reservedFunctions.includes(name)) {
        return;
      }

      contract[name] = (...args: any[]): FunctionResult => {
        let context: Context = { now: 0, balance: opts?.balance ? opts.balance : { uco: 0, token: [] }, contract: {
          address: new Address("00000000000000000000000000000000000000000000000000000000000000000000"),
          type: TransactionType.Contract,
          genesis: new Address("00000000000000000000000000000000000000000000000000000000000000000000"),
          data: {}
        } };
        context.state  = contract.state;
        if (args.length > 0) {
          if (isContextOpts(args[0])) {
            if (args[0].state) context.state = args[0].state
            if (args[0].transaction) context.transaction = args[0].transaction
            if (args[0].balance) context.balance = args[0].balance
            if (args[0].now) context.now = args[0].now
            if (args[0].contract) context.contract = args[0].contract
            context.arguments = {};
          } else {
            context.arguments = args[0];
            if (args.length == 2) {
              if (args[1].state) context.state = args[1].state
              if (args[1].transaction) context.transaction = args[1].transaction
              if (args[1].balance) context.balance = args[1].balance
              if (args[1].now) context.now = args[1].now
              if (args[1].contract) context.contract = args[1].contract
            }
          }
        }
        return mutateContractWithFnResult(wrappedFn(context), contract);
      };
    });

    const initFun = contextWrappedFunctions.get("onInit");
    const isInit = opts != undefined && opts.init !== undefined ? opts.init : true;
    if (isInit && initFun) {
      const defaultContext = {
        now: 0,
        balance: { uco: 0, token: [] }
      }
      const initializeState = initFun(opts?.transaction ? Object.assign(defaultContext, { transaction: opts.transaction }) : defaultContext);
      if (initializeState) {
        contract.state = initializeState;
      }
    }

    return contract;
  }

  toTransaction(): Transaction {
    const defaultTransaction: Transaction = {
      type: TransactionType.Contract,
      data: {
        code: toHex(this.wasmBytes),
      },
      validationStamp: {
        ledgerOperations: {
          unspentOutputs: [
            {
              type: "state",
              state: this.state,
              from: "",
            },
          ],
        },
      },
    } as Transaction;

    if (this.transaction) {
      if (this.transaction.data.code === undefined) {
        this.transaction.data.code = defaultTransaction.data.code;
      }
      return Object.assign(defaultTransaction, this.transaction);
    }
    return defaultTransaction;
  }

  async upgrade(
    newBuffer: Uint8Array,
    transaction: Transaction | undefined = undefined,
  ): Promise<BaseContract> {
    const onUpgradeFn = this.functions.get("onUpgrade");
    const onInheritFn = this.functions.get("onInherit");
    const newContract = await getContract(newBuffer, { init: false });
    const defaultContext = { now: 0, balance: { uco: 0, token: [] } }

    if (onUpgradeFn != undefined) {
      const upgradeResult = onUpgradeFn(Object.assign(defaultContext, {
        state: this.state,
        transaction: transaction,
      }));
      if (upgradeResult?.state) {
        newContract.state = upgradeResult?.state;
      }
    }

    if (onInheritFn != undefined) {
      onInheritFn(Object.assign(defaultContext, {
        state: newContract.state,
        transaction: transaction
      }))
    }

    return newContract;
  }
}




export async function getContract(
  buffer: Uint8Array,
  opts: ContractOptions & InitOptions | undefined = undefined,
): Promise<ContractWithFunctions> {
  const ioMem = new IOMemory();
  const module = await WebAssembly.instantiate(buffer, {
    "env": {},
    "archethic/env": {
      log: (offset: bigint, length: bigint) => {
        envHostFunctions.log(ioMem, offset, length)
      },
      store_u8: (offset: bigint, data: bigint) => {
        envHostFunctions.store_u8(ioMem, offset, data)
      },
      load_u8: (offset: bigint): number => {
        return envHostFunctions.load_u8(ioMem, offset)
      },
      input_size: (): bigint => {
        return envHostFunctions.input_size(ioMem)
      },
      alloc: (length: bigint): bigint => {
        return envHostFunctions.alloc(ioMem, length)
      },
      set_output: (offset: bigint, length: bigint) => {
        envHostFunctions.set_output(ioMem, offset, length)
      },
      set_error: (offset: bigint, length: bigint) => {
        envHostFunctions.set_error(ioMem, offset, length)
      },
      jsonrpc: (offset: bigint, length: bigint): bigint => {
        return envHostFunctions.jsonrpc(ioMem, offset, length, opts)
      },
    },
  });

  const contract = BaseContract.fromWASM(module.instance, ioMem, opts);
  contract.wasmBytes = buffer;

  return contract as ContractWithFunctions;
}

const envHostFunctions = {
  log: (ioMem: IOMemory, offset: bigint, length: bigint) => {
    const start = Number(offset);
    const end = start + Number(length);
    const read = ioMem.buffer.slice(start, end);
    console.log(new TextDecoder().decode(read));
  },
  store_u8: (ioMem: IOMemory, offset: bigint, data: bigint) => {
    ioMem.buffer[Number(offset)] = Number(data);
  },
  load_u8: (ioMem: IOMemory, offset: bigint): number => {
    return ioMem.buffer[Number(offset)];
  },
  input_size: (ioMem: IOMemory): bigint => {
    return BigInt(ioMem.input.byteLength);
  },
  alloc: (ioMem: IOMemory, length: bigint): bigint => {
    const offset = ioMem.bufferOffset;
    const oldSize = ioMem.buffer.byteLength;
    const newBuffer = new ArrayBuffer(oldSize + Number(length));
    const resizedBuffer = new Uint8Array(newBuffer);
    resizedBuffer.set(ioMem.buffer);
    ioMem.buffer = resizedBuffer;
    ioMem.bufferOffset += length;
    return offset;
  },
  set_output: (ioMem: IOMemory, offset: bigint, length: bigint) => {
    const start = Number(offset);
    const end = start + Number(length);
    const read = ioMem.buffer.slice(start, end);
    ioMem.output = read;
  },
  set_error: (ioMem: IOMemory, offset: bigint, length: bigint) => {
    const start = Number(offset);
    const end = start + Number(length);
    const read = ioMem.buffer.slice(start, end);
    const {
      message,
      metadata: { fileName, line, column },
    } = JSON.parse(new TextDecoder().decode(read));
    ioMem.error = new ResultError(message, fileName, line, column);
  },
  jsonrpc: (ioMem: IOMemory, offset: bigint, length: bigint, opts: ContractOptions | undefined): bigint => {
    const start = Number(offset);
    const end = start + Number(length);
    const serializedInput = ioMem.buffer.slice(start, end);
    const input = JSON.parse(new TextDecoder().decode(serializedInput));

    if (!(input.method && input.params)) throw new Error(`error deserializing jsonrpc request`)
    if (!(opts && opts.ioMocks)) throw new Error(`getContract requires \`${input.method}\` mock to be defined`)

    const output = mock(input.method, input.params, opts.ioMocks)
    const serializedOutput = new TextEncoder().encode(JSON.stringify(output));
    const size = serializedOutput.byteLength
    const allocatedOffset = envHostFunctions.alloc(ioMem, BigInt(size))
    for (let i = 0; i < size; i++) {
      envHostFunctions.store_u8(ioMem, allocatedOffset + BigInt(i), BigInt(serializedOutput[i]))
    }

    return combineNumber(allocatedOffset, BigInt(size))
  }
}

interface IOMock {
  getBalance?(address: Address): Balance
  getGenesisAddress?(address: Address): Address
  getFirstTransactionAddress?(address: Address): Address
  getBurnAddress?(): Address
  getLastAddress?(address: Address): Address
  getPreviousAddress?(previousPublicKey: PublicKey): Address
  getGenesisPublicKey?(publicKey: PublicKey): PublicKey
  getTransaction?(address: Address): Result<Transaction>
  getLastTransaction?(address: Address): Result<Transaction>
  callFunction?<A, R>(address: Address, functionName: string, args: A): Result<R>
  hmacWithStorageNonce?(data: Uint8Array, hashFunction: HashFunction): Uint8Array
  signWithRecovery?(data: Uint8Array): Uint8Array
  decryptWithStorageNonce?(cipher: Uint8Array): Uint8Array
  request?(req: HttpRequest): HttpResponse
  requestMany?(reqs: HttpRequest[]): HttpResponse[]
}

function mock(method: keyof IOMock, params: any, availableMocks: IOMock): any {
  if (!availableMocks[method])
    throw new Error(`missing mock for method: ${method}`)

  switch (method) {
    // ---- Chain ----
    case "getBalance":
      return Result.wrapOk(availableMocks[method](params))
    case "getGenesisAddress":
    case "getFirstTransactionAddress":
    case "getLastAddress":
    case "getPreviousAddress":
      return Result.wrapOk(availableMocks[method](params))
    case "getGenesisPublicKey":
      return Result.wrapOk(availableMocks[method](params))
    case "getTransaction":
    case "getLastTransaction":
      // the mock already return a result
      return availableMocks[method](params)

    // ---- Contract ----
    case "callFunction":
      // the mock already return a result
      return availableMocks[method](params.address, params.functionName, params.args)

    // ---- Crypto ----
    case "hmacWithStorageNonce":
      return Result.wrapOk(availableMocks[method](params.data, params.hashFunction))

    case "signWithRecovery":
    case "decryptWithStorageNonce":
      return Result.wrapOk(availableMocks[method](params))

    // ---- Http ----
    case "request":
    case "requestMany":
      return Result.wrapOk(availableMocks[method](params))

  }
}