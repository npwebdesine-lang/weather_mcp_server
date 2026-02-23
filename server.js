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

// מילון ששומר את החיבורים הפעילים
const transports = new Map();

// --- התיקון הקריטי: מפעל לייצור שרתי MCP ---
// כל חיבור יקבל מופע (Instance) חדש ופרטי של השרת
function createSessionServer() {
  const server = new McpServer({
    name: "Weather Service",
    version: "1.0.0",
  });

  server.tool(
    "get_weather",
    "Provides real-time weather information globally. Must use for any city.",
    {
      city: z
        .string()
        .describe("City name in English (e.g., 'Moscow', 'Tel Aviv')"),
    },
    async ({ city }) => {
      console.log(`>>> [MCP] Executing tool for: ${city}`);
      return {
        content: [
          {
            type: "text",
            text: `מזג האוויר ב${city}: ☀️ שמשי ונעים, 25 מעלות.`,
          },
        ],
      };
    },
  );

  return server;
}

app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection request...");

  // 1. יצירת צינור תקשורת חדש
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  // 2. יצירת "מכשיר" MCP פרטי לחיבור הזה
  const sessionServer = createSessionServer();

  // 3. ניקוי הזיכרון כשהמשתמש מתנתק
  req.on("close", () => {
    console.log(`>>> [SSE] Connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  try {
    // 4. חיבור הצינור ל"מכשיר" הפרטי (לא יזרוק יותר שגיאת 'Already connected')
    await sessionServer.connect(transport);
    console.log(`>>> [SSE] Session ${transport.sessionId} fully established.`);
  } catch (error) {
    console.error(">>> [SSE] Failed to connect:", error.message);
  }
});

app.post("/messages", async (req, res) => {
  // הספריה של MCP שולחת את מזהה החיבור בשורת הכתובת
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
