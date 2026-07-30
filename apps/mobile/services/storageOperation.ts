export const STORAGE_READ_TIMEOUT_MS = 8_000;

type StorageReadOptions = {
  operationName?: string;
  timeoutMs?: number;
};

export class StorageOperationTimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`${operationName}超过 ${timeoutMs}ms 仍未完成。`);
    this.name = "StorageOperationTimeoutError";
  }
}

export function runStorageRead<T>(
  operation: () => Promise<T>,
  options: StorageReadOptions = {}
): Promise<T> {
  const operationName = options.operationName ?? "本地存储读取";
  const timeoutMs = options.timeoutMs ?? STORAGE_READ_TIMEOUT_MS;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new StorageOperationTimeoutError(operationName, timeoutMs));
    }, timeoutMs);

    void Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      );
  });
}
