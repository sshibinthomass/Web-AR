// ponytail: hand-rolled because Node 22 (the CI floor, .github/workflows/deploy-pages.yml)
// has no Uint8Array.prototype.toBase64. Replace the body with
// `new Uint8Array(buffer).toBase64()` once the Node floor reaches 24.
const CHUNK_SIZE = 0x8000;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK_SIZE));
  }
  return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return arrayBufferToBase64(await blob.arrayBuffer());
}
