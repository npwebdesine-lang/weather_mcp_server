import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const app = express();

// --- תיקון קריטי: מחקנו את app.use(express.json()) ---
// זה מה שגרם לשגיאת "stream is not readable". ה-SDK מטפל בזה לבד.

app.use(cors());

const mcpServer = new McpServer({
  name: "Weather Service",
  description: "A service that provides weather information.",
  version: "1.0.0",
});

mcpServer.tool(
  "get_weather",
  "Provides current weather information for a specific city. Use this tool whenever the user asks about temperature, rain, forecast, or climate conditions.",
  {
    city: z.string().describe("The name of the city (e.g., Tel Aviv, London)"),
  },
  async ({ city }) => {
    console.log(`>>> [MCP] Handling request for: ${city}`);
    return {
      content: [
        {
          type: "text",
          text: `מזג האוויר ב${city}: ☀️ שמשי ונעים, 25 מעלות. (נשלף בהצלחה משרת ה-MCP!)`,
        },
      ],
    };
  },
);

let globalTransport = null;

app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection established");
  globalTransport = new SSEServerTransport("/messages", res);
  await mcpServer.connect(globalTransport);
});

app.post("/messages", async (req, res) => {
  if (globalTransport) {
    // כאן ה-MCP קורא את הזרם (Stream) בעצמו.
    // בגלל שמחקנו את express.json(), הזרם פנוי וקריא, והשגיאה תיעלם.
    await globalTransport.handlePostMessage(req, res);
  } else {
    console.log("!!! [POST] No active transport found");
    res.status(503).send("No active connection");
  }
});

app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${port}`);

  // מנגנון Keep-Alive
  const myUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  setInterval(() => {
    fetch(`${myUrl}/healthz`).catch(() => {});
  }, 300000);
});
