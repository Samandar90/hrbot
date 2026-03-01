// index.js
import "dotenv/config";
import { Bot } from "grammy";
import http from "http";
import { q, isAdmin } from "./db.js";

import {
  handleAdminCommands,
  handleAdminMessages,
  handleAdminCallbacks,
  handleAdminQuestionText,
} from "./flows_admin.js";

import {
  startCandidate,
  handleCandidateCallbacks,
  handleCandidateMessages,
} from "./flows_candidate.js";

const bot = new Bot(process.env.BOT_TOKEN);

// Health check for Render (keeps service happy)
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
  })
  .listen(process.env.PORT || 3000);

// DB ping on startup
await q("select 1");

// ===== Commands =====
bot.command("start", async (ctx) => startCandidate(ctx));

bot.command("help", async (ctx) => {
  const txt = isAdmin(ctx.from.id)
    ? "Admin buyruqlar:\n/myid\n/vacancy_new\n/vacancy_list\n/vacancy_delete\n/question_delete_last\n\nNomzodlar: /start"
    : "Ariza topshirish: /start";
  await ctx.reply(txt);
});

bot.command("myid", async (ctx) => {
  await ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`);
});

// ===== Text messages router =====
bot.on("message:text", async (ctx) => {
  const t = (ctx.message.text || "").trim();

  // Admin command handlers
  if (
    t === "/vacancy_new" ||
    t === "/vacancy_list" ||
    t === "/vacancy_delete" ||
    t === "/question_delete_last" ||
    t.startsWith("/vacancy_")
  ) {
    return handleAdminCommands(ctx);
  }

  // Admin interactive flows (adding questions / asking candidate)
  await handleAdminQuestionText(ctx);
  await handleAdminMessages(ctx);

  // Candidate flow (answers)
  await handleCandidateMessages(ctx);
});

// ===== Callbacks (inline buttons) =====
bot.on("callback_query:data", async (ctx) => {
  // Admin callbacks (filters/questions/on/off/ask)
  await handleAdminCallbacks(ctx);

  // Candidate callbacks (vacancy pick / choice answers)
  await handleCandidateCallbacks(ctx);
});

bot.catch((err) => console.error("BOT ERROR:", err));

bot.start();
