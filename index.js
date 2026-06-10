import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";

import { setupOrderRobux } from "./src/orderRobux.js";
import { setupLiveTikTok } from "./src/liveTikTok.js";
import { setupWelcomeGoodbye } from "./src/welcomeGoodbye.js";
import { setupFashionShow } from "./src/fashionShow.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

setupOrderRobux(client);
setupLiveTikTok(client);
setupWelcomeGoodbye(client);
setupFashionShow(client);

client.once("ready", () => {
  console.log(`✅ UNDERCOVER combined bot online: ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
