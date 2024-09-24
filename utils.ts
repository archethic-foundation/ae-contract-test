export function combineNumber(n1: bigint, n2: bigint): bigint {
  return (n1 << 32n) | n2;
}

export function isHex(str: string) {
  return /^[0-9a-fA-F]+$/.test(str);
}

export function toHex(bytes: Uint8Array): string {
  let string = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    string += ('0' + bytes[i].toString(16)).slice(-2);
  }
  return string;
}