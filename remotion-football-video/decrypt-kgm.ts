import KgmCryptoModule from "@xhacker/kgmwasm";

async function decryptKGM(inputPath: string, outputPath: string) {
  const file = Bun.file(inputPath);
  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  // Initialize KGM decryptor
  const kgm = await KgmCryptoModule();

  // Step 1: Prepare decryption with the file header (first 1MB or whole file)
  const preDecSize = Math.min(0x100000, fileBuffer.length);
  const blobPtr = kgm._malloc(preDecSize);
  kgm.writeArrayToMemory(fileBuffer.slice(0, preDecSize), blobPtr);

  const status = kgm.preDec(blobPtr, preDecSize, "flac");
  if (status !== 0) {
    console.error(`preDec failed with status ${status}`);
    kgm._free(blobPtr);
    return;
  }
  kgm._free(blobPtr);

  // Step 2: Decrypt the entire file in chunks
  const CHUNK_SIZE = 0x100000; // 1MB chunks
  const result = new Uint8Array(fileBuffer.length);

  for (let offset = 0; offset < fileBuffer.length; offset += CHUNK_SIZE) {
    const chunkSize = Math.min(CHUNK_SIZE, fileBuffer.length - offset);
    const chunkPtr = kgm._malloc(chunkSize);
    kgm.writeArrayToMemory(
      fileBuffer.slice(offset, offset + chunkSize),
      chunkPtr,
    );
    kgm.decBlob(chunkPtr, chunkSize, offset);
    // Copy decrypted data back
    result.set(kgm.HEAPU8.slice(chunkPtr, chunkPtr + chunkSize), offset);
    kgm._free(chunkPtr);

    if (offset % (CHUNK_SIZE * 5) === 0) {
      console.log(
        `Decrypting... ${((offset / fileBuffer.length) * 100).toFixed(1)}%`,
      );
    }
  }

  await Bun.write(outputPath, result);
  console.log(`Decrypted! Saved to ${outputPath}`);
}

decryptKGM("public/song.flac", "public/song-decrypted.flac");
