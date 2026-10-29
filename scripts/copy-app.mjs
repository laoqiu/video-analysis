import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await copyFile("dist-ui/mcp-app.html", "dist/mcp-app.html");
