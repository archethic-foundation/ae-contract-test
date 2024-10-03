import axios from "axios"

import Archethic, { ArchethicWalletClient, Contract, Crypto, Utils } from "@archethicjs/sdk"
import { TransactionSuccess } from "@archethicjs/sdk/dist/api/types";
import { ExtendedTransactionBuilder } from "@archethicjs/sdk/dist/transaction";
import TransactionBuilder from "@archethicjs/sdk/dist/transaction_builder";
import { ConnectionType, getConnection } from "./connection";
import { Config } from "./config";
import { DeployTxDataOpt, getDeployContractTx, getUpgradeContractTx } from "./deployment";

export class Account {
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

export class AccountContext {
  #config: Config
  archethicClient!: Archethic;

  constructor(client: Archethic, config: Config){
    this.archethicClient = client;
    this.#config = config;
  }

  static async fromConfig(config: Config): Promise<AccountContext> {
    const client = await getConnection(config.endpoint)
    return new AccountContext(client, config);
  }

  async getAccount(): Promise<Account> {
    if (this.archethicClient.endpoint.isRpcAvailable && this.archethicClient.rpcWallet !== undefined) {
      const walletAccount = await this.archethicClient.rpcWallet.getCurrentAccount();
      return new Account(walletAccount.genesisAddress, ConnectionType.Wallet, this.archethicClient)
    }
    if (this.#config.seed == undefined) {
      throw new Error("seed is required if the connection is not wallet based")
    }
    const genesisAddress = Crypto.deriveAddress(this.#config.seed)
    return new Account(Utils.uint8ArrayToHex(genesisAddress), ConnectionType.Direct, this.archethicClient, this.#config.seed)
  }
  
  getRandomAccount(): Account {
    const seed = Crypto.randomSecretKey()
    const chainAddress = Crypto.deriveAddress(seed)
    return new Account(Utils.uint8ArrayToHex(chainAddress), ConnectionType.Direct, this.archethicClient, Utils.uint8ArrayToHex(seed))
  }

  async deployContract(account: Account, additionalData?: DeployTxDataOpt): Promise<string> {
    const contractTx = await getDeployContractTx(account, { additionalData: additionalData , upgradeAddress: this.#config.upgradeAddress })
    const { transactionAddress } = await account.sendTransaction(contractTx)
    return transactionAddress;
  }

  async updateContract(account: Account, contractAddress: string, additionalData?: DeployTxDataOpt): Promise<string> {
    const contractTx = await getUpgradeContractTx(account, contractAddress, { additionalData: additionalData, upgradeAddress: this.#config.upgradeAddress })
    const { transactionAddress } = await account.sendTransaction(contractTx)
    return transactionAddress;
  }
}