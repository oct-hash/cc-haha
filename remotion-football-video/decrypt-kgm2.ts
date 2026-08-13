import KgmCryptoModule from "@xhacker/kgmwasm";
import QmcCryptoModule from "@xhacker/qmcwasm";

async function tryDecrypt(
  moduleName: string,
  initFn: () => Promise<any>,
  inputPath: string,
  outputPath: string,
  extensions: string[],
) {
  const file = Bun.file(inputPath);
  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  for (const ext of extensions) {
    console.log(`[${moduleName}] Trying extension: ${ext}`);
    try {
      const decryptor = await initFn();
      const preDecSize = Math.min(0x200000, fileBuffer.length);
      const blobPtr = decryptor._malloc(preDecSize);
      decryptor.writeArrayToMemory(
        fileBuffer.slice(0, preDecSize),
        blobPtr,
      );

      const status = decryptor.preDec(blobPtr, preDecSize, ext);
      decryptor._free(blobPtr);

      if (status !== 0) {
        console.log(`  preDec failed with status ${status}`);
        continue;
      }

      console.log(`  preDec succeeded! Decrypting...`);

      // Decrypt the entire file
      const CHUNK_SIZE = 0x100000;
      const result = new Uint8Array(fileBuffer.length);

      for (let offset = 0; offset < fileBuffer.length; offset += CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, fileBuffer.length - offset);
        const chunkPtr = decryptor._malloc(chunkSize);
        decryptor.writeArrayToMemory(
          fileBuffer.slice(offset, offset + chunkSize),
          chunkPtr,
        );
        decryptor.decBlob(chunkPtr, chunkSize, offset);
        result.set(
          decryptor.HEAPU8.slice(chunkPtr, chunkPtr + chunkSize),
          offset,
        );
        decryptor._free(chunkPtr);
      }

      await Bun.write(outputPath, result);
      console.log(`  Saved to ${outputPath}`);
      return true;
    } catch (e) {
      console.log(`  Error: ${e}`);
    }
  }
  return false;
}

// Try both KGM and QMC with various extensions
const extensions = ["mp3", "flac", "ogg", "wav", "m4a", "wma", "ape", "aac"];

console.log("=== Trying KGM WASM ===");
const kgmResult = await tryDecrypt(
  "KGM",
  KgmCryptoModule,
  "public/song.flac",
  "public/song-decrypted.flac",
  extensions,
);

if (!kgmResult) {
  console.log("\n=== Trying QMC WASM ===");
  await tryDecrypt(
    "QMC",
    QmcCryptoModule,
    "public/song.flac",
    "public/song-decrypted.flac",
    extensions,
  );
}
