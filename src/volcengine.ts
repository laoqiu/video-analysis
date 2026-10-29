import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

const AUC_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel";
const AUC_RESOURCE_ID = "volc.seedasr.auc";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_COUNT = 100;

function headers(apiKey: string, requestId: string): Record<string, string> {
  return { "Content-Type": "application/json", "X-Api-Key": apiKey, "X-Api-Resource-Id": AUC_RESOURCE_ID, "X-Api-Request-Id": requestId, "X-Api-Sequence": "-1" };
}

function payload(audioData: string) {
  return {
    user: { uid: "genagent-video-analysis" },
    audio: { format: "mp3", codec: "raw", rate: 16000, bits: 16, channel: 1, data: audioData },
    request: { model_name: "bigmodel", enable_itn: true, enable_punc: false, enable_ddc: false, enable_speaker_info: false, enable_channel_split: false, show_utterances: false, vad_segment: false },
  };
}

async function readResponse(response: Response): Promise<{ payload?: unknown; statusCode: string; message: string }> {
  const raw = await response.text();
  let parsed: unknown;
  try { parsed = raw ? JSON.parse(raw) : undefined; } catch { parsed = undefined; }
  const statusCode = response.headers.get("X-Api-Status-Code") ?? "";
  const message = response.headers.get("X-Api-Message") ?? "";
  if (!response.ok) throw new Error(`火山语音请求失败（HTTP ${response.status}）${message || raw.slice(0, 180)}`);
  return { payload: parsed, statusCode, message };
}

function transcriptText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const result = (value as { result?: { text?: unknown; utterances?: Array<{ text?: unknown }> } }).result;
  if (typeof result?.text === "string" && result.text.trim()) return result.text.trim();
  return (result?.utterances ?? []).map((item) => typeof item.text === "string" ? item.text.trim() : "").filter(Boolean).join(" ");
}

export async function transcribeAudio(apiKey: string, audioPath: string): Promise<string> {
  const requestId = randomUUID();
  const audioData = (await fs.readFile(audioPath)).toString("base64");
  const submitted = await readResponse(await fetch(`${AUC_URL}/submit`, { method: "POST", headers: headers(apiKey, requestId), body: JSON.stringify(payload(audioData)) }));
  if (submitted.statusCode !== "20000000") throw new Error(`火山语音提交失败${submitted.message ? `：${submitted.message}` : ""}`);
  for (let attempt = 0; attempt < MAX_POLL_COUNT; attempt += 1) {
    const result = await readResponse(await fetch(`${AUC_URL}/query`, { method: "POST", headers: headers(apiKey, requestId), body: "{}" }));
    if (result.statusCode === "20000000") return transcriptText(result.payload);
    if (result.statusCode !== "20000001" && result.statusCode !== "20000002") throw new Error(`火山语音查询失败${result.message ? `：${result.message}` : ""}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("火山语音识别超时");
}
