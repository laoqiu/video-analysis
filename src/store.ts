import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AnalysisConfig, TranscriptRecord } from "./types.js";

function dataDirectory(): string {
  const configured = process.env.VIDEO_ANALYSIS_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "genagent-video-analysis");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "genagent-video-analysis");
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "genagent-video-analysis");
}

export class AnalysisStore {
  readonly root: string;
  private readonly db: Database.Database;

  constructor(root = dataDirectory()) {
    this.root = root;
    fs.mkdirSync(root, { recursive: true });
    this.db = new Database(path.join(root, "analysis.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS transcripts (
        video_id TEXT PRIMARY KEY, local_path TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'video', duration_ms INTEGER NOT NULL DEFAULT 0,
        source_url TEXT NOT NULL DEFAULT '', transcript TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
        error TEXT, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS transcripts_status_idx ON transcripts(status);
    `);
  }

  getConfig(): AnalysisConfig {
    const rows = this.db.prepare("SELECT key, value FROM config").all() as Array<{ key: string; value: string }>;
    const values = new Map(rows.map((row) => [row.key, row.value]));
    return { ffmpegPath: values.get("ffmpegPath") ?? "", volcengineApiKey: values.get("volcengineApiKey") ?? "" };
  }

  setConfig(patch: Partial<AnalysisConfig>): AnalysisConfig {
    const now = Date.now();
    const statement = this.db.prepare("INSERT INTO config(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
    const transaction = this.db.transaction(() => {
      for (const [key, value] of Object.entries(patch)) if (typeof value === "string") statement.run(key, value, now);
    });
    transaction();
    return this.getConfig();
  }

  findTranscript(videoId: string): TranscriptRecord | undefined {
    const row = this.db.prepare("SELECT * FROM transcripts WHERE video_id = ?").get(videoId) as Record<string, unknown> | undefined;
    return row ? this.mapTranscript(row) : undefined;
  }

  saveTranscript(record: TranscriptRecord): void {
    this.db.prepare(`
      INSERT INTO transcripts(video_id, local_path, title, author, type, duration_ms, source_url, transcript, status, error, updated_at)
      VALUES (@videoId, @localPath, @title, @author, @type, @durationMs, @sourceUrl, @transcript, @status, @error, @updatedAt)
      ON CONFLICT(video_id) DO UPDATE SET local_path=excluded.local_path, title=excluded.title, author=excluded.author,
        type=excluded.type, duration_ms=excluded.duration_ms, source_url=excluded.source_url, transcript=excluded.transcript,
        status=excluded.status, error=excluded.error, updated_at=excluded.updated_at
    `).run({
      videoId: record.id, localPath: record.localPath, title: record.title ?? "", author: record.author ?? "",
      type: record.type ?? "video", durationMs: record.durationMs ?? 0, sourceUrl: record.sourceUrl ?? "",
      transcript: record.transcript, status: record.status, error: record.error ?? null, updatedAt: record.updatedAt,
    });
  }

  listTranscripts(): TranscriptRecord[] {
    const rows = this.db.prepare("SELECT * FROM transcripts ORDER BY updated_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapTranscript(row));
  }

  close(): void { this.db.close(); }

  private mapTranscript(row: Record<string, unknown>): TranscriptRecord {
    return {
      id: String(row.video_id ?? ""), localPath: String(row.local_path ?? ""), title: String(row.title ?? ""),
      author: String(row.author ?? ""), type: row.type === "image-text" ? "image-text" : "video",
      durationMs: Number(row.duration_ms ?? 0), sourceUrl: String(row.source_url ?? ""), transcript: String(row.transcript ?? ""),
      status: row.status === "completed" || row.status === "processing" || row.status === "error" ? row.status : "pending",
      error: row.error ? String(row.error) : undefined, updatedAt: String(row.updated_at ?? ""),
    };
  }
}

export const analysisStore = new AnalysisStore();
