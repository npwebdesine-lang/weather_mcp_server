import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// הגדרת שרת אינטרנט
const app = express();
app.use(cors());
app.use(express.json());

// יצירת שרת ה-MCP
const mcpServer = new McpServer({
  name: "Weather Service",
  description: "A service that provides weather information.",
  version: "1.0.0",
});

// הגדרת הכלי
mcpServer.tool("getWeather", { city: z.string() }, async ({ city }) => {
  console.log(`[MCP] Checking weather for: ${city}`);
  return {
    content: [
      {
        type: "text",
        text: `The current weather in ${city} is sunny (Served via Render HTTP).`,
      },
    ],
  };
});

// ניהול החיבור (SSE)
let transport = null;

app.get("/sse", async (req, res) => {
  console.log("New SSE connection established");
  transport = new SSEServerTransport("/messages", res);
  await mcpServer.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(503).send("No active connection");
  }
});

// נקודת ביקורת לבריאות השרת (משמשת גם לפינג העצמי)
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${port}`);

  // >>> התוספת החדשה: מנגנון למניעת הירדמות (Keep-Alive) <<<

  // Render נותן לנו משתנה סביבה עם הכתובת החיצונית של האתר.
  // אם אנחנו ב-Render נשתמש בכתובת החיצונית, ואם בלוקאל נשתמש ב-localhost.
  const myUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

  // אנחנו מגדירים טיימר שירוץ כל 5 דקות (300,000 מילישניות)
  setInterval(() => {
    console.log(
      `[KeepAlive] Pinging myself at ${myUrl}/healthz to stay awake...`,
    );

    // שליחת בקשת HTTP פשוטה לעצמנו
    fetch(`${myUrl}/healthz`)
      .then((res) => {
        if (res.ok)
          console.log(`[KeepAlive] Ping success! Status: ${res.status}`);
        else console.log(`[KeepAlive] Ping returned error: ${res.status}`);
      })
      .catch((err) => {
        console.error(`[KeepAlive] Ping failed: ${err.message}`);
      });
  }, 300000); // 5 דקות * 60 שניות * 1000 מילישניות
});
