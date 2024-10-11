import fs from "fs"
import zlib from "zlib"
import { Contract as ContractNS, Utils } from "@archethicjs/sdk"
import { ConnectionType } from "./connection"
import { Account } from "./account"
import { TransactionData } from "@archethicjs/sdk/dist/types"
import { ExtendedTransactionBuilder } from "@archethicjs/sdk/dist/transaction"

const { hexToUint8Array } = Utils
const { Contract, newContractTransaction, updateContractTransaction } = ContractNS

type UCOTransfer = {
  to: string;
  amount: bigint;
}

type TokenTransfer = {
  to: string;
  amount: bigint;
  tokenAddress: string;
  tokenId: number;
}

type Recipient = {
  to: string;
  action?: string;
  args?: any[]
}

export type DeployTxDataOpt = {
  content?: string;
  ucoTransfers?: UCOTransfer[];
  tokenTransfers?: TokenTransfer[];
  recipients?: Recipient[];
}

export type DeployOpts = {
  additionalData?: DeployTxDataOpt
  upgradeAddress?: string
}

export async function getDeployContractTx(account: Account, opts: DeployOpts = {}) {
  if (account.connectionType == ConnectionType.Wallet) {
    throw new Error("Only direct account is supported for now")
  }

  const bytecode = fs.readFileSync("./dist/contract.wasm")
  const manifestFile = fs.readFileSync('./dist/manifest.json', 'utf-8')
  const manifest = JSON.parse(manifestFile)
  if (opts.upgradeAddress) {
    manifest.upgradeOpts = {
      from: opts.upgradeAddress
    }
  }

  let txData: TransactionData | undefined = undefined;
  if (opts.additionalData) {
    txData = { content: "", ledger: { uco: {transfers: []}, token: { transfers: []}}, recipients: [], ownerships: []}
    if (opts.additionalData.content) {
      txData.content = opts.additionalData.content
    }

    if (opts.additionalData.ucoTransfers) {
      txData.ledger.uco.transfers = opts.additionalData.ucoTransfers.map((t) => {
        return { to: hexToUint8Array(t.to), amount: t.amount}
     })
    }

    if (opts.additionalData.tokenTransfers) {
      txData.ledger.token.transfers = opts.additionalData.tokenTransfers.map((t) => {
        return { to: hexToUint8Array(t.to), amount: t.amount, tokenAddress: hexToUint8Array(t.tokenAddress), tokenId: t.tokenId}
     })
    }

    if (opts.additionalData?.recipients) {
      txData.recipients = opts.additionalData.recipients.map(r => {
        return { address: hexToUint8Array(r.to), action: r.action, args: r.args }
      })
    }
  }
 
  let tx = await newContractTransaction(account.archethic, new Contract(bytecode, manifest), account.seed as string, txData)

  if (opts.additionalData?.ucoTransfers) {
    opts.additionalData?.ucoTransfers.forEach(t => tx.addUCOTransfer(t.to, t.amount))
  }

  if (opts.additionalData?.tokenTransfers) {
    opts.additionalData?.tokenTransfers.forEach(t => tx.addTokenTransfer(t.to, t.amount, t.tokenAddress, t.tokenId))
  }

  if (opts.additionalData?.recipients) {
    opts.additionalData?.recipients.forEach(t => tx.addRecipient(t.to, t.action, t.args))
  }

  return tx
}

export function getUpgradeContractTx(account: Account, contractAddress: string, opts: DeployOpts = {}): ExtendedTransactionBuilder {
  const bytecode = fs.readFileSync("./dist/contract.wasm")
  const manifestFile = fs.readFileSync('./dist/manifest.json', 'utf-8')
  const manifest = JSON.parse(manifestFile)

  if (opts.upgradeAddress) {
    manifest.upgradeOpts = {
      from: opts.upgradeAddress
    }
  }

  const tx = updateContractTransaction(account.archethic, contractAddress, new Contract(bytecode, manifest))
  
  if (opts.additionalData?.content) {
    tx.setContent(opts.additionalData?.content)
  }

  if (opts.additionalData?.ucoTransfers) {
    opts.additionalData?.ucoTransfers.forEach(t => tx.addUCOTransfer(t.to, t.amount))
  }

  if (opts.additionalData?.tokenTransfers) {
    opts.additionalData?.tokenTransfers.forEach(t => tx.addTokenTransfer(t.to, t.amount, t.tokenAddress, t.tokenId))
  }

  if (opts.additionalData?.recipients) {
    opts.additionalData?.recipients.forEach(t => tx.addRecipient(t.to, t.action, t.args))
  }

  return tx
}

async function compress(bytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.deflateRaw(bytes, (err, res) => {
      if (err) {
        return reject(err)
      }
      resolve(res)
    })
  })
}