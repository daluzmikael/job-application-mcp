#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerJobSearchTools } from "./tools/job-search.js";
import { registerResumeTools } from "./tools/resume.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerTrackingTools } from "./tools/tracking.js";

const server = new McpServer({
  name: "job-application-mcp",
  version: "0.1.0",
});

registerJobSearchTools(server);
registerResumeTools(server);
registerAnalysisTools(server);
registerTrackingTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("job-application-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting job-application-mcp:", err);
  process.exit(1);
});
