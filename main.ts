import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { analysisStore } from "./src/store.js";

async function main(): Promise<void> {
  const server = createServer({ ui: process.argv.includes("--ui") });
  let stopping = false;
  const close = (): void => {
    if (stopping) return;
    stopping = true;
    analysisStore.close();
    void server.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  process.stdin.once("end", close);
  process.stdin.once("close", close);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("[video-analysis] fatal", error);
  process.exitCode = 1;
});
