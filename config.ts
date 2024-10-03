import path from "path"

const CONFIG_FILE: string = "archethic.config.js";

export type Config = {
  endpoint?: string;
  upgradeAddress?: string;
  seed?: string;
}

export async function getConfig(): Promise<Config> {
  const config = await import(path.join(process.cwd(), CONFIG_FILE));
  return config.default;
}