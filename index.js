// index.js (REWRITE - STABLE)
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

// Health check for Render
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
  const txt = isAdmin(ctx.from?.id)
    ? "Admin buyruqlar:\n/myid\n/vacancy_new\n/vacancy_list\n/vacancy_delete\n/question_delete_last\n\nNomzodlar: /start"
    : "Ariza topshirish: /start";
  await ctx.reply(txt);
});

bot.command("myid", async (ctx) => {
  await ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`);
});

// Admin commands as real commands (more reliable than text matching)
bot.command("vacancy_new", async (ctx) => handleAdminCommands(ctx));
bot.command("vacancy_list", async (ctx) => handleAdminCommands(ctx));
bot.command("vacancy_delete", async (ctx) => handleAdminCommands(ctx));
bot.command("question_delete_last", async (ctx) => handleAdminCommands(ctx));

// ===== Text messages router (FSM + candidate answers) =====
bot.on("message:text", async (ctx) => {
  // 1) Admin states (vacancy create/delete/ask)
  await handleAdminMessages(ctx);

  // 2) Admin question builder states (add question text/options)
  await handleAdminQuestionText(ctx);

  // 3) Candidate answers
  await handleCandidateMessages(ctx);
});

// ===== Callbacks (inline buttons) =====
bot.on("callback_query:data", async (ctx) => {
  // Admin callbacks
  await handleAdminCallbacks(ctx);

  // Candidate callbacks
  await handleCandidateCallbacks(ctx);
});

bot.catch((err) => console.error("BOT ERROR:", err));

console.log("Bot starting...");
bot.start();
