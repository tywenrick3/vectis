import {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getEnv } from "./config";
import { createLogger } from "./logger";

const log = createLogger("shared:r2");

let _s3: S3Client | null = null;

export function getR2Client(): S3Client {
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

export async function deleteFromR2(key: string): Promise<void> {
  const env = getEnv();
  const s3 = getR2Client();

  log.info({ key }, "Deleting from R2");
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
}

export async function deleteFromR2Batch(
  keys: string[]
): Promise<{ deleted: number; errors: string[] }> {
  if (keys.length === 0) return { deleted: 0, errors: [] };

  const env = getEnv();
  const s3 = getR2Client();
  let totalDeleted = 0;
  const allErrors: string[] = [];

  // S3 DeleteObjects accepts max 1000 keys per call
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    log.info({ count: chunk.length, offset: i }, "Batch deleting from R2");

    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: env.R2_BUCKET_NAME,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );

    totalDeleted += chunk.length - (result.Errors?.length ?? 0);
    if (result.Errors) {
      for (const err of result.Errors) {
        allErrors.push(err.Key ?? "unknown");
      }
    }
  }

  log.info({ totalDeleted, errors: allErrors.length }, "Batch delete complete");
  return { deleted: totalDeleted, errors: allErrors };
}

export async function* listR2Objects(
  prefix?: string
): AsyncGenerator<string, void, undefined> {
  const env = getEnv();
  const s3 = getR2Client();
  let continuationToken: string | undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    if (result.Contents) {
      for (const obj of result.Contents) {
        if (obj.Key) yield obj.Key;
      }
    }

    continuationToken = result.IsTruncated
      ? result.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

export function r2KeyFromUrl(url: string): string {
  const env = getEnv();
  const prefix = env.R2_PUBLIC_URL.replace(/\/+$/, "") + "/";
  if (!url.startsWith(prefix)) {
    throw new Error(`URL does not match R2_PUBLIC_URL: ${url}`);
  }
  return url.slice(prefix.length);
}
