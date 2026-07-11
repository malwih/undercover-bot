import { EmbedBuilder, PermissionsBitField } from "discord.js";

const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "";
const RULES_CHANNEL_ID =
  process.env.ANTI_SELL_RULES_CHANNEL_ID || process.env.RULES_CHANNEL_ID || "";
const LOG_CHANNEL_ID = process.env.ANTI_SELL_LOG_CHANNEL_ID || "";
const PUBLIC_WARNING_ENABLED =
  String(process.env.ANTI_SELL_PUBLIC_WARNING_ENABLED || "true").toLowerCase() !==
  "false";

const ENABLED =
  String(process.env.ANTI_SELL_ENABLED || "true").toLowerCase() !== "false";
const DM_COOLDOWN_MS = Math.max(
  0,
  Number(process.env.ANTI_SELL_DM_COOLDOWN_MINUTES || 5) * 60 * 1000
);

const EXEMPT_CHANNEL_IDS = new Set(
  String(process.env.ANTI_SELL_EXEMPT_CHANNEL_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const EXEMPT_CATEGORY_IDS = new Set(
  String(process.env.ANTI_SELL_EXEMPT_CATEGORY_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const lastDmAt = new Map();

function normalizeText(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.+:/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(input) {
  return normalizeText(input).replace(/[^a-z0-9]/g, "");
}

function deobfuscateCompactText(input) {
  const replacements = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
  };

  return compactText(input).replace(/[013457]/g, (char) => replacements[char] || char);
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

const SALE_ACTION_PATTERNS = [
  /\b(?:jual|jualan|jualin|menjual|dijual|menjajakan)\b/i,
  /\b(?:open\s*(?:order|po)|buka\s*(?:order|po))\b/i,
  /\b(?:for\s*sale|want\s*to\s*sell|wts)\b/i,
  /\b(?:ready\s*(?:stock|stok)|stok\s*ready)\b/i,
];

const SOLICITATION_PATTERNS = [
  /\b(?:ada|siapa|dimana)\s+(?:yang\s+)?jual\b/i,
  /\b(?:cari|butuh|need)\s+(?:seller|penjual)\b/i,
  /\b(?:seller|penjual)\s+(?:mana|dm|pm|pc)\b/i,
];

const PRODUCT_PATTERNS = [
  /\brobux\b/i,
  /\brbx\b/i,
  /\b(?:akun|account|acc)\b/i,
  /\broblox\b/i,
  /\b(?:item|limited|pet|skin|gamepass|game\s*pass)\b/i,
  /\b(?:nitro|server\s*boost|boost)\b/i,
  /\b(?:voucher|top\s*up|diamond|coin|credit)\b/i,
  /\b(?:jasa|joki|script|asset|map)\b/i,
  /\b(?:sepatu|baju|hoodie|kaos|makanan|minuman|barang)\b/i,
];

const PRICE_PATTERNS = [
  /\b(?:harga|rate|nego|nett|net)\b/i,
  /\b(?:rp|idr)\s*\d+/i,
  /\b\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta)\b/i,
  /\b\d+\s*\/\s*(?:1k|1000)\b/i,
];

const CONTACT_PATTERNS = [
  /\b(?:dm|pm|pc|japri|inbox|chat)\s*(?:me|aku|saya|gan|bang|kak)?\b/i,
  /\b(?:wa|whatsapp|telegram|tele|line)\b/i,
  /\b(?:minat|berminat|ambil|order)\s*(?:dm|pm|pc|chat|wa)?\b/i,
  /(?:wa\.me\/|t\.me\/|discord\.gg\/)/i,
  /\b(?:08\d{8,12}|62\d{9,13})\b/i,
];

const PROMO_PATTERNS = [
  /\b(?:murah|termurah|promo|diskon|trusted|aman|fast|cepat)\b/i,
  /\b(?:stok|stock|ready|tersedia|available)\b/i,
  /\b(?:garansi|testi|testimoni|rekber)\b/i,
];

const PAYMENT_PATTERNS = [
  /\b(?:dana|gopay|ovo|seabank|bca|bri|mandiri|transfer|qris)\b/i,
];

const NEGATION_OR_RULE_PATTERNS = [
  /\b(?:dilarang|jangan|tidak\s+boleh|tak\s+boleh|ga\s+boleh|gak\s+boleh|nggak\s+boleh|stop)\b.{0,28}\b(?:jual|jualan|menjual)\b/i,
  /\b(?:jual|jualan|menjual)\b.{0,28}\b(?:dilarang|tidak\s+boleh|ga\s+boleh|gak\s+boleh|nggak\s+boleh)\b/i,
  /\b(?:aturan|rules?)\b.{0,35}\b(?:jual|jualan|menjual)\b/i,
];

function analyzeSellingMessage(content) {
  const text = normalizeText(content);
  const compact = compactText(content);
  const deobfuscatedCompact = deobfuscateCompactText(content);

  if (!text || text.length < 3) {
    return { isSelling: false, score: 0, reasons: [] };
  }

  const deobfuscatedSaleWord =
    deobfuscatedCompact.includes("jual") ||
    deobfuscatedCompact.includes("wts") ||
    deobfuscatedCompact.includes("forsale");

  const hasSaleAction =
    containsAny(text, SALE_ACTION_PATTERNS) || deobfuscatedSaleWord;
  const hasSolicitation = containsAny(text, SOLICITATION_PATTERNS);
  const hasProduct =
    containsAny(text, PRODUCT_PATTERNS) ||
    [
      "robux",
      "rbx",
      "akun",
      "account",
      "roblox",
      "gamepass",
      "nitro",
      "voucher",
      "topup",
      "joki",
      "script",
      "asset",
    ].some((keyword) => deobfuscatedCompact.includes(keyword));
  const hasPrice = containsAny(text, PRICE_PATTERNS);
  const hasContact = containsAny(text, CONTACT_PATTERNS);
  const hasPromo = containsAny(text, PROMO_PATTERNS);
  const hasPayment = containsAny(text, PAYMENT_PATTERNS);
  const looksLikeRuleDiscussion = containsAny(text, NEGATION_OR_RULE_PATTERNS);

  let score = 0;
  const reasons = [];

  if (hasSaleAction) {
    score += 2;
    reasons.push("kata penawaran/jualan");
  }

  if (hasSolicitation) {
    score += 3;
    reasons.push("mencari penjual");
  }

  if (hasProduct) {
    score += 2;
    reasons.push("produk/jasa");
  }

  if (hasPrice) {
    score += 2;
    reasons.push("harga/rate");
  }

  if (hasContact) {
    score += 2;
    reasons.push("ajakan kontak/transaksi");
  }

  if (hasPromo) {
    score += 1;
    reasons.push("bahasa promosi");
  }

  if (hasPayment) {
    score += 1;
    reasons.push("metode pembayaran");
  }

  // Pola tanpa kata "jual", contoh: "Robux 80/1k, minat DM".
  const implicitOffer = hasProduct && hasPrice && (hasContact || hasPromo || hasPayment);

  // Pola jualan umum, contoh: "jual sepatu 50k, DM".
  const explicitOffer =
    hasSaleAction &&
    (hasProduct || hasPrice || hasContact || hasPromo || hasPayment) &&
    score >= 5;

  const solicitation = hasSolicitation && hasProduct && score >= 5;

  if (looksLikeRuleDiscussion && !hasPrice && !hasContact && !hasPayment) {
    return { isSelling: false, score, reasons: ["konteks aturan/larangan"] };
  }

  return {
    isSelling: implicitOffer || explicitOffer || solicitation,
    score,
    reasons,
  };
}

function isExemptMember(member) {
  if (!member) return false;

  if (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) {
    return true;
  }

  return Boolean(STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID));
}

function isExemptChannel(message) {
  if (EXEMPT_CHANNEL_IDS.has(message.channelId)) return true;

  const parentId = message.channel?.parentId || null;
  return Boolean(parentId && EXEMPT_CATEGORY_IDS.has(parentId));
}

function shouldSendDm(userId) {
  const now = Date.now();
  const previous = lastDmAt.get(userId) || 0;

  if (DM_COOLDOWN_MS > 0 && now - previous < DM_COOLDOWN_MS) {
    return false;
  }

  lastDmAt.set(userId, now);
  return true;
}

function trimText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function sanitizePreview(value) {
  return String(value || "")
    .replace(/@everyone/gi, "＠everyone")
    .replace(/@here/gi, "＠here")
    .replace(/<@&\d+>/g, "[mention role]")
    .replace(/<@!?\d+>/g, "[mention pengguna]")
    .replace(/```/g, "` ` `")
    .replace(/\s+/g, " ")
    .trim();
}

function getMessagePreview(message) {
  const text = sanitizePreview(message.content);
  const attachmentCount = message.attachments?.size || 0;

  if (text) {
    const attachmentNote = attachmentCount > 0
      ? `\n\nLampiran: ${attachmentCount} file`
      : "";
    return trimText(`${text}${attachmentNote}`, 700);
  }

  if (attachmentCount > 0) {
    return `Pesan tanpa teks dengan ${attachmentCount} lampiran.`;
  }

  return "(Pesan tidak memiliki teks yang dapat ditampilkan.)";
}

async function sendPublicWarning(message) {
  if (!PUBLIC_WARNING_ENABLED || !message.channel?.isTextBased()) return false;

  const rulesUrl = RULES_CHANNEL_ID
    ? `https://discord.com/channels/${message.guild.id}/${RULES_CHANNEL_ID}`
    : null;

  const rulesText = rulesUrl
    ? `[Baca aturan di #rules-server](${rulesUrl})`
    : "Baca dan patuhi channel **#rules-server**.";

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("⛔ DILARANG KERAS BERJUALAN DI SERVER INI")
    .setDescription(
      `Pesan milik <@${message.author.id}> telah **dihapus otomatis** karena terindikasi melakukan promosi atau transaksi jual-beli.\n\n` +
        "Server ini **bukan tempat berjualan** Robux, akun Roblox, item, jasa, maupun produk apa pun."
    )
    .addFields(
      {
        name: "Preview pesan yang dihapus",
        value: `> ${getMessagePreview(message).replace(/\n/g, "\n> ")}`,
      },
      {
        name: "Wajib dilakukan",
        value: `${rulesText} Jangan mengirim ulang, menyamarkan, atau memindahkan promosi ke channel lain.`,
      },
      {
        name: "⚠️ PERINGATAN TERAKHIR",
        value:
          "Apabila pelanggaran terus diulangi, **Owner berhak melakukan banned permanen dari server tanpa peringatan tambahan**.",
      }
    )
    .setFooter({ text: "UNDERCOVER • Sistem Moderasi Anti-Selling" })
    .setTimestamp();

  try {
    await message.channel.send({
      content: `<@${message.author.id}>`,
      embeds: [embed],
      allowedMentions: {
        parse: [],
        users: [message.author.id],
        repliedUser: false,
      },
    });
    return true;
  } catch (error) {
    console.warn(
      `[ANTI-SELL] Gagal mengirim peringatan publik di #${message.channel?.name || message.channelId}:`,
      error?.message || error
    );
    return false;
  }
}

async function sendWarningDm(message) {
  if (!shouldSendDm(message.author.id)) return true;

  const rulesUrl = RULES_CHANNEL_ID
    ? `https://discord.com/channels/${message.guild.id}/${RULES_CHANNEL_ID}`
    : null;

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Pesan dihapus — Dilarang jualan")
    .setDescription(
      `Halo **${message.author.username}**, pesan kamu di server **${message.guild.name}** telah dihapus karena terindikasi menawarkan, mempromosikan, atau mencari transaksi jual-beli.\n\n` +
        "Dilarang menjual Robux, akun Roblox, item, jasa, maupun produk lain di channel server ini."
    )
    .addFields({
      name: "Yang harus dilakukan",
      value: rulesUrl
        ? `Silakan baca dan patuhi [channel rules-server](${rulesUrl}) sebelum mengirim pesan lagi.`
        : "Silakan baca dan patuhi channel **#rules-server** sebelum mengirim pesan lagi.",
    })
    .setFooter({ text: "Pesan ini dikirim otomatis oleh sistem moderasi." })
    .setTimestamp();

  try {
    await message.author.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.warn(
      `[ANTI-SELL] Gagal DM ${message.author.tag}:`,
      error?.message || error
    );
    return false;
  }
}

async function sendModerationLog(client, message, result, dmSent, deleted) {
  if (!LOG_CHANNEL_ID) return;

  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(deleted ? 0xed4245 : 0xfee75c)
    .setTitle(deleted ? "Anti-Selling: pesan dihapus" : "Anti-Selling: gagal menghapus")
    .addFields(
      {
        name: "Pengguna",
        value: `${message.author.tag} (${message.author.id})`,
        inline: true,
      },
      {
        name: "Channel",
        value: `<#${message.channelId}>`,
        inline: true,
      },
      {
        name: "DM",
        value: dmSent ? "Terkirim" : "Gagal/tidak dikirim",
        inline: true,
      },
      {
        name: "Indikator",
        value: trimText(result.reasons.join(", ") || "Tidak diketahui", 1024),
      },
      {
        name: "Isi pesan",
        value: trimText(message.content || "(tanpa teks)", 1024),
      }
    )
    .setTimestamp();

  await logChannel
    .send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch((error) => {
      console.warn("[ANTI-SELL] Gagal mengirim log:", error?.message || error);
    });
}

export function setupAntiSelling(client) {
  if (!ENABLED) {
    console.log("🛡️ Anti-Selling dinonaktifkan melalui ANTI_SELL_ENABLED=false");
    return;
  }

  if (!RULES_CHANNEL_ID) {
    console.warn(
      "[ANTI-SELL] RULES_CHANNEL_ID belum diisi. DM tetap dikirim tanpa link channel."
    );
  }

  client.on("messageCreate", async (message) => {
    try {
      if (!message.inGuild() || message.author.bot || message.webhookId) return;
      if (isExemptChannel(message)) return;

      let member = message.member;
      if (!member) {
        member = await message.guild.members.fetch(message.author.id).catch(() => null);
      }

      if (isExemptMember(member)) return;

      const result = analyzeSellingMessage(message.content);
      if (!result.isSelling) return;

      const deleted = await message
        .delete()
        .then(() => true)
        .catch((error) => {
          console.error(
            `[ANTI-SELL] Gagal menghapus pesan ${message.id} di #${message.channel?.name || message.channelId}:`,
            error?.message || error
          );
          return false;
        });

      const publicWarningSent = deleted
        ? await sendPublicWarning(message)
        : false;
      const dmSent = await sendWarningDm(message);
      await sendModerationLog(client, message, result, dmSent, deleted);

      console.log(
        `[ANTI-SELL] ${deleted ? "Deleted" : "Detected"} message from ${message.author.tag} ` +
          `in #${message.channel?.name || message.channelId} (score ${result.score}, ` +
          `public warning: ${publicWarningSent ? "sent" : "not sent"})`
      );
    } catch (error) {
      console.error("[ANTI-SELL] messageCreate error:", error);
    }
  });

  console.log("🛡️ Anti-Selling moderation aktif");
}

export { analyzeSellingMessage };
