export const SUPPORTED_ENCODING_LENGTHS = new Set([128, 512]);

export function isSupportedEncoding(encoding: unknown): encoding is number[] {
  return (
    Array.isArray(encoding) &&
    SUPPORTED_ENCODING_LENGTHS.has(encoding.length) &&
    encoding.every((value) => typeof value === 'number' && Number.isFinite(value))
  );
}

export function getEncodingValidationMessage(fieldName = 'Encoding'): string {
  return `${fieldName} must be an array of 128 or 512 finite numbers`;
}
