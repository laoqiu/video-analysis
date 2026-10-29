import fs from "node:fs/promises";
import path from "node:path";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { ReadResourceResult } from "@modelcontextprotocol/server";

export const CONFIG_RESOURCE_URI = "ui://video-analysis/configuration";

export async function configurationResource(): Promise<ReadResourceResult> {
  const html = await fs.readFile(path.join(import.meta.dirname, "..", "mcp-app.html"), "utf8");
  return {
    contents: [{
      uri: CONFIG_RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: html,
    }],
  };
}
