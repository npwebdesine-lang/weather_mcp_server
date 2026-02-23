import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// --- הגנה מפני קריסות (מונע שגיאות 502) ---
process.on("uncaughtException", (error) => {
  console.error("!!! CRITICAL ERROR (Prevented Crash):", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("!!! UNHANDLED PROMISE (Prevented Crash):", reason);
});

const app = express();

// שמרנו על התיקון הקודם: בלי express.json()!
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
    // החזרת תשובה מדמה
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

// משתנה לניהול החיבור
let globalTransport = null;

app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection attempt...");

  // ניהול ניתוקים ישנים אם יש
  if (globalTransport) {
    try {
      console.log(">>> [SSE] Closing old connection to make room for new one.");
      // כאן יכולה להיות לוגיקה לניתוק, אבל ה-SDK מנהל את זה לרוב
    } catch (e) {
      console.error("Error clearing old transport:", e);
    }
  }

  globalTransport = new SSEServerTransport("/messages", res);
  await mcpServer.connect(globalTransport);
  console.log(">>> [SSE] Connection fully established.");
});

app.post("/messages", async (req, res) => {
  if (!globalTransport) {
    console.log("!!! [POST] Received message but no SSE connection exists.");
    res.status(503).send("No active connection");
    return;
  }

  try {
    // עוטפים ב-try/catch כדי ששגיאת קריאה לא תקריס את השרת
    await globalTransport.handlePostMessage(req, res);
  } catch (error) {
    console.error("!!! [POST] Error handling message:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// ... (שאר הקוד של השרת נשאר בדיוק אותו דבר)

// 5. נקודת ביקורת לבריאות השרת (חובה בשביל הפינג)
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${port}`);

  // >>> מנגנון Keep-Alive משודרג <<<
  // הכנסתי את הכתובת שלך ישירות כגיבוי למקרה שמשתנה הסביבה ריק
  const myUrl =
    process.env.RENDER_EXTERNAL_URL ||
    "https://weather-mcp-server-e3bs.onrender.com";

  // נריץ את הפינג כל 8 דקות (480,000 מילישניות) - רנדר נרדם אחרי 15 דקות
  setInterval(async () => {
    try {
      console.log(`[Keep-Alive] Waking up server... Pinging ${myUrl}/healthz`);
      const response = await fetch(`${myUrl}/healthz`);

      if (response.ok) {
        console.log(
          `[Keep-Alive] Success! Server is awake (Status: ${response.status})`,
        );
      } else {
        console.error(
          `[Keep-Alive] Warning: Received status ${response.status}`,
        );
      }
    } catch (error) {
      console.error(`[Keep-Alive] Ping failed: ${error.message}`);
    }
  }, 480000);
});
