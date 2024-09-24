export class ResultError extends Error {
  constructor(
    message: string,
    public fileName: string,
    public line: number,
    public column: number,
  ) {
    super(message);
    this.stack = ` Error: ${message}\nat ${fileName}(${line}:${column})`;
  }
}
