// index.js (PRO - STABLE, MATCHES NEW flows_admin.js)
import "dotenv/config";
import { Bot } from "grammy";
import http from "http";
import { q, isAdmin } from "./db.js";

import {
  handleAdminCommands,
  handleAdminMessages,
  handleAdminCallbacks,
} from "./flows_admin.js";

import {
  startCandidate,
  handleCandidateCallbacks,
  handleCandidateMessages,
} from "./flows_candidate.js";

const bot = new Bot(process.env.BOT_TOKEN);

/* =========================
   Health check for Render
========================= */
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
  })
  .listen(process.env.PORT || 3000);

/* =========================
   Startup DB ping
========================= */
await q("select 1");

/* =========================
   Commands
========================= */
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

// Admin commands (as real commands)
bot.command("vacancy_new", async (ctx) => handleAdminCommands(ctx));
bot.command("vacancy_list", async (ctx) => handleAdminCommands(ctx));
bot.command("vacancy_delete", async (ctx) => handleAdminCommands(ctx));
bot.command("question_delete_last", async (ctx) => handleAdminCommands(ctx));

/* =========================
   Text router (FSM)
========================= */
bot.on("message:text", async (ctx) => {
  const t = (ctx.message.text || "").trim();

  // If admin writes command as text (or with @botname) - support it too
  const cmd = t.split(" ")[0].split("@")[0];

  if (
    cmd === "/vacancy_new" ||
    cmd === "/vacancy_list" ||
    cmd === "/vacancy_delete" ||
    cmd === "/question_delete_last"
  ) {
    await handleAdminCommands(ctx);
    return;
  }

  // 1) Admin FSM (create/delete/questions/ask candidate)
  await handleAdminMessages(ctx);

  // 2) Candidate FSM (age + answers)
  await handleCandidateMessages(ctx);
});

/* =========================
   Callbacks
========================= */
bot.on("callback_query:data", async (ctx) => {
  // Admin callbacks first (filters/questions/on/off/ask/menu)
  await handleAdminCallbacks(ctx);

  // Candidate callbacks (vacancy pick / answers / filters)
  await handleCandidateCallbacks(ctx);
});

bot.catch((err) => console.error("BOT ERROR:", err));

console.log("Bot starting...");
bot.start();
