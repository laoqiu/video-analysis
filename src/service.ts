import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractAudio, resolveFfmpeg } from "./ffmpeg.js";
import { analysisStore } from "./store.js";
import { transcribeAudio } from "./volcengine.js";
import type { AnalysisConfig, AnalysisVideoInput, TranscriptRecord, TranscriptRunResult } from "./types.js";

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export class TranscriptService {
  async checkConfig(config = analysisStore.getConfig()): Promise<{ valid: boolean; ffmpegPath?: string; error?: string; field?: keyof AnalysisConfig }> {
    if (!config.volcengineApiKey.trim()) return { valid: false, field: "volcengineApiKey", error: "请先配置火山引擎语音模型 API Key" };
    try { return { valid: true, ffmpegPath: await resolveFfmpeg(config.ffmpegPath) }; }
    catch (error) { return { valid: false, field: "ffmpegPath", error: errorMessage(error) }; }
  }

  async run(videos: AnalysisVideoInput[], config = analysisStore.getConfig()): Promise<TranscriptRunResult> {
    const checked = await this.checkConfig(config);
    if (!checked.valid || !checked.ffmpegPath) throw new Error(checked.error ?? "文案提取配置无效");
    const items: TranscriptRunResult["items"] = [];
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    for (const video of videos) {
      const existing = analysisStore.findTranscript(video.id);
      if (existing?.status === "completed" && existing.transcript.trim() && existing.localPath === video.localPath) {
        skipped += 1;
        items.push({ id: video.id, title: video.title ?? existing.title, status: "completed", transcript: existing.transcript });
        continue;
      }
      const base: TranscriptRecord = { ...video, title: video.title ?? "无标题视频", transcript: "", status: "processing", updatedAt: new Date().toISOString() };
      analysisStore.saveTranscript(base);
      try {
        if (video.type === "image-text") throw new Error("图文内容不支持提取视频文案");
        const stat = await fs.stat(video.localPath);
        if (!stat.isFile() || stat.size === 0) throw new Error("本地视频文件不存在或为空");
        const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "genagent-video-analysis-"));
        const audioPath = path.join(taskDir, "audio.mp3");
        try {
          await extractAudio(checked.ffmpegPath, video.localPath, audioPath);
          const transcript = await transcribeAudio(config.volcengineApiKey.trim(), audioPath);
          const result: TranscriptRecord = { ...base, transcript: transcript || "（未识别到有效内容）", status: "completed", error: undefined, updatedAt: new Date().toISOString() };
          analysisStore.saveTranscript(result);
          completed += 1;
          items.push({ id: result.id, title: result.title, status: result.status, transcript: result.transcript });
        } finally { await fs.rm(taskDir, { recursive: true, force: true }).catch(() => undefined); }
      } catch (error) {
        const result: TranscriptRecord = { ...base, status: "error", error: errorMessage(error), updatedAt: new Date().toISOString() };
        analysisStore.saveTranscript(result);
        failed += 1;
        items.push({ id: result.id, title: result.title, status: result.status, transcript: "", error: result.error });
      }
    }
    return { total: videos.length, completed, skipped, failed, items };
  }
}

export const transcriptService = new TranscriptService();
