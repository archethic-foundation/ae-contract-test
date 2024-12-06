# ae-contract-test

Testing suite for WebAssembly smart contract for Archethic Public Blockchain.

The framework simplifies the WASM execution environement by simulating the interaction in/out between WASM and the host application.

## Features

- **Call abstraction**: call WASM method as Javascript function call
- **Ease of mocking**: Simplify I/O mock function call (i.e Chain request, HTTP, etc.)
- **Lifecycle abstraction**: Simulate contract deployment and upgrade
- **Account mangement**: Direct interaction with wallet & network to ease testing & deployment   

## Getting Started

## Prerequisites
- Node.js
- npm

## Installation

```bash
npm install @archethicjs/ae-contract-test
```

## Usage

1. Configure the environement

Create `archethic.config.js` file to define configuration for account & network interaction:
```js
{
   endpoint: 'https://testnet.archethic.net',
   seed: 'PRIVATE_SEED',
   upgradeAddress: 'Address allowed to make code upgrade'
}
```

2. Write a test

Create a file in `tests/index.spec.ts`

```js
import { readFileSync } from "fs";
import { getContract } from "@archethic/contract-testing";
import { Balance } from "@archethic/as-contract-sdk";
import { Address, Result, Transaction, TransactionType } from "@archethic/contract-testing/types";

describe("init", () => {
  it("should deploy the contract and initialize the state", async () => {
    const wasmBuffer = readFileSync("./dist/contract.wasm");

    const contract = await getContract(wasmBuffer, {
      transaction: {
        data: {
          content: "5",
        },
      } as Transaction
    });
    expect(contract.state).toStrictEqual({ counter: 25 });
  });
});

describe("inc", () => {
  it("should increment without state", async () => {
    const wasmBuffer = readFileSync("./dist/contract.wasm");
    const contract = await getContract(wasmBuffer);
    const result = contract.inc({ value: 2 });
    expect(result?.state.counter).toBe(2);
  });

  it("should increment with state", async () => {
    const wasmBuffer = readFileSync("./dist/contract.wasm");
    const contract = await getContract(wasmBuffer);

    const result = contract.inc({ state: { counter: 2 } });
    expect(result?.state.counter).toBe(3);
  });

  it("should raise an error when the state is negative", async () => {
    const wasmBuffer = readFileSync("./dist/contract.wasm");
    const contract = await getContract(wasmBuffer);
    expect(() => {
      contract.inc({ state: { counter: -2 } });
    }).toThrow("state cannot be negative");
  });
});
```

## Development

The test framework used several modules:
- **accounts**: Manage accounts and interaction with wallet
- **config**: Manage test configuration
- **connection**: Manage blockchain connection
- **contract_factory**: Abstract WASM contract instance & function calls

## **Contribution**

Thank you for considering to help out with the source code. We welcome contributions from anyone and are grateful for even the smallest of improvement.

Please to follow this workflow:

1. Fork it!
2. Create your feature branch (git checkout -b my-new-feature)
3. Commit your changes (git commit -am 'Add some feature')
4. Push to the branch (git push origin my-new-feature)
5. Create new Pull Request

## **Licence**

AGPL
