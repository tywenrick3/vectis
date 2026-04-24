import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, statSync } from "node:fs";
import { getEnv, getR2Client, createLogger } from "@vectis/shared";

const log = createLogger("gameplay:storage");

export async function uploadFileToR2(
  filePath: string,
  key: string,
  contentType = "video/mp4",
): Promise<string> {
  const env = getEnv();
  const s3 = getR2Client();
  const size = statSync(filePath).size;

  log.info({ key, sizeMB: (size / 1024 / 1024).toFixed(1) }, "uploading");

  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: size,
      ContentType: contentType,
    }),
  );

  const url = `${env.R2_PUBLIC_URL}/${key}`;
  log.info({ url }, "upload complete");
  return url;
}
