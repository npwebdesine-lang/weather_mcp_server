import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// 1. הגדרת שרת אינטרנט
const app = express();
app.use(cors()); // חובה!
app.use(express.json());

// 2. יצירת שרת ה-MCP
const mcpServer = new McpServer({
  name: "Weather Service",
  description: "A service that provides weather information.",
  version: "1.0.0",
});

// 3. הגדרת הכלי עם תיאור חכם (כדי ש-OpenAI ידע לבחור בו)
mcpServer.tool(
  "get_weather",
  // >>> התיאור הזה קריטי - הוא מה שהצ'אט קורא כדי להחליט להשתמש בכלי <<<
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
          text: `מזג האוויר ב${city}: ☀️ שמשי ונעים, 24 מעלות. (נשלף בהצלחה משרת ה-MCP לפי התיאור!)`,
        },
      ],
    };
  },
);

// 4. ניהול החיבור (SSE) באמצעות משתנה גלובלי למניעת ניתוקים
let globalTransport = null;

app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection established");

  // הגדרת כותרות SSE סטנדרטיות
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

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

// 5. נקודת ביקורת לבריאות השרת (משמשת גם לפינג העצמי)
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
    console.log(`[KeepAlive] Pinging myself at ${myUrl}/healthz...`);

    fetch(`${myUrl}/healthz`)
      .then((res) => {
        if (res.ok)
          console.log(`[KeepAlive] Ping success! Status: ${res.status}`);
        else console.log(`[KeepAlive] Ping error: ${res.status}`);
      })
      .catch((err) => {
        console.error(`[KeepAlive] Ping failed: ${err.message}`);
      });
  }, 300000); // כל 5 דקות
});
