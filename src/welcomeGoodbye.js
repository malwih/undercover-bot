import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  ChannelType,
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from "discord.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";

// ========= PATH =========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========= REGISTER FONTS =========
const regularFontPath = path.join(__dirname, "..", "assets/fonts/Poppins-Regular.ttf");
const boldFontPath = path.join(__dirname, "..", "assets/fonts/Poppins-Bold.ttf");

const regularRegistered = GlobalFonts.registerFromPath(regularFontPath, "Poppins");
const boldRegistered = GlobalFonts.registerFromPath(boldFontPath, "Poppins Bold");

console.log("Font registered:", {
  regularFontPath,
  boldFontPath,
  regularRegistered,
  boldRegistered,
  families: GlobalFonts.families,
});

// ========= CONFIG =========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const GOODBYE_CHANNEL_ID = process.env.GOODBYE_CHANNEL_ID;

const ORDER_CHANNEL_ID = process.env.ORDER_CHANNEL_ID;
const MAP_CHANNEL_ID = process.env.MAP_CHANNEL_ID;
const COMMUNITY_CHANNEL_ID = process.env.COMMUNITY_CHANNEL_ID;
const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID;

const SERVER_NAME = process.env.SERVER_NAME || "UNDERCOVER";

const WELCOME_BG_URL =
  process.env.WELCOME_BG_URL ||
  "https://i.ibb.co.com/WJ6WwCp/fcc366e7-6a39-4fcd-a85a-6163b7ac3796.png";

const GOODBYE_BG_URL =
  process.env.GOODBYE_BG_URL ||
  "https://i.ibb.co.com/WJ6WwCp/fcc366e7-6a39-4fcd-a85a-6163b7ac3796.png";

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!WELCOME_CHANNEL_ID) throw new Error("Missing WELCOME_CHANNEL_ID");
if (!GOODBYE_CHANNEL_ID) throw new Error("Missing GOODBYE_CHANNEL_ID");
if (!MAP_CHANNEL_ID) throw new Error("Missing MAP_CHANNEL_ID");
if (!COMMUNITY_CHANNEL_ID) throw new Error("Missing COMMUNITY_CHANNEL_ID");


let client;


// ========= HELPERS =========
function getFontFamily(weight = "regular") {
  return weight === "bold" ? '"Poppins Bold"' : '"Poppins"';
}

