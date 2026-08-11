/**
 * Social feed video → H.264 MP4 for fast playback. Original is not pinned.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../../logger.js';

/** Max clip length after encode (matches app `POST_VIDEO_MAX_SECONDS`). */
export const POST_VIDEO_MAX_SECONDS = 120;
/** Reject uploads larger than this before encode. */
export const POST_VIDEO_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
/** Encoded output ceiling — what we pin to Lighthouse. */
export const POST_VIDEO_MAX_ENCODED_BYTES = 50 * 1024 * 1024;

export class VideoEncodeError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'VideoEncodeError';
  }
}

function run(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 32_000) stderr = stderr.slice(-32_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

async function probeDurationSeconds(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffprobe timed out'));
    }, 30_000);
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new VideoEncodeError(
            400,
            stderr.trim() || 'Could not read that video file.'
          )
        );
        return;
      }
      const duration = Number.parseFloat(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new VideoEncodeError(400, 'Could not read that video file.'));
        return;
      }
      resolve(duration);
    });
  });
}

function videoBitrateKbps(durationSeconds: number): number {
  const maxBits = POST_VIDEO_MAX_ENCODED_BYTES * 8;
  const audioBits = 128_000 * durationSeconds;
  const videoBits = Math.max(400_000, maxBits - audioBits);
  const kbps = Math.floor(videoBits / durationSeconds / 1000);
  return Math.min(2800, Math.max(600, kbps));
}

async function ffmpegEncode(
  inputPath: string,
  outputPath: string,
  videoKbps: number
): Promise<void> {
  const args = [
    '-y',
    '-i',
    inputPath,
    '-t',
    String(POST_VIDEO_MAX_SECONDS),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    `${videoKbps}k`,
    '-maxrate',
    `${videoKbps}k`,
    '-bufsize',
    `${videoKbps * 2}k`,
    '-vf',
    "scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease",
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    outputPath,
  ];
  const { code, stderr } = await run('ffmpeg', args, 300_000);
  if (code !== 0) {
    logger.warn({ stderr: stderr.slice(-2000) }, 'ffmpeg encode failed');
    throw new VideoEncodeError(400, 'Could not process that video.');
  }
}

/**
 * Transcode a feed/scarce clip to H.264 MP4 <= 50MB / 120s.
 * Caller pins only the returned buffer (original is discarded).
 */
export async function encodePostVideo(input: {
  buffer: Buffer;
  mimetype: string;
}): Promise<{ buffer: Buffer; mimetype: string; originalname: string }> {
  if (input.buffer.length > POST_VIDEO_MAX_UPLOAD_BYTES) {
    throw new VideoEncodeError(
      400,
      `Video must be ${Math.round(POST_VIDEO_MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.`
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'onsocial-vid-'));
  const ext = input.mimetype.includes('webm') ? 'webm' : 'mp4';
  const inputPath = join(dir, `in.${ext}`);
  const outputPath = join(dir, 'out.mp4');

  try {
    await writeFile(inputPath, input.buffer);
    const duration = await probeDurationSeconds(inputPath);
    if (duration > POST_VIDEO_MAX_SECONDS + 0.25) {
      throw new VideoEncodeError(
        400,
        `Video must be ${POST_VIDEO_MAX_SECONDS} seconds or shorter.`
      );
    }

    let kbps = videoBitrateKbps(Math.min(duration, POST_VIDEO_MAX_SECONDS));
    await ffmpegEncode(inputPath, outputPath, kbps);
    let out = await readFile(outputPath);

    if (out.length > POST_VIDEO_MAX_ENCODED_BYTES) {
      kbps = Math.max(500, Math.floor(kbps * 0.7));
      await ffmpegEncode(inputPath, outputPath, kbps);
      out = await readFile(outputPath);
    }

    if (out.length > POST_VIDEO_MAX_ENCODED_BYTES) {
      throw new VideoEncodeError(
        400,
        'Video is still too large after processing. Try a shorter clip.'
      );
    }

    logger.info(
      {
        inBytes: input.buffer.length,
        outBytes: out.length,
        durationSec: Math.round(duration * 10) / 10,
        videoKbps: kbps,
      },
      'Post video encoded for feed'
    );

    return {
      buffer: out,
      mimetype: 'video/mp4',
      originalname: 'clip.mp4',
    };
  } catch (error) {
    if (error instanceof VideoEncodeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|ffmpeg|ffprobe/i.test(message)) {
      logger.error({ error }, 'ffmpeg/ffprobe unavailable');
      throw new VideoEncodeError(
        503,
        'Video processing is temporarily unavailable.'
      );
    }
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function isEncodableVideoMime(mime: string): boolean {
  return mime.toLowerCase().startsWith('video/');
}
