// ייבוא ספריות נדרשות:
// express - להקמת שרת הווב ב-Node.js
// cors - מאפשר ללקוחות מדומיינים אחרים לגשת לשרת
// McpServer - מחלקת הליבה של פרוטוקול MCP להגדרת שרת כלים
// SSEServerTransport - מנהל תעבורת הנתונים בשיטת Server-Sent Events (חיבור רציף)
// z (Zod) - ספרייה לאימות הגדרת סכימות של נתונים (עבור הפרמטרים של הכלים)
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// תפיסת שגיאות ברמת התהליך (Process) כדי למנוע קריסה מוחלטת של השרת במקרה של שגיאה שלא נתפסה בקוד
process.on("uncaughtException", (error) =>
  console.error("Prevented Crash:", error),
);
process.on("unhandledRejection", (reason) =>
  console.error("Prevented Crash:", reason),
);

// יצירת מופע של שרת Express והגדרת זמינות לבקשות רשת חיצוניות (CORS)
const app = express();
app.use(cors());

// מילון ששומר את החיבורים הפעילים
// המפתח הוא מזהה החיבור (sessionId) והערך הוא אובייקט החיבור (transport)
const transports = new Map();

// --- התיקון הקריטי: מפעל לייצור שרתי MCP ---
// כל חיבור יקבל מופע (Instance) חדש ופרטי של השרת
function createSessionServer() {
  // אתחול אובייקט ה-MCP עם שם המערכת וגרסה
  const server = new McpServer({
    name: "Weather Service",
    version: "1.0.0",
  });

  // הגדרת כלי (Tool) בשרת ה-MCP שהלקוח (כדוגמת מודל השפה) יכול להפעיל
  server.tool(
    "get_weather",
    "Provides real-time weather information globally. Must use for any city.",
    {
      // הגדרת הפרמטרים שהמודל חייב לספק - כאן נדרשת מחרוזת המייצגת את שם העיר
      city: z
        .string()
        .describe("City name in English (e.g., 'Moscow', 'Tel Aviv')"),
    },
    // הפונקציה האסינכרונית שתרוץ בפועל כאשר המודל יחליט להפעיל את הכלי
    async ({ city }) => {
      console.log(`>>> [MCP] Executing tool for: ${city}`);
      // החזרת תשובה בפורמט שהפרוטוקול דורש (מערך של אלמנטים מסוג טקסט)
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

// נקודת קצה ליצירת חיבור SSE פתוח. הלקוח מתחבר לכאן פעם אחת והערוץ נשאר פתוח להעברת נתונים
app.get("/sse", async (req, res) => {
  console.log(">>> [SSE] New connection request...");

  // 1. יצירת צינור תקשורת חדש
  // הפרמטר "/messages" מורה ללקוח שזה הנתיב אליו הוא צריך לשלוח את בקשות ה-POST שלו
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  // 2. יצירת "מכשיר" MCP פרטי לחיבור הזה
  const sessionServer = createSessionServer();

  // 3. ניקוי הזיכרון כשהמשתמש מתנתק
  req.on("close", () => {
    console.log(`>>> [SSE] Connection closed: ${transport.sessionId}`);
    // הסרת החיבור ממילון החיבורים הפעילים כדי למנוע דליפת זיכרון
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

// נקודת קצה המקבלת את הבקשות (הפעולות) מהלקוח עבור חיבור קיים
app.post("/messages", async (req, res) => {
  // הספריה של MCP שולחת את מזהה החיבור בשורת הכתובת
  const sessionId = req.query.sessionId;
  // משיכת החיבור המקורי מהמילון לפי המזהה שהתקבל
  const transport = transports.get(sessionId);

  if (!transport) {
    console.log("!!! [POST] No active transport for session:", sessionId);
    // אם החיבור נסגר או לא קיים, נחזיר שגיאת שירות לא זמין
    res.status(503).send("No active connection");
    return;
  }

  try {
    // העברת תכולת הבקשה ישירות למנהל התקשורת (ה-Transport) כדי שיפענח ויעביר ל-MCP הרלוונטי
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("!!! [POST] Error:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

// נקודת קצה המשמשת כ"דופק" (Health Check) לשירותי ענן כדי לוודא שהשרת פעיל (מחזירה 'OK')
app.get("/healthz", (req, res) => res.status(200).send("OK"));

// הגדרת הפורט עליו ירוץ השרת (לוקח פורט מוגדר ממשתנה סביבה, או 3000 כברירת מחדל)
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${port}`);

  // מנגנון מניעת הירדמות: שירותים כמו Render מרדימים שרתים בחינם אחרי 15 דקות ללא פעילות
  const myUrl =
    process.env.RENDER_EXTERNAL_URL ||
    "https://weather-mcp-server-e3bs.onrender.com";
  // הפעלת טיימר הפונה לשרת עצמו (לנתיב החינדרוש /healthz) כל 8 דקות (480,000 מילי-שניות)
  setInterval(async () => {
    try {
      await fetch(`${myUrl}/healthz`);
    } catch (e) {}
  }, 480000);
});
