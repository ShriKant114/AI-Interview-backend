// ---------------- Imports ----------------
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool, createAgent } from "langchain";
import { z } from "zod";

// ---------------- App Config ----------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // serve frontend if needed

// ---------------- Tool: Analyze Intro ----------------
const analyzeIntro = tool(
  ({ intro }) => {
    const lower = intro.toLowerCase();
    return JSON.stringify({
      project: lower.includes("project"),
      skill: lower.includes("skill"),
      achievement: lower.includes("achieve"),
      internship: lower.includes("intern"),
      work: lower.includes("experience") || lower.includes("job"),
    });
  },
  {
    name: "analyze_intro",
    description: "Analyze intro for keywords",
    schema: z.object({ intro: z.string() }),
  }
);

// ---------------- LangChain Agent ----------------
const agent = createAgent({
  model: new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY,
  }),
  tools: [analyzeIntro],
});

// ---------------- Helpers ----------------
const unrelatedKeywords = [
  "chat",
  "game",
  "fun",
  "something else",
  "not interview",
  "joke",
  "random",
];

function checkUnrelated(text) {
  return unrelatedKeywords.some((k) => text.toLowerCase().includes(k));
}

// ---------------- Conversation Memory ----------------
let conversationHistory = [
  {
    role: "system",
    content:
      "You are an interviewer. Ask natural, context-aware follow-up questions. Avoid repeating yourself. Keep tone professional and concise.",
  },
];

// ---------------- AI Follow-Up Generator ----------------
async function generateFollowUps(userMessage) {
  // Add user message to memory
  conversationHistory.push({ role: "user", content: userMessage || "Let's start the interview." });

  // Generate next question
  const res = await agent.invoke({ messages: conversationHistory });
  const aiReply = res.messages?.[res.messages.length - 1]?.content ?? "Can you elaborate?";

  // Save AI reply to memory
  conversationHistory.push({ role: "assistant", content: aiReply });

  return aiReply;
}

// ---------------- API Endpoints ----------------
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || checkUnrelated(message)) {
      return res.json({
        reply:
          "Hi Shrikant are ypu redy to ypu interview",
        history: conversationHistory,
      });
    }

    const reply = await generateFollowUps(message);
    res.json({ reply, history: conversationHistory });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ reply: "Error processing your request." });
  }
});

// ---------------- Feedback Endpoint ----------------
app.get("/feedback", (req, res) => {
  // Return all Q&A in order
  // Filter out system messages
  const qaHistory = conversationHistory.filter(
    (msg) => msg.role === "user" || msg.role === "assistant"
  );
  res.json({ history: qaHistory });
});


// ---------------- Reset Endpoint ----------------
app.post("/reset", (req, res) => {
  conversationHistory = [
    {
      role: "system",
      content:
        "You are an interviewer. Ask natural, context-aware follow-up questions. Avoid repeating yourself. Keep tone professional and concise.",
    },
  ];
  res.json({ message: "Interview reset successfully." });
});

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
