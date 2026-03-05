// index.js (PREMIUM STABLE v2)
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
   Render healthcheck
========================= */
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
  })
  .listen(process.env.PORT || 3000);

/* =========================
   DB ping on startup
========================= */
await q("select 1");

/* =========================
   Basic commands
========================= */
bot.command("start", async (ctx) => startCandidate(ctx));

bot.command("help", async (ctx) => {
  const txt = isAdmin(ctx.from?.id)
    ? "Admin:\n/admin\n/myid\n/vacancy_new\n/vacancy_list\n/apps_new\n/apps_all\n\nNomzodlar: /start"
    : "Ariza topshirish: /start";
  await ctx.reply(txt);
});

bot.command("myid", async (ctx) => {
  await ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`);
});

/* =========================
   Admin commands (as true commands)
========================= */
bot.command("admin", async (ctx) => handleAdminCommands(ctx));
bot.command("vacancy_new", async (ctx) => handleAdminCommands(ctx));
bot.command("vacancy_list", async (ctx) => handleAdminCommands(ctx));
bot.command("apps_new", async (ctx) => handleAdminCommands(ctx));
bot.command("apps_all", async (ctx) => handleAdminCommands(ctx));

/* =========================
   Messages router
========================= */
bot.on("message", async (ctx) => {
  const text = (ctx.message?.text || "").trim();
  const cmd = text ? text.split(" ")[0].split("@")[0] : "";

  // 1) typed admin commands (reliable even if user types, not clicks)
  if (
    cmd === "/admin" ||
    cmd === "/vacancy_new" ||
    cmd === "/vacancy_list" ||
    cmd === "/apps_new" ||
    cmd === "/apps_all"
  ) {
    await handleAdminCommands(ctx);
    return;
  }

  // 2) admin FSM (create vacancy / edit / ask candidate)
  await handleAdminMessages(ctx);

  // 3) candidate flow (text + contact inside)
  await handleCandidateMessages(ctx);
});

/* =========================
   Callbacks (inline buttons)
========================= */
bot.on("callback_query:data", async (ctx) => {
  // IMPORTANT: admin first
  await handleAdminCallbacks(ctx);
  await handleCandidateCallbacks(ctx);
});

bot.catch((err) => console.error("BOT ERROR:", err));

console.log("Bot starting...");
bot.start();
