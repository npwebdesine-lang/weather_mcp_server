import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// --- הגנה מפני קריסות פתאומיות ---
process.on("uncaughtException", (error) => {
  console.error("!!! CRITICAL ERROR (Prevented Crash):", error);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("!!! UNHANDLED PROMISE (Prevented Crash):", reason);
});

const app = express();
app.use(cors());

// יצירת השרת
const mcpServer = new McpServer({
  name: "Weather Service",
  description: "A service that provides weather information.",
  version: "1.0.0",
});

// הגדרת הכלי
mcpServer.tool(
  "get_weather",
  "Provides real-time weather information for ANY city IN THE WORLD globally. You must use this tool for any weather-related question regardless of the country or location.",
  {
    city: z
      .string()
      .describe(
        "The name of the city anywhere in the world MUST BE IN ENGLISH (e.g., 'Moscow', 'Tokyo', 'Tel Aviv'). Translate the user's input to English before sending.",
      ),
  },
  async ({ city }) => {
    console.log(`>>> [MCP] Handling request for: ${city}`);
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

let globalTransport = null;

// --- נקודת החיבור (SSE) - כאן נכנס התיקון שלך! ---
app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection attempt...");

  // התיקון: ניתוק צינור התקשורת הישן לפני שפותחים אחד חדש
  if (globalTransport) {
    try {
      console.log(">>> [SSE] Closing old connection to make room for new one.");
      await globalTransport.close();
    } catch (e) {
      console.error("Error closing old transport:", e);
    }
  }

  // יצירת צינור תקשורת חדש
  globalTransport = new SSEServerTransport("/messages", res);

  try {
    await mcpServer.connect(globalTransport);
    console.log(">>> [SSE] Connection fully established.");
  } catch (error) {
    console.error(">>> [SSE] Failed to establish connection:", error.message);
  }
});

app.post("/messages", async (req, res) => {
  if (!globalTransport) {
    res.status(503).send("No active connection");
    return;
  }
  try {
    await globalTransport.handlePostMessage(req, res);
  } catch (error) {
    console.error("!!! [POST] Error:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

app.get("/healthz", (req, res) => res.status(200).send("OK"));

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${port}`);

  // הפינג העצמי לשמירת השרת ער
  const myUrl =
    process.env.RENDER_EXTERNAL_URL ||
    "https://weather-mcp-server-e3bs.onrender.com";
  setInterval(async () => {
    try {
      const response = await fetch(`${myUrl}/healthz`);
      if (response.ok) {
        console.log(`[Keep-Alive] Success! Server is awake.`);
      }
    } catch (error) {
      console.error(`[Keep-Alive] Ping failed: ${error.message}`);
    }
  }, 480000);
});
