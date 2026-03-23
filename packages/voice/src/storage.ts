import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getEnv, createLogger } from "@vectis/shared";

const log = createLogger("voice:storage");

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    const env = getEnv();
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _s3;
}

export async function uploadToR2(
  body: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const env = getEnv();
  const s3 = getS3();

  log.info({ key, size: body.length }, "Uploading to R2");

  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = `${env.R2_PUBLIC_URL}/${key}`;
  log.info({ url }, "Upload complete");
  return url;
}
