import express from "express";
import { createServer as createViteServer } from "vite";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const prisma = new PrismaClient();

async function startServer() {
  const app = express();
  const PORT = 3000;

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

      const messages = await prisma.message.findMany({
        where: {
          text: { contains: query, mode: 'insensitive' }
        },
        include: { conversation: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      res.json(messages);
    } catch (error) {
      console.error("Memory search error:", error);
      res.status(500).json({ error: "Failed to search memory" });
    }
  });

  // Get all conversations
  app.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await prisma.conversation.findMany({
        orderBy: { updatedAt: "desc" },
      });
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get a single conversation with messages
  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create a new conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      const { title } = req.body;
      const conversation = await prisma.conversation.create({
        data: { title: title || "New Conversation" },
      });
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Add a message to a conversation
  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const { role, text, isFinal } = req.body;
      const message = await prisma.message.create({
        data: {
          conversationId: req.params.id,
          role,
          text,
          isFinal: isFinal ?? true,
        },
      });
      
      // Update conversation's updatedAt
      await prisma.conversation.update({
        where: { id: req.params.id },
        data: { updatedAt: new Date() },
      });
      
      res.json(message);
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
