import Archethic from "@archethicjs/sdk";

export async function getConnection(endpoint?: string): Promise<Archethic> {
  console.log("Connecting...")
  const archethic = new Archethic(endpoint == "" ? undefined : endpoint);

  if (archethic.endpoint.isRpcAvailable && archethic.rpcWallet !== undefined) {
    const rpcWallet = archethic.rpcWallet
    archethic.rpcWallet.onconnectionstatechange(async (state) => {
      let status = ""
      switch (state) {
        case "WalletRPCConnection_connecting":
          status = "Connecting via wallet";
          break;
        case "WalletRPCConnection_closed":
          status = "Connection closed";
          break;
        case "WalletRPCConnection_open":
          const { endpointUrl } = await rpcWallet.getEndpoint();
          const walletAccount = await rpcWallet.getCurrentAccount();
          status = `Connected at ${endpointUrl} as ${walletAccount.genesisAddress}`
          break;
      }
      console.log(status)
    })
  }

  await archethic.connect();
  if (!archethic.endpoint.isRpcAvailable) {
    console.log(`Connected at ${endpoint}`)
  }

  return archethic
}

export enum ConnectionType {
  Wallet,
  Direct
}
