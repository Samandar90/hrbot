// index.js (FINAL)
import "dotenv/config";
import { Bot } from "grammy";
import http from "http";
import { q } from "./db.js";

import {
  startCandidate,
  handleCandidateCallbacks,
  handleCandidateMessages,
} from "./flows_candidate.js";
import {
  adminStart,
  handleAdminCallbacks,
  handleAdminMessages,
} from "./flows_admin.js";

const bot = new Bot(process.env.BOT_TOKEN);

// Render healthcheck
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
  })
  .listen(process.env.PORT || 3000);

// DB ping
await q("select 1");

// Commands
bot.command("start", async (ctx) => startCandidate(ctx));
bot.command("admin", async (ctx) => adminStart(ctx));
bot.command("myid", async (ctx) =>
  ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`),
);

bot.on("message:text", async (ctx) => {
  await handleAdminMessages(ctx);
  await handleCandidateMessages(ctx);
});

bot.on("message:contact", async (ctx) => {
  await handleCandidateMessages(ctx);
});

bot.on("callback_query:data", async (ctx) => {
  // admin first (so admin buttons work in admin chats)
  await handleAdminCallbacks(ctx);
  // then candidate
  await handleCandidateCallbacks(ctx);
});

bot.catch((err) => console.error("BOT ERROR:", err));

console.log("Bot starting...");
bot.start();
