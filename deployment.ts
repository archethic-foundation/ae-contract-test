import fs from "fs"
import zlib from "zlib"
import { Contract } from "@archethicjs/sdk"

import { ConnectionType } from "./connection"
import { Account } from "./account"

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

  const compressedCode = await compress(fs.readFileSync("./dist/contract.wasm"))
  const manifestFile = fs.readFileSync('./dist/manifest.json', 'utf-8')
  const manifest = JSON.parse(manifestFile)
  if (opts.upgradeAddress) {
    manifest.upgradeOpts = {
      from: opts.upgradeAddress
    }
  }
  let tx = await Contract.newContractTransaction(account.archethic, JSON.stringify({
    manifest: manifest,
    bytecode: compressedCode.toString('hex')
  }), account.seed as string)

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

export async function getUpgradeContractTx(account: Account, contractAddress: string, opts: DeployOpts = {}) {
  const compressedCode = await compress(fs.readFileSync("./dist/contract.wasm"))
  const manifestFile = fs.readFileSync('./dist/manifest.json', 'utf-8')
  const manifest = JSON.parse(manifestFile)

  if (opts.upgradeAddress) {
    manifest.upgradeOpts = {
      from: opts.upgradeAddress
    }
  }

  const tx = account.archethic.transaction.new()
    .setType("transfer")
    .addRecipient(contractAddress, "upgrade", [ compressedCode.toString('hex'), manifest ])
  
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