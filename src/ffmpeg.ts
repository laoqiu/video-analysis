import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const COMMAND_TIMEOUT_MS = 15_000;
const TRANSFORM_TIMEOUT_MS = 5 * 60_000;

function candidates(configuredPath: string): string[] {
  const value = configuredPath.trim();
  return value ? [value, path.join(value, "ffmpeg"), path.join(value, "ffmpeg.exe")] : ["ffmpeg"];
}

export async function resolveFfmpeg(configuredPath: string): Promise<string> {
  for (const candidate of candidates(configuredPath)) {
    if (candidate !== "ffmpeg") {
      try { if ((await fs.stat(candidate)).isDirectory()) continue; } catch { continue; }
    }
    try {
      await execFile(candidate, ["-version"], { windowsHide: true, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
      return candidate;
    } catch { /* Try the next candidate. */ }
  }
  throw new Error("FFmpeg 无法运行，请配置有效的 ffmpeg 可执行文件路径");
}

export async function extractAudio(ffmpegPath: string, videoPath: string, audioPath: string): Promise<void> {
  try {
    await execFile(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", videoPath, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", "-y", audioPath], { windowsHide: true, timeout: TRANSFORM_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
  } catch (error) {
    const detail = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "").trim() : "";
    throw new Error(`音频提取失败${detail ? `：${detail.slice(0, 240)}` : ""}`);
  }
}
