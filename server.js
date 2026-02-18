import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// 1. הגדרת שרת אינטרנט
const app = express();
app.use(cors());
app.use(express.json());

// 2. יצירת שרת ה-MCP
const mcpServer = new McpServer({
  name: "Weather Service",
  description: "A service that provides weather information.",
  version: "1.0.0",
});

// 3. הגדרת הכלי
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
          text: `מזג האוויר ב${city}: ☀️ שמשי ונעים, 24 מעלות. (נשלף בהצלחה משרת ה-MCP!)`,
        },
      ],
    };
  },
);

// 4. ניהול החיבור (SSE)
let globalTransport = null;

app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection established");

  // --- תיקון: הסרנו את res.writeHead הידני שגרם לקריסה ---
  // ה-SDK של ה-MCP מבצע את זה בעצמו בתוך ה-connect.

  globalTransport = new SSEServerTransport("/messages", res);
  await mcpServer.connect(globalTransport);
});

app.post("/messages", async (req, res) => {
  if (globalTransport) {
    await globalTransport.handlePostMessage(req, res);
  } else {
    console.log("!!! [POST] No active transport found");
    res.status(503).send("No active connection");
  }
});

// 5. נקודת ביקורת לבריאות השרת
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// 6. הרצת השרת + מנגנון מניעת הירדמות
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${port}`);

  // >>> מנגנון Keep-Alive למניעת הירדמות ב-Render <<<
  const myUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

  setInterval(() => {
    // פינג עצמי שקט כדי לא להציף את הלוגים יותר מדי, נדפיס רק אם יש שגיאה
    fetch(`${myUrl}/healthz`)
      .then((res) => {
        if (!res.ok) console.error(`[KeepAlive] Ping error: ${res.status}`);
      })
      .catch((err) => {
        console.error(`[KeepAlive] Ping failed: ${err.message}`);
      });
  }, 300000); // כל 5 דקות
});
