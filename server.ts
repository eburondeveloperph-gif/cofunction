import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Auto-create tables on first run
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      is_final BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function startServer() {
  await initDb();

  const app = express();
  const PORT = 3001;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Execute Local CLI command
  app.post("/api/cli", async (req, res) => {
    try {
      const { command } = req.body;
      if (!command) return res.status(400).json({ error: "Command required" });
      
      const { stdout, stderr } = await execAsync(command);
      res.json({ stdout, stderr });
    } catch (error: any) {
      console.error("CLI Error:", error);
      res.status(500).json({ error: error.message, stderr: error.stderr });
    }
  });

  // Search memory (past conversations)
  app.get("/api/memory/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.json([]);

      const { rows } = await pool.query(
        `SELECT m.*, c.title as conversation_title
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.text ILIKE $1
         ORDER BY m.created_at DESC
         LIMIT 10`,
        [`%${query}%`]
      );
      res.json(rows);
    } catch (error) {
      console.error("Memory search error:", error);
      res.status(500).json({ error: "Failed to search memory" });
    }
  });

  // Get all conversations
  app.get("/api/conversations", async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM conversations ORDER BY updated_at DESC`
      );
      res.json(rows);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get a single conversation with messages
  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const { rows: convRows } = await pool.query(
        `SELECT * FROM conversations WHERE id = $1`,
        [req.params.id]
      );
      if (convRows.length === 0) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const { rows: msgRows } = await pool.query(
        `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [req.params.id]
      );
      res.json({ ...convRows[0], messages: msgRows });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create a new conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      const { title } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO conversations (title) VALUES ($1) RETURNING *`,
        [title || "New Conversation"]
      );
      res.json(rows[0]);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Add a message to a conversation
  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const { role, text, isFinal } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO messages (conversation_id, role, text, is_final)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.id, role, text, isFinal ?? true]
      );

      // Update conversation's updated_at
      await pool.query(
        `UPDATE conversations SET updated_at = now() WHERE id = $1`,
        [req.params.id]
      );

      res.json(rows[0]);
    } catch (error) {
      console.error("Error adding message:", error);
      res.status(500).json({ error: "Failed to add message" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
