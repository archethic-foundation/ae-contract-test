import axios from "axios"
import fs from "fs"
import zlib from "zlib"

import Archethic, { ArchethicWalletClient, Contract, Crypto, Utils } from "@archethicjs/sdk"
import { TransactionSuccess } from "@archethicjs/sdk/dist/api/types";
import { ExtendedTransactionBuilder } from "@archethicjs/sdk/dist/transaction";
import TransactionBuilder from "@archethicjs/sdk/dist/transaction_builder";

import { ConnectionType } from "./connection";

class Account {
  constructor(public address: string, public connectionType: ConnectionType, public archethic: Archethic, public seed?: string) {}

  async requestFaucet() {
    let endpointUrl = this.archethic.endpoint.nodeEndpoint as URL;
    if (endpointUrl.hostname == "mainnet.archethic.net") {
      throw new Error("Faucet cannot be requested on mainnet")
    }

    const faucetURL = new URL("faucet", endpointUrl)
    const faucetLink = faucetURL.href

    let response = await axios.get(faucetLink, {
      headers: {
        Origin: endpointUrl.origin,
        Referer: faucetLink,
        Cookie: "_archethic_key=SFMyNTY.g3QAAAABbQAAAAtfY3NyZl90b2tlbm0AAAAYbUdHbWRVQWVvV1ZIcGtMazhxX0VmdG56.1_OFPYLSwLdkA7SnZNa7A5buhBL08fh6PaZRqu7SGh0"
      }
    })

    const matches = response.data.match(/(?<=name="_csrf_token" value=").*?(?=">)/)
    const csrf_token = matches[0]

    const params = new URLSearchParams()
    params.append('_csrf_token', csrf_token)
    params.append('address', this.address)

    response = await axios.post(faucetLink, params, {
      headers: {
        Origin: endpointUrl.origin,
        Referer: faucetLink,
        Cookie: "_archethic_key=SFMyNTY.g3QAAAABbQAAAAtfY3NyZl90b2tlbm0AAAAYbUdHbWRVQWVvV1ZIcGtMazhxX0VmdG56.1_OFPYLSwLdkA7SnZNa7A5buhBL08fh6PaZRqu7SGh0",
        "Content-Type": "application/x-www-form-urlencoded"
      }
    })

    if (!response.data.match(/Transaction submitted/)) {
      throw new Error("Unable to send the transaction")
    }
  }
  
  async sendTransaction(tx: TransactionBuilder): Promise<TransactionSuccess> {
    if (this.connectionType == ConnectionType.Wallet) {
      const rpcWallet = this.archethic.rpcWallet as ArchethicWalletClient;
      const walletAccount = await rpcWallet.getCurrentAccount();
      const signedTxs = await rpcWallet.signTransactions(walletAccount.serviceName, "", [tx]);
      const signedTx = signedTxs[0].originSign(Utils.originPrivateKey) as ExtendedTransactionBuilder;
      return rpcWallet.sendTransaction(signedTx)
    }

    const seed = this.seed as string;
    const genesisAddress = Crypto.deriveAddress(seed)
    const index = await this.archethic.transaction.getTransactionIndex(genesisAddress)
    const signedTx = tx.build(seed, index).originSign(Utils.originPrivateKey) as ExtendedTransactionBuilder

    return new Promise((resolve, reject) => {
      signedTx
        .on("error", (_context: string, error: string) => reject(error))
        .on("requiredConfirmation", (nbConfirmations: number) => {
          resolve({
            transactionAddress: Utils.uint8ArrayToHex(signedTx.address),
            nbConfirmations: nbConfirmations,
            maxConfirmations: 0
          })
        })
        .send()
      })
  }
}

export async function getAccount(archethic: Archethic, seed?: string): Promise<Account> {
  if (archethic.endpoint.isRpcAvailable && archethic.rpcWallet !== undefined) {
    const walletAccount = await archethic.rpcWallet.getCurrentAccount();
    return new Account(walletAccount.genesisAddress, ConnectionType.Wallet, archethic)
  }
  if (seed == undefined) {
    throw new Error("seed is required if the connection is not wallet based")
  }
  const genesisAddress = Crypto.deriveAddress(seed)
  return new Account(Utils.uint8ArrayToHex(genesisAddress), ConnectionType.Direct, archethic, seed)
}

export function getRandomAccount(archethic: Archethic): Account {
  const seed = Crypto.randomSecretKey()
  const chainAddress = Crypto.deriveAddress(seed)
  return new Account(Utils.uint8ArrayToHex(chainAddress), ConnectionType.Direct, archethic, Utils.uint8ArrayToHex(seed))
}

export type deployOpts = {
  content?: string
}

export async function getDeployContractTx(account: Account, opts: deployOpts = {}) {
  if (account.connectionType == ConnectionType.Wallet) {
    throw new Error("Only direct account is supported for now")
  }

  const compressedCode = await compress(fs.readFileSync("./dist/contract.wasm"))
  const manifestFile = fs.readFileSync('./dist/manifest.json', 'utf-8')
  let tx = await Contract.newContractTransaction(account.archethic, JSON.stringify({
    manifest: JSON.parse(manifestFile),
    bytecode: compressedCode.toString('hex')
  }), account.seed as string)

  if (opts.content) {
    tx.setContent(opts.content)
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