function fitText(ctx, text, maxWidth, startSize = 68, minSize = 18, weight = "bold") {
  let size = startSize;
  const family = getFontFamily(weight);

  while (size >= minSize) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }

  return minSize;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function sanitizeUsername(name) {
  return String(name || "Unknown User")
    .replace(/[`*_~|>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

async function safeLoadBackground(url, width, height) {
  try {
    return await loadImage(url);
  } catch (error) {
    console.warn("Failed to load background, using fallback:", error?.message || error);

    const fallback = createCanvas(width, height);
    const ctx = fallback.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(0.5, "#13293d");
    grad.addColorStop(1, "#111827");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    return fallback;
  }
}

async function safeLoadAvatar(avatarUrl, size = 256) {
  try {
    return await loadImage(avatarUrl);
  } catch (error) {
    console.warn("Failed to load avatar, using fallback:", error?.message || error);

    const fallback = createCanvas(size, size);
    const ctx = fallback.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "#334155");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `96px ${getFontFamily("bold")}`;
    ctx.fillText("?", size / 2, size / 2 + 6);

    return fallback;
  }
}

function drawBadge(ctx, text, x, y, fill = "rgba(255,255,255,0.12)") {
  ctx.save();
  ctx.font = `22px ${getFontFamily("bold")}`;

  const paddingX = 18;
  const boxH = 44;
  const textWidth = ctx.measureText(text).width;
  const boxW = textWidth + paddingX * 2;

  ctx.fillStyle = fill;
  roundRect(ctx, x, y, boxW, boxH, 14);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + paddingX, y + boxH / 2 + 1);
  ctx.restore();
}

function drawCenteredText(ctx, text, x, y, options = {}) {
  const {
    font = `60px ${getFontFamily("bold")}`,
    fillStyle = "#ffffff",
    strokeStyle = "rgba(0,0,0,0.65)",
    lineWidth = 8,
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.fillStyle = fillStyle;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

async function createCard({ username, avatarUrl, mode = "welcome" }) {
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  console.log("Rendering card:", { username, mode });

  const bgUrl = mode === "welcome" ? WELCOME_BG_URL : GOODBYE_BG_URL;
  const accent = mode === "welcome" ? "#22c55e" : "#ef4444";
  const titleText = mode === "welcome" ? "WELCOME" : "GOODBYE";

  // Background
  const bg = await safeLoadBackground(bgUrl, width, height);
  ctx.drawImage(bg, 0, 0, width, height);

  // Dark overlay
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(0,0,0,0.20)");
  overlay.addColorStop(0.55, "rgba(0,0,0,0.35)");
  overlay.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  // Vignette
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    100,
    width / 2,
    height / 2,
    760
  );
  vignette.addColorStop(0, "rgba(255,255,255,0.03)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Frame
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  roundRect(ctx, 28, 28, width - 56, height - 56, 28);
  ctx.stroke();
  ctx.restore();

  // Badge
  drawBadge(
    ctx,
    mode === "welcome" ? "NEW MEMBER" : "MEMBER LEFT",
    55,
    50,
    mode === "welcome"
      ? "rgba(34,197,94,0.18)"
      : "rgba(239,68,68,0.18)"
  );

  // Server name
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `38px ${getFontFamily("bold")}`;
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.fillText(SERVER_NAME, width / 2, 55);
  ctx.restore();

  // Avatar
  const avatar = await safeLoadAvatar(avatarUrl, 512);
  const avatarSize = 220;
  const avatarX = width / 2 - avatarSize / 2;
  const avatarY = 130;
  const avatarCenterX = width / 2;
  const avatarCenterY = avatarY + avatarSize / 2;

  // Avatar glow
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 45;
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fill();
  ctx.restore();

  // Avatar circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  // Avatar border
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();

  // Main title
  drawCenteredText(ctx, titleText, width / 2, 470, {
    font: `96px ${getFontFamily("bold")}`,
    fillStyle: "#ffffff",
    strokeStyle: "rgba(0,0,0,0.75)",
    lineWidth: 12,
  });

  // Username
  const safeName = sanitizeUsername(username);
  const usernameFont = fitText(ctx, safeName, 860, 58, 22, "bold");

  drawCenteredText(ctx, safeName, width / 2, 550, {
    font: `${usernameFont}px ${getFontFamily("bold")}`,
    fillStyle: "#f8fafc",
    strokeStyle: "rgba(0,0,0,0.75)",
    lineWidth: 8,
  });

  // Accent line
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 170, 595);
  ctx.lineTo(width / 2 + 170, 595);
  ctx.stroke();
  ctx.restore();

  // Sub text
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `28px ${getFontFamily("regular")}`;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fillText(
    mode === "welcome"
      ? `Senang kamu bergabung di ${SERVER_NAME}!`
      : `Terima kasih sudah pernah bergabung di ${SERVER_NAME}!`,
    width / 2,
    645
  );
  ctx.restore();

  return canvas.encode("png");
}

function getRulesChannelMention(guild) {
  if (RULES_CHANNEL_ID) return `<#${RULES_CHANNEL_ID}>`;

  const cachedRulesChannel = guild?.channels?.cache?.find(
    (channel) =>
      (channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement) &&
      channel.name?.toLowerCase() === "rules-server"
  );

  return cachedRulesChannel ? `<#${cachedRulesChannel.id}>` : "#rules-server";
}

function buildWelcomeMessage(member) {
  const rulesChannel = getRulesChannelMention(member.guild);

  return [
    `🎉 **Selamat datang di ${SERVER_NAME}** ${member}`,
    "",
    `1️⃣ Wajib baca rules di ${rulesChannel}`,
    `2️⃣ Join Map di <#${MAP_CHANNEL_ID}>`,
    `3️⃣ Join Komunitas di <#${COMMUNITY_CHANNEL_ID}>`,
    "",
  ].join("\n");
}

function buildGoodbyeMessage(user) {
  return [
    `😢 **Selamat tinggal dari ${SERVER_NAME}** <@${user.id}>`,
    "",
    `1️⃣ Terima kasih sudah pernah jadi bagian dari ${SERVER_NAME}`,
    `2️⃣ Semoga next time bisa main bareng lagi di <#${MAP_CHANNEL_ID}>`,
    `3️⃣ Komunitas tetap terbuka di <#${COMMUNITY_CHANNEL_ID}>`,
    "",
  ].join("\n");
}

async function resolveRulesChannel(guild) {
  if (RULES_CHANNEL_ID) {
    return await client.channels.fetch(RULES_CHANNEL_ID).catch((error) => {
      console.warn("Failed to fetch RULES_CHANNEL_ID:", error?.message || error);
      return null;
    });
  }

  await guild.channels.fetch().catch((error) => {
    console.warn("Failed to fetch guild channels for rules-server:", error?.message || error);
  });

  return (
    guild.channels.cache.find(
      (channel) =>
        (channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement) &&
        channel.name?.toLowerCase() === "rules-server"
    ) || null
  );
}

function buildRulesEmbed(guild) {
  const iconURL = guild?.iconURL({ extension: "png", size: 256 });

  const embed = new EmbedBuilder()
    .setColor(0xffd000)
    .setAuthor({
      name: `${SERVER_NAME} • RULES SERVER`,
      iconURL: iconURL || undefined,
    })
    .setTitle("📌 RULES SERVER — WAJIB DIBACA")
    .setDescription(
      [
        `Selamat datang di server discord **${SERVER_NAME}**.`,
        "Server ini dibuat untuk tempat ngobrol, main bareng, dan bangun circle yang rapi. Supaya suasana tetap aman, nyaman, dan tidak berantakan, semua member wajib patuh rules di bawah ini.",
      ].join("\n\n")
    )
    .addFields(
      {
        name: "1️⃣ Jaga Sikap & Saling Respect",
        value:
          "Dilarang toxic berlebihan, menghina, memancing ribut, rasis, atau menyerang member lain. Bercanda boleh, tapi tetap tahu batas.",
      },
      {
        name: "2️⃣ Gunakan Channel Sesuai Fungsi",
        value:
          "Chat, tanya jawab, laporan, dan aktivitas lain wajib ditempatkan di channel yang sesuai. Jangan membuat obrolan penting tenggelam di channel yang salah.",
      },
      {
        name: "3️⃣ Dilarang Spam & Tag Sembarangan",
        value:
          "Jangan spam pesan, emoji, sticker, link, atau mention member/admin tanpa alasan jelas. Tag massal seperti @everyone hanya untuk kebutuhan penting dari admin.",
      },
      {
        name: "4️⃣ Konten Harus Aman & Sopan",
        value:
          "Dilarang kirim konten NSFW, gore, disturbing, ujaran kebencian, atau hal lain yang bisa membuat server tidak nyaman.",
      },
      {
        name: "5️⃣ Privasi Wajib Dijaga",
        value:
          "Jangan menyebarkan data pribadi, chat pribadi, foto, nomor, alamat, akun, atau informasi sensitif milik orang lain tanpa izin.",
      },
      {
        name: "6️⃣ Dilarang Jualan Tanpa Izin Owner",
        value:
          "Tidak boleh promosi, sebar link, open jasa, menawarkan produk, atau jualan apapun di channel mana pun tanpa izin owner. **Nekat jualan tanpa izin owner = BAN dari server.**",
      },
      {
        name: "7️⃣ Ikuti Arahan Admin",
        value:
          "Jika admin menegur, mengarahkan, atau meminta member berhenti melakukan sesuatu, wajib diikuti. Melawan hanya akan memperberat hukuman.",
      },
      {
        name: "8️⃣ Keputusan Owner/Admin Bersifat Final",
        value:
          "Pelanggaran bisa berujung warn, mute, kick, atau ban tergantung tingkat kesalahan. Untuk pelanggaran berat, tindakan bisa langsung diberikan tanpa peringatan.",
      }
    )
    .setFooter({ text: `${SERVER_NAME} • Rules resmi server` })
    .setTimestamp();

  if (iconURL) embed.setThumbnail(iconURL);

  return embed;
}

async function syncRulesEmbed(guild) {
  const channel = await resolveRulesChannel(guild);

  if (!channel) {
    console.warn(
      "Rules channel not found. Set RULES_CHANNEL_ID in .env or create a channel named rules-server."
    );
    return;
  }

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    console.warn(`Invalid rules channel type for ${channel.id}: ${channel.type}`);
    return;
  }

  const permissions = channel.permissionsFor(client.user);
  if (!permissions?.has("ViewChannel") || !permissions?.has("SendMessages")) {
    console.warn(`Missing permission to send rules embed in ${channel.id}`);
    return;
  }

  const payload = {
    content:
      "📌 **Rules resmi server sudah di-update. Baca sampai paham sebelum lanjut aktif di server.**",
    embeds: [buildRulesEmbed(guild)],
  };

  const recentMessages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const oldRulesMessage = recentMessages?.find(
    (message) =>
      message.author?.id === client.user.id &&
      message.embeds?.[0]?.title === "📌 RULES SERVER — WAJIB DIBACA"
  );

  if (oldRulesMessage) {
    await oldRulesMessage.edit(payload);
    console.log(`Rules embed updated in #${channel.name}`);
    return;
  }

  await channel.send(payload);
  console.log(`Rules embed sent in #${channel.name}`);
}

async function sendCard({ channelId, content, username, avatarUrl, mode }) {
  console.log("sendCard called:", { channelId, username, mode });

  const channel = await client.channels.fetch(channelId).catch((err) => {
    console.error("Failed to fetch channel:", channelId, err);
    return null;
  });

  if (!channel) {
    console.warn(`Channel not found: ${channelId}`);
    return;
  }

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    console.warn(`Invalid channel type for ${channelId}: ${channel.type}`);
    return;
  }

  const permissions = channel.permissionsFor(client.user);
  console.log("Bot permissions:", {
    channelId,
    viewChannel: permissions?.has("ViewChannel"),
    sendMessages: permissions?.has("SendMessages"),
    attachFiles: permissions?.has("AttachFiles"),
    embedLinks: permissions?.has("EmbedLinks"),
  });

  const buffer = await createCard({
    username,
    avatarUrl,
    mode,
  });

  const attachment = new AttachmentBuilder(buffer, {
    name: `${mode}-${Date.now()}.png`,
  });

  await channel.send({
    content,
    files: [attachment],
  });
}

