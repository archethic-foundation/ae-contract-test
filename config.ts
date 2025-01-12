import path from "path"
import { pathToFileURL } from "url";

const CONFIG_FILE: string = "archethic.config.js";

export type Config = {
  endpoint?: string;
  upgradeAddress?: string;
  seed?: string;
}

export async function getConfig(): Promise<Config> {
  const config = await import( pathToFileURL(path.join(process.cwd(), CONFIG_FILE)).href);
  return config.default;
}