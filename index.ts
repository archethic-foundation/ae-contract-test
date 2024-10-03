import { AccountContext } from "./account";
import { getConfig } from "./config";

export * from "./contract_factory";
export * from "./types"
export * from "./account"
export * from "./deployment"

export async function getContext(): Promise<AccountContext> {
  const config = await getConfig()
  return await AccountContext.fromConfig(config)
}