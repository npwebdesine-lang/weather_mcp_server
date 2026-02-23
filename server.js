import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

process.on("uncaughtException", (error) =>
  console.error("Prevented Crash:", error),
);
process.on("unhandledRejection", (reason) =>
  console.error("Prevented Crash:", reason),
);

const app = express();
app.use(cors());

const mcpServer = new McpServer({
  name: "Weather Service",
  version: "1.0.0",
});

mcpServer.tool(
  "get_weather",
  "Provides real-time weather information globally. Must use for any city.",
  {
    city: z
      .string()
      .describe("City name in English (e.g., 'Moscow', 'Tel Aviv')"),
  },
  async ({ city }) => {
    console.log(`>>> [MCP] Handling request for: ${city}`);
    return {
      content: [
        { type: "text", text: `מזג האוויר ב${city}: ☀️ שמשי ונעים, 25 מעלות.` },
      ],
    };
  },
);

// --- התיקון הגדול: מילון חיבורים במקום משתנה בודד ---
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection established.");

  // ה-SDK מייצר אוטומטית sessionId ייחודי לכל חיבור
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  // מחיקת החיבור הספציפי כשהלקוח מתנתק (למנוע זליגת זיכרון)
  req.on("close", () => {
    console.log(`>>> [SSE] Connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  try {
    await mcpServer.connect(transport);
  } catch (error) {
    console.error(">>> [SSE] Failed to connect:", error.message);
  }
});

app.post("/messages", async (req, res) => {
  // מוצאים את החיבור הספציפי ששלח את הבקשה
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);

  if (!transport) {
    console.log("!!! [POST] No active transport for session:", sessionId);
    res.status(503).send("No active connection");
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("!!! [POST] Error:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

app.get("/healthz", (req, res) => res.status(200).send("OK"));

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${port}`);

  const myUrl =
    process.env.RENDER_EXTERNAL_URL ||
    "https://weather-mcp-server-e3bs.onrender.com";
  setInterval(async () => {
    try {
      await fetch(`${myUrl}/healthz`);
    } catch (e) {}
  }, 480000);
});