// ========= EVENTS =========

export function setupWelcomeGoodbye(discordClient) {
  client = discordClient;
  client.once("ready", async () => {
    console.log("INDEX.JS VERSI BARU KELOAD");
    console.log(`Logged in as ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
      await syncRulesEmbed(guild).catch((error) => {
        console.error("syncRulesEmbed error:", error);
      });
    }
  });

  client.on("guildMemberAdd", async (member) => {
    console.log("MEMBER JOIN DETECTED:", member.user.tag);

    try {
      const username =
        member.user.globalName ||
        member.displayName ||
        member.user.username;

      const avatarUrl = member.user.displayAvatarURL({
        extension: "png",
        size: 512,
        forceStatic: true,
      });

      await sendCard({
        channelId: WELCOME_CHANNEL_ID,
        content: buildWelcomeMessage(member),
        username,
        avatarUrl,
        mode: "welcome",
      });
    } catch (error) {
      console.error("guildMemberAdd error:", error);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    console.log("MEMBER LEAVE DETECTED:", member.user.tag);

    try {
      const username =
        member.user.globalName ||
        member.displayName ||
        member.user.username;

      const avatarUrl = member.user.displayAvatarURL({
        extension: "png",
        size: 512,
        forceStatic: true,
      });

      await sendCard({
        channelId: GOODBYE_CHANNEL_ID,
        content: buildGoodbyeMessage(member.user),
        username,
        avatarUrl,
        mode: "goodbye",
      });
    } catch (error) {
      console.error("guildMemberRemove error:", error);
    }
  });
}
