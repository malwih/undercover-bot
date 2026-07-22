import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  AttachmentBuilder,
} from "discord.js";

// ========= CONFIG =========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const UPDATE_STOCK_CHANNEL_ID = process.env.UPDATE_STOCK_CHANNEL_ID;
const TESTIMONI_CHANNEL_ID = process.env.TESTIMONI_CHANNEL_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const VVIP_ROLE_ID = process.env.VVIP_ROLE_ID || "";
const VVIP_ROLE_NAME = process.env.VVIP_ROLE_NAME || "VVIP";
const EXECUTIVE_ROLE_ID = process.env.EXECUTIVE_ROLE_ID || "";
const EXECUTIVE_ROLE_NAME = process.env.EXECUTIVE_ROLE_NAME || "EXECUTIVE";
const EXECUTIVE_MIN_ORDER_QTY = Number(process.env.EXECUTIVE_MIN_ORDER_QTY || 5000);

const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_GROUP_ID = 819348691;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

const SEABANK_ACCOUNT = process.env.SEABANK_ACCOUNT || "ISI_REKENING";
const SEABANK_NAME = process.env.SEABANK_NAME || "ISI_NAMA_REKENING";

// Midtrans QRIS (Core API)
const MIDTRANS_SERVER_KEY = String(process.env.MIDTRANS_SERVER_KEY || "").trim();
const MIDTRANS_IS_PRODUCTION =
  String(process.env.MIDTRANS_IS_PRODUCTION || "false").trim().toLowerCase() === "true";
const MIDTRANS_BASE_URL = MIDTRANS_IS_PRODUCTION
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";
const MIDTRANS_QRIS_ACQUIRER = String(process.env.MIDTRANS_QRIS_ACQUIRER || "gopay")
  .trim()
  .toLowerCase();
const MIDTRANS_MDR_PERCENT = Number(process.env.MIDTRANS_MDR_PERCENT || 0.7);
const PAYMENT_ROUND_TO = Number(process.env.PAYMENT_ROUND_TO || 1000);
const MIDTRANS_STATUS_POLL_SECONDS = Math.max(
  10,
  Number(process.env.MIDTRANS_STATUS_POLL_SECONDS || 20) || 20
);
const MIDTRANS_WEBHOOK_ENABLED =
  String(process.env.MIDTRANS_WEBHOOK_ENABLED || "true").trim().toLowerCase() !== "false";
const MIDTRANS_WEBHOOK_HOST = String(process.env.MIDTRANS_WEBHOOK_HOST || "0.0.0.0").trim();
const MIDTRANS_WEBHOOK_PORT =
  Number(process.env.MIDTRANS_WEBHOOK_PORT || process.env.PORT || 3000) || 3000;
const MIDTRANS_WEBHOOK_PATH = normalizeWebhookPath(process.env.MIDTRANS_WEBHOOK_PATH || "/midtrans/notification");
const MIDTRANS_NOTIFICATION_URL = String(process.env.MIDTRANS_NOTIFICATION_URL || "").trim();

const ELIGIBLE_DAYS = Number(process.env.ELIGIBLE_DAYS || 14);
const PRICE_PER_1000 = Number(process.env.PRICE_PER_1000 || 100000);
const AUTO_CLOSE_MINUTES = Number(process.env.AUTO_CLOSE_MINUTES || 30);

const STORE_NAME = process.env.STORE_NAME || "UNDERCOVER";
const STORE_FOOTER = process.env.STORE_FOOTER || "UNDERCOVER — Invoice System";
const STOCK_REFRESH_MINUTES = Number(process.env.STOCK_REFRESH_MINUTES || 2);

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!GUILD_ID) throw new Error("Missing GUILD_ID");
if (!PANEL_CHANNEL_ID) throw new Error("Missing PANEL_CHANNEL_ID");
if (!UPDATE_STOCK_CHANNEL_ID) throw new Error("Missing UPDATE_STOCK_CHANNEL_ID");
if (!TESTIMONI_CHANNEL_ID) throw new Error("Missing TESTIMONI_CHANNEL_ID");
if (!TICKET_CATEGORY_ID) throw new Error("Missing TICKET_CATEGORY_ID");
if (!STAFF_ROLE_ID) throw new Error("Missing STAFF_ROLE_ID");
if (!ROBLOX_API_KEY) throw new Error("Missing ROBLOX_API_KEY");
if (!ROBLOX_COOKIE) throw new Error("Missing ROBLOX_COOKIE (.ROBLOSECURITY)");

// ========= STORAGE =========
const DATA_FILE = path.resolve("./orders.json");
const TAG_SETTINGS_FILE = path.resolve("./tag_settings.json");
const ORDER_SETTINGS_FILE = path.resolve("./order_settings.json");

/** @type {Map<string, any>} */
const orders = new Map();

let tagSettings = {
  enabled: true,
  keyword: "UCVR",
};

let orderSettings = {
  open: true,
};

// ========= TAG SETTINGS =========
function normalizeTagKeyword(keyword) {
  return String(keyword || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

function loadTagSettings() {
  try {
    if (!fs.existsSync(TAG_SETTINGS_FILE)) {
      saveTagSettings();
      return;
    }

    const raw = fs.readFileSync(TAG_SETTINGS_FILE, "utf-8");
    const json = JSON.parse(raw);

    tagSettings = {
      enabled: typeof json.enabled === "boolean" ? json.enabled : true,
      keyword: normalizeTagKeyword(json.keyword || "UCVR") || "UCVR",
    };

    saveTagSettings();
  } catch (e) {
    console.error("Failed to load tag_settings.json:", e);
    tagSettings = {
      enabled: true,
      keyword: "UCVR",
    };
    saveTagSettings();
  }
}

function saveTagSettings() {
  try {
    fs.writeFileSync(TAG_SETTINGS_FILE, JSON.stringify(tagSettings, null, 2));
  } catch (e) {
    console.error("Failed to save tag_settings.json:", e);
  }
}

function getTagKeywordUpper() {
  return String(tagSettings.keyword || "UCVR").toUpperCase();
}

function getTagKeywordLower() {
  return String(tagSettings.keyword || "ucvr").toLowerCase();
}

function displayNameHasRequiredTag(displayName) {
  if (!tagSettings.enabled) return true;

  const name = String(displayName || "").toLowerCase();
  const keyword = getTagKeywordLower();

  return name.includes(keyword);
}

// ========= ORDER OPEN/CLOSE SETTINGS =========
function loadOrderSettings() {
  try {
    if (!fs.existsSync(ORDER_SETTINGS_FILE)) {
      saveOrderSettings();
      return;
    }

    const raw = fs.readFileSync(ORDER_SETTINGS_FILE, "utf-8");
    const json = JSON.parse(raw);

    orderSettings = {
      open: typeof json.open === "boolean" ? json.open : true,
    };

    saveOrderSettings();
  } catch (e) {
    console.error("Failed to load order_settings.json:", e);
    orderSettings = { open: true };
    saveOrderSettings();
  }
}

function saveOrderSettings() {
  try {
    fs.writeFileSync(ORDER_SETTINGS_FILE, JSON.stringify(orderSettings, null, 2));
  } catch (e) {
    console.error("Failed to save order_settings.json:", e);
  }
}

function isOrderOpen() {
  return orderSettings.open === true;
}

function buildTagExamples(name = "DisplayName") {
  const tagUpper = getTagKeywordUpper();
  const tagLower = getTagKeywordLower();

  const cleanName =
    String(name || "DisplayName")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "") || "DisplayName";

  return {
    examples: [
      `${tagUpper}_${cleanName}`,
      `${tagUpper}x${cleanName}`,
      `${tagLower}${cleanName}`,
    ],
  };
}

// ========= ORDER CREATION LOCK =========
let orderCreationLock = Promise.resolve();

async function withOrderCreationLock(task) {
  const previousLock = orderCreationLock;

  let releaseCurrentLock;
  orderCreationLock = new Promise((resolve) => {
    releaseCurrentLock = resolve;
  });

  await previousLock;

  try {
    return await task();
  } finally {
    releaseCurrentLock();
  }
}

function loadOrders() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;

    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const arr = JSON.parse(raw);

    if (Array.isArray(arr)) {
      for (const o of arr) {
        normalizeLoadedOrder(o);
        orders.set(o.orderId, o);
      }
    }
  } catch (e) {
    console.error("Failed to load orders.json:", e);
  }
}

function saveOrders() {
  try {
    const arr = Array.from(orders.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error("Failed to save orders.json:", e);
  }
}

function normalizeLoadedOrder(order) {
  if (!order) return;

  if (!order.lastActivityAt) {
    order.lastActivityAt = order.createdAt || nowIso();
  }

  if (typeof order.autoClosePaused !== "boolean") {
    order.autoClosePaused = false;
  }

  const fullyClosedStatuses = ["CLOSED", "CANCELLED", "EXPIRED"];

  if (typeof order.autoCloseEnabled !== "boolean") {
    order.autoCloseEnabled = !fullyClosedStatuses.includes(order.status);
  }

  if (!order.autoCloseDeadlineAt && order.autoCloseEnabled) {
    const base = order.lastActivityAt || order.createdAt || nowIso();

    if (
      order.status === "AWAITING_PAYMENT" ||
      order.status === "AWAITING_PROOF" ||
      order.status === "QRIS_PENDING" ||
      order.status === "DONE" ||
      order.status === "INELIGIBLE"
    ) {
      order.autoCloseDeadlineAt = new Date(
        new Date(base).getTime() + AUTO_CLOSE_MINUTES * 60 * 1000
      ).toISOString();
    }
  }

  if (order.status === "PROOF_SUBMITTED" || order.status === "PAID") {
    order.autoCloseEnabled = false;
    order.autoCloseDeadlineAt = null;
  }

  if (fullyClosedStatuses.includes(order.status)) {
    order.autoCloseEnabled = false;
    order.autoCloseDeadlineAt = null;
  }
}

function newOrderId() {
  const n = Math.floor(10000 + Math.random() * 90000);
  return `T-${n}`;
}

function fmtIDR(n) {
  return new Intl.NumberFormat("id-ID").format(Number(n || 0));
}

function fmtDateID(d) {
  return new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function parseMidtransDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    return new Date(`${raw.replace(" ", "T")}+07:00`);
  }

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function fmtMidtransDateID(value) {
  const parsed = parseMidtransDate(value);
  return parsed ? parsed.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : String(value || "-");
}

function daysBetween(aIso, bIso) {
  const ms = Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime());
  return Math.floor(ms / 86400000);
}

function nowIso() {
  return new Date().toISOString();
}

function isStaff(member) {
  return member?.roles?.cache?.has(STAFF_ROLE_ID);
}

function normalizeDiscordRoleName(name) {
  return String(name || "").trim().toLowerCase();
}

async function resolveDiscordRole(guild, roleId, roleName) {
  const cleanRoleId = String(roleId || "").trim();

  if (cleanRoleId) {
    const roleById = await guild.roles.fetch(cleanRoleId).catch(() => null);
    if (roleById) return roleById;
  }

  const wantedName = normalizeDiscordRoleName(roleName);
  const cachedRole = guild.roles.cache.find(
    (role) => normalizeDiscordRoleName(role.name) === wantedName
  );

  if (cachedRole) return cachedRole;

  const roles = await guild.roles.fetch().catch(() => null);
  return roles?.find((role) => normalizeDiscordRoleName(role.name) === wantedName) || null;
}

function memberHasConfiguredRole(member, targetRole, roleName) {
  if (!member?.roles?.cache) return false;
  if (targetRole?.id && member.roles.cache.has(targetRole.id)) return true;

  const wantedName = normalizeDiscordRoleName(roleName);
  return member.roles.cache.some((role) => normalizeDiscordRoleName(role.name) === wantedName);
}

async function resolveVvipRole(guild) {
  return resolveDiscordRole(guild, VVIP_ROLE_ID, VVIP_ROLE_NAME || "VVIP");
}

async function resolveExecutiveRole(guild) {
  return resolveDiscordRole(guild, EXECUTIVE_ROLE_ID, EXECUTIVE_ROLE_NAME || "Executive");
}

function getOrderRewardTier(order) {
  const qty = Number(order?.qty || 0);
  const executiveMinQty =
    Number.isFinite(EXECUTIVE_MIN_ORDER_QTY) && EXECUTIVE_MIN_ORDER_QTY > 0
      ? EXECUTIVE_MIN_ORDER_QTY
      : 5000;

  return qty >= executiveMinQty ? "EXECUTIVE" : "VVIP";
}

function getRewardRoleDisplayName(tier, role) {
  if (role?.name) return role.name;
  return tier === "EXECUTIVE" ? EXECUTIVE_ROLE_NAME || "Executive" : VVIP_ROLE_NAME || "VVIP";
}

function normalizeWebhookPath(value) {
  const raw = String(value || "/midtrans/notification").trim();
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function computeBaseTotal(qty) {
  const blocks = qty / 1000;
  return Math.round(blocks * PRICE_PER_1000);
}

function computeTotal(qty) {
  const baseTotal = computeBaseTotal(qty);
  const mdrRate = MIDTRANS_MDR_PERCENT / 100;
  const roundTo = Number.isFinite(PAYMENT_ROUND_TO) && PAYMENT_ROUND_TO > 0
    ? Math.floor(PAYMENT_ROUND_TO)
    : 1000;

  if (!Number.isFinite(mdrRate) || mdrRate < 0 || mdrRate >= 1) {
    throw new Error("MIDTRANS_MDR_PERCENT harus berada di rentang 0 sampai kurang dari 100.");
  }

  // Gross-up agar setelah MDR, hasil bersih tidak pernah di bawah PRICE_PER_1000 / 1.000 Robux.
  // Setelah itu SELALU dibulatkan ke atas ke kelipatan PAYMENT_ROUND_TO (default Rp1.000).
  const grossRequired = baseTotal / (1 - mdrRate);
  return Math.ceil(grossRequired / roundTo) * roundTo;
}

function getBankTotal(order) {
  const value = Number(order?.bankTotal ?? order?.baseTotal);
  if (Number.isFinite(value) && value > 0) return Math.round(value);
  return computeBaseTotal(Number(order?.qty || 0));
}

function getQrisTotal(order) {
  const value = Number(order?.qrisTotal);
  if (Number.isFinite(value) && value > 0) return Math.round(value);

  // Backward compatibility untuk order QRIS yang dibuat oleh versi sebelumnya.
  if (order?.paymentMethod === "MIDTRANS_QRIS") {
    const legacyTotal = Number(order?.total);
    if (Number.isFinite(legacyTotal) && legacyTotal > 0) return Math.round(legacyTotal);
  }

  return computeTotal(Number(order?.qty || 0));
}

function isLegacySeaBankOrder(order) {
  return (
    ["AWAITING_PROOF", "PROOF_SUBMITTED"].includes(order?.status) &&
    !order?.midtransOrderId
  );
}

function getPaymentTotal(order) {
  const explicit = Number(order?.paymentAmount);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  // Compatibility untuk order SeaBank dari build sebelumnya yang sempat menyimpan
  // paymentMethod=MIDTRANS_QRIS sebelum customer benar-benar memilih metode.
  if (isLegacySeaBankOrder(order)) return getBankTotal(order);

  if (order?.paymentMethod === "SEABANK_TRANSFER") return getBankTotal(order);
  if (order?.paymentMethod === "MIDTRANS_QRIS") return getQrisTotal(order);

  const legacy = Number(order?.total);
  if (Number.isFinite(legacy) && legacy > 0) return Math.round(legacy);

  return getBankTotal(order);
}

function getPaymentMethodLabel(order) {
  if (isLegacySeaBankOrder(order)) return "Bank Transfer (SeaBank)";
  if (order?.paymentMethod === "MIDTRANS_QRIS") return "QRIS (Midtrans)";
  if (order?.paymentMethod === "SEABANK_TRANSFER") return "Bank Transfer (SeaBank)";
  return "Belum dipilih";
}

function isMidtransConfigured() {
  return Boolean(MIDTRANS_SERVER_KEY);
}

function midtransAuthHeader() {
  return `Basic ${Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64")}`;
}

function findOrderByMidtransOrderId(midtransOrderId) {
  if (!midtransOrderId) return null;
  return Array.from(orders.values()).find((order) => order?.midtransOrderId === midtransOrderId) || null;
}

function buildUniqueMidtransOrderId(order) {
  const internal = String(order.orderId || "ORDER").replace(/[^a-zA-Z0-9_-]/g, "");
  return `UCVR-${internal}-${Date.now()}`.slice(0, 50);
}

async function midtransRequest(endpoint, { method = "GET", body = null, headers = {} } = {}) {
  if (!isMidtransConfigured()) {
    throw new Error("MIDTRANS_SERVER_KEY belum diisi di .env");
  }

  const response = await fetch(`${MIDTRANS_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: midtransAuthHeader(),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { status_message: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    const validation = Array.isArray(json?.validation_messages)
      ? ` | ${json.validation_messages.join("; ")}`
      : "";
    throw new Error(
      `Midtrans HTTP ${response.status}: ${json?.status_message || "Request gagal"}${validation}`
    );
  }

  return json;
}

async function createMidtransQris(order) {
  if (order.midtransOrderId && order.midtransQrisUrl && order.status === "QRIS_PENDING") {
    return {
      order_id: order.midtransOrderId,
      transaction_id: order.midtransTransactionId,
      transaction_status: order.midtransStatus || "pending",
      expiry_time: order.midtransExpiryTime || null,
      actions: [{ name: "generate-qr-code", url: order.midtransQrisUrl }],
    };
  }

  const midtransOrderId = buildUniqueMidtransOrderId(order);
  const qrisTotal = getQrisTotal(order);
  const expiryMinutes = Math.max(15, Math.floor(AUTO_CLOSE_MINUTES || 30));
  const payload = {
    payment_type: "qris",
    transaction_details: {
      order_id: midtransOrderId,
      gross_amount: qrisTotal,
    },
    item_details: [
      {
        id: "ROBUX",
        price: qrisTotal,
        quantity: 1,
        name: `${fmtIDR(order.qty)} Robux - ${STORE_NAME}`.slice(0, 50),
      },
    ],
    qris: {
      acquirer: MIDTRANS_QRIS_ACQUIRER,
    },
    custom_expiry: {
      expiry_duration: expiryMinutes,
      unit: "minute",
    },
    metadata: {
      internal_order_id: order.orderId,
      discord_user_id: order.userId,
      roblox_username: order.robloxUsername,
    },
  };

  const extraHeaders = {};
  if (MIDTRANS_NOTIFICATION_URL) {
    extraHeaders["X-Override-Notification"] = MIDTRANS_NOTIFICATION_URL;
  }

  const response = await midtransRequest("/v2/charge", {
    method: "POST",
    body: payload,
    headers: extraHeaders,
  });

  const qrAction =
    response?.actions?.find((action) => action?.name === "generate-qr-code-v2") ||
    response?.actions?.find((action) => action?.name === "generate-qr-code");

  if (!qrAction?.url) {
    throw new Error("Midtrans tidak mengembalikan URL QRIS.");
  }

  order.midtransOrderId = response.order_id || midtransOrderId;
  order.midtransTransactionId = response.transaction_id || null;
  order.midtransStatus = response.transaction_status || "pending";
  order.midtransQrisUrl = qrAction.url;
  order.midtransExpiryTime = response.expiry_time || null;
  order.midtransCreatedAt = nowIso();
  order.paymentMethod = "MIDTRANS_QRIS";
  order.paymentAmount = qrisTotal;
  order.total = qrisTotal; // backward compatibility: total = nominal metode yang dipilih
  order.status = "QRIS_PENDING";
  orders.set(order.orderId, order);
  saveOrders();

  return response;
}

async function getMidtransStatus(order) {
  if (!order?.midtransOrderId) throw new Error("Order belum mempunyai Midtrans Order ID.");
  return midtransRequest(`/v2/${encodeURIComponent(order.midtransOrderId)}/status`);
}

async function cancelMidtransPending(order) {
  if (!order?.midtransOrderId || !isMidtransConfigured()) return;
  if (!["QRIS_PENDING", "AWAITING_PAYMENT"].includes(order.status)) return;

  try {
    await midtransRequest(`/v2/${encodeURIComponent(order.midtransOrderId)}/cancel`, {
      method: "POST",
    });
  } catch (error) {
    console.warn(`Midtrans cancel ${order.orderId} gagal:`, error?.message || error);
  }
}

function isValidMidtransSignature(payload) {
  if (!MIDTRANS_SERVER_KEY) return false;

  const input = `${payload?.order_id || ""}${payload?.status_code || ""}${payload?.gross_amount || ""}${MIDTRANS_SERVER_KEY}`;
  const expected = crypto.createHash("sha512").update(input).digest("hex");
  const received = String(payload?.signature_key || "").toLowerCase();

  if (!received || received.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

function buildQrisPaymentEmbed(order) {
  const expiry = order.midtransExpiryTime
    ? `${fmtMidtransDateID(order.midtransExpiryTime)} WIB`
    : `sekitar ${AUTO_CLOSE_MINUTES} menit sejak QR dibuat`;

  return new EmbedBuilder()
    .setTitle("💳 Pembayaran QRIS — UNDERCOVER")
    .setDescription(
      [
        `🧾 **Order:** ${order.orderId}`,
        `🎮 **Roblox:** \`${order.robloxUsername}\``,
        `💎 **Jumlah:** ${fmtIDR(order.qty)} Robux`,
        `📌 **Rate:** Rp ${fmtIDR(PRICE_PER_1000)} / 1.000 Robux`,
        "",
        `💰 **Total Pembayaran: Rp ${fmtIDR(getQrisTotal(order))}**`,
        "",
        "📲 Scan QR di bawah menggunakan aplikasi bank/e-wallet yang mendukung QRIS.",
        "✅ Nominal sudah otomatis terisi, jangan ubah nominal pembayaran.",
        `⏳ **Berlaku sampai:** ${expiry}`,
        "",
        "🔄 Status pembayaran akan dicek otomatis. Kamu **tidak perlu kirim bukti transfer**.",
      ].join("\n")
    )
    .setImage(order.midtransQrisUrl)
    .setColor(0x3498db)
    .setFooter({
      text: MIDTRANS_IS_PRODUCTION
        ? "UNDERCOVER — QRIS Midtrans Production"
        : "UNDERCOVER — QRIS Midtrans Sandbox",
    });
}

function buildQrisPaidEmbed(order) {
  return new EmbedBuilder()
    .setTitle("✅ Pembayaran QRIS Berhasil")
    .setDescription(
      [
        `🧾 **Order:** ${order.orderId}`,
        `🎮 **Roblox:** \`${order.robloxUsername}\``,
        `💎 **Jumlah:** ${fmtIDR(order.qty)} Robux`,
        `💰 **Dibayar:** Rp ${fmtIDR(getQrisTotal(order))}`,
        "",
        "✅ Pembayaran sudah diverifikasi otomatis melalui Midtrans.",
        "👮 Staff/Owner akan melanjutkan proses pengiriman Robux.",
      ].join("\n")
    )
    .setColor(0x2ecc71)
    .setFooter({ text: "UNDERCOVER — Payment Verified" });
}

function buildQrisFailedEmbed(order, status) {
  const label = status === "expire" ? "Kedaluwarsa" : status === "cancel" ? "Dibatalkan" : "Gagal";

  return new EmbedBuilder()
    .setTitle(`❌ Pembayaran QRIS ${label}`)
    .setDescription(
      [
        `🧾 **Order:** ${order.orderId}`,
        `💰 **Total:** Rp ${fmtIDR(getQrisTotal(order))}`,
        `📌 **Status Midtrans:** ${status || "unknown"}`,
        "",
        "Pembayaran tidak dapat dilanjutkan dengan QR tersebut.",
      ].join("\n")
    )
    .setColor(0xe74c3c)
    .setFooter({ text: "UNDERCOVER — QRIS Payment" });
}

function buildQrisPaymentButtons(orderId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_qris_status:${orderId}`)
        .setLabel("🔄 Cek Status")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ob_cancel_user:${orderId}`)
        .setLabel("❌ Close Order")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

async function editQrisMessage(client, order, { paid = false, failedStatus = null } = {}) {
  if (!order?.channelId || !order?.paymentMessageId) return;

  const guild = await client.guilds.fetch(order.guildId || GUILD_ID).catch(() => null);
  if (!guild) return;

  const channel = await guild.channels.fetch(order.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const message = await channel.messages.fetch(order.paymentMessageId).catch(() => null);
  if (!message) return;

  if (paid) {
    await message.edit({ embeds: [buildQrisPaidEmbed(order)], components: [] }).catch(() => {});
  } else if (failedStatus) {
    await message
      .edit({ embeds: [buildQrisFailedEmbed(order, failedStatus)], components: [] })
      .catch(() => {});
  }
}

async function applyMidtransStatus(client, order, payload, source = "status") {
  if (!order || !payload) return false;

  const status = String(payload.transaction_status || "").toLowerCase();
  const grossAmount = Math.round(Number(payload.gross_amount || 0));
  const expectedQrisTotal = getQrisTotal(order);

  order.midtransStatus = status || order.midtransStatus || null;
  order.midtransLastCheckedAt = nowIso();
  order.midtransLastSource = source;

  if (grossAmount && grossAmount !== expectedQrisTotal) {
    console.error(
      `Midtrans amount mismatch ${order.orderId}: expected=${expectedQrisTotal}, received=${grossAmount}`
    );
    orders.set(order.orderId, order);
    saveOrders();
    return false;
  }

  const fraudStatus = String(payload.fraud_status || "accept").toLowerCase();
  const success =
    ["settlement", "capture"].includes(status) &&
    fraudStatus === "accept" &&
    (!payload.status_code || String(payload.status_code) === "200");

  if (success) {
    const alreadyPaid = order.status === "PAID" || order.status === "DONE";

    if (!alreadyPaid) {
      order.status = "PAID";
      order.paymentMethod = "MIDTRANS_QRIS";
      order.paymentAmount = expectedQrisTotal;
      order.total = expectedQrisTotal;
      order.paidAt = parseMidtransDate(payload.settlement_time)?.toISOString() || nowIso();
      order.autoCloseEnabled = false;
      order.autoClosePaused = false;
      order.autoCloseDeadlineAt = null;
      orders.set(order.orderId, order);
      saveOrders();

      await syncStockAndPanel(client).catch(() => {});

      const guild = await client.guilds.fetch(order.guildId || GUILD_ID).catch(() => null);
      const channel = guild ? await guild.channels.fetch(order.channelId).catch(() => null) : null;
      if (channel?.isTextBased?.()) {
        await channel
          .send(
            `✅ **PEMBAYARAN TERVERIFIKASI OTOMATIS**\n` +
              `💰 Rp ${fmtIDR(getQrisTotal(order))} dari <@${order.userId}> sudah diterima melalui QRIS.\n` +
              `👮 <@&${STAFF_ROLE_ID}> silakan lanjut proses ${fmtIDR(order.qty)} Robux untuk \`${order.robloxUsername}\`.\n` +
              `Customer tidak perlu mengirim bukti pembayaran.`
          )
          .catch(() => {});
      }
    }

    await editQrisMessage(client, order, { paid: true });
    return true;
  }

  if (["expire", "cancel", "deny"].includes(status)) {
    const terminalStatus = status === "expire" ? "EXPIRED" : "CANCELLED";

    if (!["DONE", "PAID", "CLOSED"].includes(order.status)) {
      order.status = terminalStatus;
      order.expiredAt = status === "expire" ? nowIso() : order.expiredAt;
      order.cancelledAt = status !== "expire" ? nowIso() : order.cancelledAt;
      order.autoCloseEnabled = false;
      order.autoClosePaused = false;
      order.autoCloseDeadlineAt = null;
      orders.set(order.orderId, order);
      saveOrders();

      await syncStockAndPanel(client).catch(() => {});
      await editQrisMessage(client, order, { failedStatus: status });

      const guild = await client.guilds.fetch(order.guildId || GUILD_ID).catch(() => null);
      const channel = guild ? await guild.channels.fetch(order.channelId).catch(() => null) : null;
      if (channel?.isTextBased?.()) {
        const reason =
          status === "expire"
            ? "⌛ QRIS sudah kedaluwarsa. Order dibatalkan dan stok dikembalikan. Ticket akan dihapus..."
            : `❌ Pembayaran QRIS berstatus **${status.toUpperCase()}**. Order dibatalkan. Ticket akan dihapus...`;
        await deleteTicketChannel(channel, order, reason, terminalStatus);
      }
    }

    return false;
  }

  orders.set(order.orderId, order);
  saveOrders();
  return false;
}

const qrisCreationLocks = new Set();
let midtransPollRunning = false;

async function pollPendingMidtransOrders(client) {
  if (!isMidtransConfigured() || midtransPollRunning) return;
  midtransPollRunning = true;

  try {
    const pending = Array.from(orders.values()).filter(
      (order) => order?.status === "QRIS_PENDING" && order?.midtransOrderId
    );

    for (const order of pending) {
      try {
        const status = await getMidtransStatus(order);
        await applyMidtransStatus(client, order, status, "poll");
      } catch (error) {
        console.warn(`Midtrans status poll ${order.orderId} gagal:`, error?.message || error);
      }
    }
  } finally {
    midtransPollRunning = false;
  }
}

function startMidtransWebhookServer(client) {
  if (!MIDTRANS_WEBHOOK_ENABLED || !isMidtransConfigured()) return null;
  if (!Number.isFinite(MIDTRANS_WEBHOOK_PORT) || MIDTRANS_WEBHOOK_PORT <= 0) return null;

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

      if (req.method === "GET" && requestUrl.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "undercover-midtrans" }));
        return;
      }

      if (req.method !== "POST" || requestUrl.pathname !== MIDTRANS_WEBHOOK_PATH) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "not_found" }));
        return;
      }

      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1_000_000) throw new Error("Webhook body terlalu besar");
      }

      let payload;
      try {
        payload = JSON.parse(raw || "{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
        return;
      }

      if (!isValidMidtransSignature(payload)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid_signature" }));
        return;
      }

      const order = findOrderByMidtransOrderId(payload.order_id);
      if (!order) {
        // Balas 200 agar Midtrans tidak retry terus untuk transaksi yang bukan milik instance ini.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ignored: true }));
        return;
      }

      await applyMidtransStatus(client, order, payload, "webhook");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error("Midtrans webhook error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "internal_error" }));
    }
  });

  server.on("error", (error) => {
    console.error("Midtrans webhook server error:", error);
  });

  server.listen(MIDTRANS_WEBHOOK_PORT, MIDTRANS_WEBHOOK_HOST, () => {
    console.log(
      `✅ Midtrans webhook listening on ${MIDTRANS_WEBHOOK_HOST}:${MIDTRANS_WEBHOOK_PORT}${MIDTRANS_WEBHOOK_PATH}`
    );
  });

  return server;
}

// ========= AUTO CLOSE HELPERS =========
function touchActivity(order, reason = "activity") {
  order.lastActivityAt = nowIso();
  order.lastActivityReason = reason;
  orders.set(order.orderId, order);
  saveOrders();
}

function setAutoCloseDeadline(order, minutes = AUTO_CLOSE_MINUTES, reason = "set_deadline") {
  order.autoCloseEnabled = true;
  order.autoClosePaused = false;
  order.autoCloseReason = reason;
  order.autoCloseDeadlineAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  touchActivity(order, `autoclose:${reason}`);
}

function bumpAutoCloseDeadline(order, minutes = AUTO_CLOSE_MINUTES, reason = "bump_deadline") {
  order.autoCloseEnabled = true;
  order.autoClosePaused = false;
  order.autoCloseReason = reason;
  order.autoCloseDeadlineAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  touchActivity(order, `autoclose:${reason}`);
}

function clearAutoCloseDeadline(order, reason = "clear_deadline") {
  order.autoCloseEnabled = false;
  order.autoClosePaused = false;
  order.autoCloseReason = reason;
  order.autoCloseDeadlineAt = null;
  touchActivity(order, `autoclose:${reason}`);
}

// ========= ROBLOX HELPERS =========
async function robloxUsernameToUserId(username) {
  const r = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Roblox username->id failed: ${r.status} ${t}`);
  }

  const json = await r.json();
  const data = json?.data?.[0];

  if (!data?.id) return null;

  return {
    id: data.id,
    name: data.name || username,
    displayName: data.displayName || data.name || username,
  };
}

async function robloxGetUserInfo(userId) {
  const r = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Roblox user info failed: ${r.status} ${t}`);
  }

  const json = await r.json();

  return {
    id: json?.id || userId,
    name: json?.name || "",
    displayName: json?.displayName || json?.name || "",
  };
}

async function robloxGetGroupMembershipForUser(groupId, userId) {
  const filter = encodeURIComponent(`user == 'users/${userId}'`);
  const url = `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships?filter=${filter}&pageSize=10`;

  const r = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": ROBLOX_API_KEY },
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Roblox membership fetch failed: ${r.status} ${t}`);
  }

  const json = await r.json();

  const memberships =
    json?.groupMemberships ||
    json?.memberships ||
    json?.data ||
    json?.group_memberships ||
    [];

  if (!Array.isArray(memberships) || memberships.length === 0) return null;

  return memberships[0];
}

function extractMembershipJoinTime(membership) {
  const candidates = [
    membership?.createTime,
    membership?.createdTime,
    membership?.create_time,
    membership?.joinedTime,
    membership?.joinTime,
    membership?.startTime,
    membership?.createdAt,
  ].filter(Boolean);

  if (candidates.length === 0) return null;

  const dt = new Date(candidates[0]);
  if (isNaN(dt.getTime())) return null;

  return dt.toISOString();
}

async function checkRobloxGroupEligibility(username) {
  const clean = String(username || "").trim().replace(/^@/, "");

  if (!clean) {
    return {
      ok: false,
      failType: "USERNAME_EMPTY",
      reason: "Username kosong.",
    };
  }

  const usernameLookup = await robloxUsernameToUserId(clean);

  if (!usernameLookup?.id) {
    return {
      ok: false,
      failType: "USERNAME_NOT_FOUND",
      reason: "Username Roblox tidak ditemukan.",
    };
  }

  const userId = usernameLookup.id;

  let userInfo = usernameLookup;

  try {
    userInfo = await robloxGetUserInfo(userId);
  } catch (e) {
    console.error("robloxGetUserInfo error:", e);
  }

  const displayName = userInfo?.displayName || usernameLookup?.displayName || clean;
  const realUsername = userInfo?.name || usernameLookup?.name || clean;

  if (tagSettings.enabled && !displayNameHasRequiredTag(displayName)) {
    const tagUpper = getTagKeywordUpper();

    return {
      ok: false,
      failType: "TAG_MISSING",
      reason:
        `Display Name Roblox kamu belum mencantumkan tag map **${tagUpper}**.\n` +
        `Silakan ubah Display Name Roblox kamu terlebih dahulu.\n\n` +
        `Contoh Display Name yang benar:\n` +
        `• ${buildTagExamples(displayName).examples[0]}\n` +
        `• ${buildTagExamples(displayName).examples[1]}\n` +
        `• ${buildTagExamples(displayName).examples[2]}`,
      userId,
      robloxUsername: realUsername,
      robloxDisplayName: displayName,
      joinTime: null,
      daysInGroup: 0,
      isMember: false,
      tagKeyword: tagSettings.keyword,
      tagRequired: true,
      tagValid: false,
    };
  }

  const membership = await robloxGetGroupMembershipForUser(ROBLOX_GROUP_ID, userId);

  if (!membership) {
    return {
      ok: false,
      failType: "NOT_IN_GROUP",
      reason: "User belum join komunitas Roblox (Group).",
      userId,
      robloxUsername: realUsername,
      robloxDisplayName: displayName,
      joinTime: null,
      daysInGroup: 0,
      isMember: false,
      tagKeyword: tagSettings.keyword,
      tagRequired: tagSettings.enabled,
      tagValid: true,
    };
  }

  const joinTimeIso = extractMembershipJoinTime(membership);

  if (!joinTimeIso) {
    return {
      ok: false,
      failType: "JOIN_TIME_MISSING",
      reason: "User member, tapi API tidak mengembalikan tanggal join. Tidak bisa validasi 14 hari.",
      userId,
      robloxUsername: realUsername,
      robloxDisplayName: displayName,
      joinTime: null,
      daysInGroup: null,
      isMember: true,
      tagKeyword: tagSettings.keyword,
      tagRequired: tagSettings.enabled,
      tagValid: true,
    };
  }

  const now = nowIso();
  const daysInGroup = daysBetween(now, joinTimeIso);
  const eligible = daysInGroup >= ELIGIBLE_DAYS;

  return {
    ok: eligible,
    failType: eligible ? null : "DAYS_NOT_ENOUGH",
    reason: eligible
      ? "Eligible."
      : `Belum ${ELIGIBLE_DAYS} hari join komunitas. Baru ${daysInGroup} hari.`,
    userId,
    robloxUsername: realUsername,
    robloxDisplayName: displayName,
    joinTime: joinTimeIso,
    daysInGroup,
    isMember: true,
    tagKeyword: tagSettings.keyword,
    tagRequired: tagSettings.enabled,
    tagValid: true,
  };
}

// ========= AUTO STOCK =========
async function robloxGetGroupFunds(groupId) {
  const url = `https://economy.roblox.com/v1/groups/${groupId}/currency`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
      "User-Agent": "UNDERCOVER-StockBot/1.0",
    },
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Roblox group funds fetch failed: ${r.status} ${t}`);
  }

  const json = await r.json();
  const robux = Number(json?.robux);

  if (!Number.isFinite(robux)) {
    throw new Error("Roblox group funds invalid response (missing robux).");
  }

  return robux;
}

function computeReservedRobux() {
  let reserved = 0;

  for (const o of orders.values()) {
    if (!o || !o.qty) continue;

    const lockingStatuses = new Set([
      "AWAITING_PAYMENT",
      "AWAITING_PROOF",
      "PROOF_SUBMITTED",
      "QRIS_PENDING",
      "PAID",
    ]);

    if (lockingStatuses.has(o.status)) {
      reserved += Number(o.qty || 0);
    }
  }

  return Math.max(0, Math.floor(reserved));
}

let stockCache = {
  ok: false,
  groupFunds: 0,
  reserved: 0,
  available: 0,
  updatedAt: null,
  error: null,
};

const stockBroadcastState = {
  initialized: false,
  lastObservedAvailable: null,
  lastObservedMode: null,
};

async function refreshStockCache() {
  const previous = { ...stockCache };

  try {
    const groupFunds = await robloxGetGroupFunds(ROBLOX_GROUP_ID);
    const reserved = computeReservedRobux();
    const available = Math.max(0, Math.floor(groupFunds - reserved));

    stockCache = {
      ok: true,
      groupFunds,
      reserved,
      available,
      updatedAt: nowIso(),
      error: null,
    };
  } catch (e) {
    stockCache = {
      ...stockCache,
      ok: false,
      updatedAt: nowIso(),
      error: String(e?.message || e),
    };
  }

  return {
    previous,
    current: { ...stockCache },
  };
}

function isStockReady() {
  return Number(stockCache?.available || 0) >= 1000;
}

function getStockBroadcastMode(available) {
  return Number(available || 0) >= 1000 ? "READY" : "OUT";
}

// ========= INVOICE PDF =========
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function createInvoicePdf(order, staffUser) {
  return new Promise((resolve, reject) => {
    try {
      const outDir = path.resolve("./invoices");
      ensureDir(outDir);

      const fileName = `INV-${order.orderId}-${Date.now()}.pdf`;
      const filePath = path.join(outDir, fileName);

      const doc = new PDFDocument({ size: "A4", margin: 48 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      doc.fontSize(20).text(`${STORE_NAME}`, { align: "left" });
      doc.moveDown(0.2);
      doc.fontSize(10).text("Invoice / Bukti Pembelian", { align: "left" });
      doc.moveDown(1);

      const createdAt = order.doneAt || nowIso();

      doc.fontSize(11);
      doc.text(`Invoice No : INV-${order.orderId}`);
      doc.text(`Order ID   : ${order.orderId}`);
      doc.text(`Tanggal    : ${fmtDateID(createdAt)} WIB`);
      doc.text(`Customer   : <@${order.userId}>`);
      doc.text(`Roblox User : ${order.robloxUsername || "-"}`);
      doc.text(`Display Name: ${order.robloxDisplayName || "-"}`);
      doc.text(`Metode Bayar: ${getPaymentMethodLabel(order)}`);
      doc.text(`Diproses oleh: ${staffUser?.tag || staffUser?.username || staffUser?.id || "-"}`);
      doc.moveDown(1);

      doc.moveTo(48, doc.y).lineTo(548, doc.y).stroke();
      doc.moveDown(1);

      doc.fontSize(12).text("Detail Pembelian", { underline: true });
      doc.moveDown(0.6);

      const itemName = "Robux via Community Payout";
      const qty = Number(order.qty || 0);
      const total = getPaymentTotal(order);

      doc.fontSize(11);
      doc.text(`Item   : ${itemName}`);
      doc.text(`Qty    : ${fmtIDR(qty)} Robux`);
      doc.text(`Harga  : Rp ${fmtIDR(total)}`);
      doc.moveDown(1);

      doc.moveTo(48, doc.y).lineTo(548, doc.y).stroke();
      doc.moveDown(0.8);

      doc.fontSize(10).text(
        [
          "Catatan:",
          "• Simpan invoice ini sebagai bukti pembelian.",
          "• Jika ada kendala, hubungi staff/owner dan sertakan Order ID.",
        ].join(os.EOL)
      );

      doc.moveDown(1.2);
      doc.fontSize(9).text(STORE_FOOTER, { align: "center" });

      doc.end();

      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

function buildInvoiceEmbed(order) {
  const dt = order.doneAt || nowIso();

  return new EmbedBuilder()
    .setTitle(`🧾 INVOICE — ${order.orderId}`)
    .setDescription(
      [
        `**Invoice No:** INV-${order.orderId}`,
        `**Tanggal:** ${fmtDateID(dt)} WIB`,
        "",
        `👤 **Discord:** <@${order.userId}>`,
        `🎮 **Roblox Username:** \`${order.robloxUsername}\``,
        `🏷️ **Display Name:** \`${order.robloxDisplayName || "-"}\``,
        "",
        `💎 **Robux:** ${fmtIDR(order.qty)}`,
        `💰 **Total:** Rp ${fmtIDR(getPaymentTotal(order))}`,
        `💳 **Metode:** ${getPaymentMethodLabel(order)}`,
        "",
        `✅ **Status:** DONE`,
      ].join("\n")
    )
    .setFooter({ text: STORE_FOOTER });
}

// ========= DISCORD UI BUILDERS =========
function buildPanelEmbed() {
  const stockLine = !isOrderOpen()
    ? `**STATUS ORDER:** CLOSE / DITUTUP MANUAL`
    : stockCache.ok
      ? `**STATUS STOK:** ${isStockReady() ? "READY" : "HABIS"}`
      : `**STATUS STOK:** (gagal fetch)`;

  const stockWarn = "";

  const stockMeta = stockCache.ok
    ? `\n_Updated: ${fmtDateID(stockCache.updatedAt)} WIB_`
    : `\n_Updated: ${fmtDateID(stockCache.updatedAt)} WIB | Error: ${stockCache.error}_`;

  const tagKeyword = getTagKeywordUpper();
  const tagExample = buildTagExamples("DisplayName");

  const tagRequirementLine = tagSettings.enabled
    ? [
        `• Wajib Display Name Roblox mencantumkan tag map **${tagKeyword}**`,
        `• Contoh Display Name: **${tagExample.examples[0]}**, **${tagExample.examples[1]}**, **${tagExample.examples[2]}**`,
      ]
    : ["• Syarat tag map di Display Name Roblox sedang **OFF**"];

  return new EmbedBuilder()
    .setTitle("💸ORDER ROBUX — VIA COMMUNITY PAYOUT")
    .setDescription(
      [
        stockLine + stockWarn + stockMeta,
        "",
        "**Syarat sebelum order**",
        `• Wajib join komunitas Roblox minimal **${ELIGIBLE_DAYS} hari**`,
        ...tagRequirementLine,
        "• Link komunitas: https://www.roblox.com/share/g/819348691",
        "",
        "💰 **RATE ROBUX**",
        `💎 1.000 Robux = Rp ${fmtIDR(PRICE_PER_1000)}`,
        `💎 2.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 2)}`,
        `💎 3.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 3)}`,
        `💎 4.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 4)}`,
        `💎 5.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 5)}`,
        "➡️ dan seterusnya (kelipatan 1.000)",
        "ℹ️ Transfer SeaBank memakai rate di atas. Checkout QRIS dihitung otomatis dan dibulatkan ke atas ke ribuan terdekat.",
        "",
        "💳 **METODE PEMBAYARAN**",
        "• 🏦 **Transfer SeaBank** → transfer manual, upload bukti, lalu staff cek/proses",
        "• 📱 **QRIS Midtrans** → QR dinamis, status pembayaran diverifikasi otomatis",
        "",
        "**Cara order (step by step)**",
        "1) Klik tombol **ORDER ROBUX** di bawah",
        "2) Isi **Username Roblox** & **Jumlah**",
        "3) Bot cek join komunitas Roblox",
        tagSettings.enabled
          ? `4) Bot cek Display Name Roblox wajib ada tag **${tagKeyword}**`
          : "4) Bot cek data Roblox",
        "5) Ticket dibuat otomatis jika memenuhi pengecekan awal",
        "6) Pilih **Transfer SeaBank** atau **Bayar QRIS**",
        "7) SeaBank: transfer → upload bukti → staff cek",
        "8) QRIS: scan QR → bot verifikasi pembayaran otomatis",
        "9) Setelah pembayaran valid, staff melanjutkan pengiriman Robux",
        "",
        "⚠️ **Metode pembayaran terkunci setelah dipilih. Jika salah pilih, close order lalu buat order baru.**",
      ].join("\n")
    )
    .setFooter({ text: "UNDERCOVER — Order Robux System" });
}

function buildStockStatusButton() {
  if (!isOrderOpen()) {
    return new ButtonBuilder()
      .setCustomId("ob_stock_info")
      .setLabel("🔒 ORDER: CLOSE")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
  }

  const ready = isStockReady();
  const label = ready ? "📦 STOK: READY" : "⛔ STOK: HABIS";

  return new ButtonBuilder()
    .setCustomId("ob_stock_info")
    .setLabel(label)
    .setStyle(ready ? ButtonStyle.Primary : ButtonStyle.Danger)
    .setDisabled(true);
}

function buildPanelComponents() {
  const ready = isOrderOpen() && isStockReady();

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ob_order_open_modal")
        .setLabel("💸ORDER ROBUX")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!ready),
      buildStockStatusButton()
    ),
  ];
}

function buildPanelRetryButton() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ob_order_retry_panel")
        .setLabel("🔁 Order Robux Ulang")
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

async function refreshPanelMessage(client) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(PANEL_CHANNEL_ID);

    if (!channel || channel.type !== ChannelType.GuildText) return;

    const embed = buildPanelEmbed();
    const components = buildPanelComponents();

    const msgs = await channel.messages.fetch({ limit: 20 });
    const existing = msgs.find(
      (m) => m.author.id === client.user.id && m.embeds?.[0]?.title?.includes("ORDER ROBUX")
    );

    if (existing) {
      await existing.edit({ embeds: [embed], components });
    } else {
      await channel.send({ embeds: [embed], components });
    }
  } catch (e) {
    console.error("refreshPanelMessage error:", e);
  }
}

function buildOrderModal() {
  const modal = new ModalBuilder()
    .setCustomId("ob_order_modal_submit")
    .setTitle("Order Robux - UNDERCOVER");

  const username = new TextInputBuilder()
    .setCustomId("roblox_username")
    .setLabel("Username Roblox (tanpa @, bukan Display Name)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const qty = new TextInputBuilder()
    .setCustomId("qty")
    .setLabel("Jumlah (min. 1000 dan kelipatan 1000)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const note = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Catatan (opsional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(username),
    new ActionRowBuilder().addComponents(qty),
    new ActionRowBuilder().addComponents(note)
  );

  return modal;
}

function buildCustomerStatusEmbed(order) {
  const days = Number.isFinite(order.robloxDaysInGroup) ? order.robloxDaysInGroup : 0;
  const joinLine = order.robloxJoinTime ? fmtDateID(order.robloxJoinTime) : "-";

  const eligibleLine = order.robloxEligible
    ? `✅ Eligible — **${days}/${ELIGIBLE_DAYS} hari**`
    : `❌ Tidak eligible — **${days}/${ELIGIBLE_DAYS} hari**`;

  const tagUpper = String(order.tagKeyword || tagSettings.keyword || "UCVR").toUpperCase();

  const tagLine = order.tagRequired
    ? order.tagValid
      ? `✅ Display Name mengandung tag **${tagUpper}**`
      : `❌ Display Name belum mengandung tag **${tagUpper}**`
    : "ℹ️ Syarat tag map sedang OFF";

  const desc = order.robloxEligible
    ? [
        `👤 **Username Roblox:** \`${order.robloxUsername}\``,
        `🏷️ **Display Name:** \`${order.robloxDisplayName || "-"}\``,
        "",
        `📊 **Status Join Community:** ${eligibleLine}`,
        `🏷️ **Status Tag Map:** ${tagLine}`,
        `📅 **Tanggal Join:** ${joinLine}`,
        "",
        `💎 **Total Robux:** ${fmtIDR(order.qty)}`,
        `📌 **Rate:** Rp ${fmtIDR(PRICE_PER_1000)} / 1.000 Robux`,
        "",
        "💳 **Pilih Metode Pembayaran:**",
        `🏦 **Transfer SeaBank:** Rp ${fmtIDR(getBankTotal(order))}`,
        `📱 **QRIS Midtrans:** Rp ${fmtIDR(getQrisTotal(order))}`,
        "",
        "🏦 **SeaBank:** transfer sesuai nominal → upload bukti transfer → tunggu staff cek.",
        "📱 **QRIS:** bot membuat QR dinamis → pembayaran diverifikasi otomatis → tidak perlu upload bukti.",
        "",
        "⚠️ Setelah salah satu metode dipilih, metode pembayaran dikunci untuk order ini.",
      ].join("\n")
    : [
        `👤 **Username Roblox:** \`${order.robloxUsername}\``,
        `🏷️ **Display Name:** \`${order.robloxDisplayName || "-"}\``,
        "",
        `📊 **Status Join Community:** ${eligibleLine}`,
        `🏷️ **Status Tag Map:** ${tagLine}`,
        `📅 **Tanggal Join:** ${joinLine}`,
        "",
        `⚠️ **Alasan:** ${order.ineligibleReason || "Belum memenuhi syarat."}`,
        "",
        `⏳ Ticket ini akan otomatis ditutup setelah **${AUTO_CLOSE_MINUTES} menit**.`,
        "Jika sudah memperbaiki syaratnya, klik tombol **Order Robux Ulang** di bawah.",
      ].join("\n");

  return new EmbedBuilder()
    .setTitle(`UNDERCOVER — Ticket ${order.orderId}`)
    .setDescription(desc)
    .setColor(order.robloxEligible ? 0x2ecc71 : 0xe74c3c)
    .setFooter({ text: "UNDERCOVER — Order System" });
}

function buildCustomerButtonsEligible(orderId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_bank:${orderId}`)
        .setLabel("🏦 Transfer SeaBank")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ob_qris:${orderId}`)
        .setLabel("📱 Bayar QRIS")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!isMidtransConfigured()),
      new ButtonBuilder()
        .setCustomId(`ob_cancel_user:${orderId}`)
        .setLabel("❌ Close Order")
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_copy_username:${orderId}`)
        .setLabel("📋 Copy Username")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function buildButtonsAfterDone(orderId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_close_ticket:${orderId}`)
        .setLabel("🔒 Close Ticket")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildCustomerButtonsIneligible(orderId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_order_retry:${orderId}`)
        .setLabel("🔁 Order Robux Ulang")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ob_close_ineligible:${orderId}`)
        .setLabel("🔒 Close Ticket")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildSeaBankInstructions(order) {
  return new EmbedBuilder()
    .setTitle("Instruksi Pembayaran — Bank Transfer")
    .setDescription(
      [
        `**Order:** ${order.orderId}`,
        `**Total Transfer:** Rp ${fmtIDR(getBankTotal(order))}`,
        "",
        `**Bank SeaBank:** \`${SEABANK_ACCOUNT}\``,
        `**A/N:** ${SEABANK_NAME}`,
        "",
        "✅ Setelah transfer, **kirim bukti transfer (file apapun / gambar / dokumen / forward)** di chat ticket ini.",
        "👮 Staff/Owner akan mengecek bukti pembayaran sebelum melanjutkan proses Robux.",
        "⚠️ Pastikan nominal & rekening benar.",
      ].join("\n")
    )
    .setFooter({ text: "UNDERCOVER" });
}

function buildPaymentButtons(orderId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_copy_bank:${orderId}`)
        .setLabel("📋 Copy No. Rekening")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

// ========= AUTO BROADCAST =========
function getPanelUrl() {
  return `https://discord.com/channels/${GUILD_ID}/${PANEL_CHANNEL_ID}`;
}

function buildStockReadyBroadcastEmbed() {
  return new EmbedBuilder()
    .setColor(0x00ff95)
    .setTitle("💚✨ STOCK ROBUX READY SEKARANG ✨💚")
    .setDescription(
      [
        "🚀 **UPDATE STOK MASUK!**",
        "",
        "🔥 **Bisa langsung order sekarang**",
        "⚡ **Fast response**",
        "🎯 **Via Community Payout**",
        `✅ **Wajib join komunitas minimal ${ELIGIBLE_DAYS} hari**`,
        "",
        `🛒 **Langsung order ke <#${PANEL_CHANNEL_ID}>**`,
        "",
        "❗ **Buruan order sebelum stok berubah lagi!**",
      ].join("\n")
    )
    .setFooter({ text: "UNDERCOVER — Realtime Stock Update" })
    .setTimestamp();
}

function buildStockOutBroadcastEmbed() {
  return new EmbedBuilder()
    .setColor(0xff2e63)
    .setTitle("🚨⛔ STOCK ROBUX HABIS ⛔🚨")
    .setDescription(
      [
        "😵 **Untuk saat ini stok Robux sedang habis.**",
        "",
        "📌 Tunggu update stok berikutnya di channel ini.",
        "🔔 Kalau stok masuk lagi, bot akan langsung kasih info terbaru.",
        "",
        `🛒 Nanti kalau sudah ready lagi, langsung order di <#${PANEL_CHANNEL_ID}> ya.`,
      ].join("\n")
    )
    .setFooter({ text: "UNDERCOVER — Realtime Stock Update" })
    .setTimestamp();
}

function buildRedeployStockBroadcastEmbed() {
  const stockStatus = stockCache.ok ? (isStockReady() ? "READY" : "HABIS") : "GAGAL FETCH";
  const orderStatus = isOrderOpen() ? "OPEN" : "CLOSE";

  return new EmbedBuilder()
    .setColor(isOrderOpen() && isStockReady() ? 0x00ff95 : 0xffb703)
    .setTitle("🔄 BOT REDEPLOY / ONLINE LAGI")
    .setDescription(
      [
        "✅ **Bot berhasil online lagi setelah redeploy Railway.**",
        "",
        `📌 **Status Order:** ${orderStatus}`,
        `📦 **Status Stok:** ${stockStatus}`,
        "",
        stockCache.ok
          ? isOrderOpen() && isStockReady()
            ? `🛒 Customer bisa order di <#${PANEL_CHANNEL_ID}>.`
            : isOrderOpen() && !isStockReady()
              ? "⛔ Order masih OPEN, tapi stok belum ready."
              : "🔒 Order sedang CLOSE manual. Tombol order dimatikan."
          : `⚠️ Gagal cek stok Roblox: ${stockCache.error || "Unknown error"}`,
      ].join("\n")
    )
    .setFooter({ text: "UNDERCOVER — Railway Redeploy Stock Update" })
    .setTimestamp();
}

function buildOrderManualBroadcastEmbed(aksi, staffUser) {
  const isOpenAction = aksi === "OPEN";
  const stockStatus = stockCache.ok ? (isStockReady() ? "READY" : "HABIS") : "GAGAL FETCH";

  return new EmbedBuilder()
    .setColor(isOpenAction ? 0x00ff95 : 0xff2e63)
    .setTitle(isOpenAction ? "✅ ORDER ROBUX DIBUKA" : "🔒 ORDER ROBUX DITUTUP")
    .setDescription(
      [
        isOpenAction
          ? "🚀 **Order Robux sudah dibuka oleh staff.**"
          : "⛔ **Order Robux ditutup manual oleh staff.**",
        "",
        `👮 **Staff:** ${staffUser ? `<@${staffUser.id}>` : "-"}`,
        `📌 **Status Order:** ${isOrderOpen() ? "OPEN" : "CLOSE"}`,
        `📦 **Status Stok:** ${stockStatus}`,
        "",
        isOpenAction
          ? isStockReady()
            ? `🛒 Customer bisa langsung order di <#${PANEL_CHANNEL_ID}>.`
            : "⚠️ Order sudah OPEN, tapi stok belum ready."
          : "📌 Tombol order dimatikan meskipun payout Roblox ready.",
      ].join("\n")
    )
    .setFooter({ text: "UNDERCOVER — Manual Order Update" })
    .setTimestamp();
}

function buildStockBroadcastButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🛒 ORDER ROBUX SEKARANG")
        .setStyle(ButtonStyle.Link)
        .setURL(getPanelUrl())
    ),
  ];
}

async function sendUpdateStockChannelMessage(client, embed, options = {}) {
  try {
    const { mentionEveryone = false, withOrderButton = true } = options;

    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(UPDATE_STOCK_CHANNEL_ID);

    if (!channel) return;

    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      console.error("UPDATE_STOCK_CHANNEL_ID must be a text or announcement channel.");
      return;
    }

    await channel.send({
      content: mentionEveryone ? "🚨 @everyone" : undefined,
      embeds: [embed],
      components: withOrderButton ? buildStockBroadcastButtons() : [],
      allowedMentions: mentionEveryone ? { parse: ["everyone"] } : { parse: [] },
    });
  } catch (e) {
    console.error("sendUpdateStockChannelMessage error:", e);
  }
}

async function sendRedeployStockBroadcast(client) {
  await sendUpdateStockChannelMessage(client, buildRedeployStockBroadcastEmbed(), {
    mentionEveryone: false,
    withOrderButton: true,
  });
}

async function sendManualOrderBroadcast(client, aksi, staffUser) {
  await sendUpdateStockChannelMessage(client, buildOrderManualBroadcastEmbed(aksi, staffUser), {
    mentionEveryone: true,
    withOrderButton: true,
  });
}

function buildTestimoniEmbed(order, customerUser, staffUser) {
  const tanggalOrder = fmtDateID(order.doneAt || order.createdAt || nowIso());
  const customerAvatar =
    customerUser?.displayAvatarURL?.({ extension: "png", size: 512 }) || null;

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🌟 TESTIMONI PEMBELIAN ROBUX 🌟")
    .setDescription(
      [
        "```yaml",
        "Status    : BERHASIL DIPROSES",
        "Layanan   : Robux via Community Payout",
        "```",
        "",
        "✨ **Pesanan berhasil diproses dengan sukses!**",
        "",
        `👤 **Customer Discord** : ${customerUser ? `<@${customerUser.id}>` : `<@${order.userId}>`}`,
        `🎮 **Username Roblox** : \`${order.robloxUsername}\``,
        `🏷️ **Display Name**     : \`${order.robloxDisplayName || "-"}\``,
        `💎 **Jumlah Robux**    : **${fmtIDR(order.qty)} Robux**`,
        `💰 **Total Bayar**     : **Rp ${fmtIDR(getPaymentTotal(order))}**`,
        `💳 **Metode Bayar**    : **${getPaymentMethodLabel(order)}**`,
        `🧾 **Order ID**        : \`${order.orderId}\``,
        `📅 **Tanggal Order**   : **${tanggalOrder} WIB**`,
        `🛠️ **Diproses Oleh**   : ${staffUser ? `<@${staffUser.id}>` : "-"}`,
        "",
        `💚 Terima kasih sudah order di **${STORE_NAME}**`,
        "🚀 Ditunggu order berikutnya yaa!",
      ].join("\n")
    )
    .setThumbnail(customerAvatar)
    .setFooter({ text: "UNDERCOVER — Testimoni Order" })
    .setTimestamp();
}

async function sendTestimoniMessage(client, order, staffUser) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(TESTIMONI_CHANNEL_ID);

    if (!channel) return;

    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      console.error("TESTIMONI_CHANNEL_ID must be a text or announcement channel.");
      return;
    }

    const customerUser = await client.users.fetch(order.userId).catch(() => null);

    await channel.send({
      content: "@everyone\n✨ **Testimoni order baru berhasil diproses!** ✨",
      embeds: [buildTestimoniEmbed(order, customerUser, staffUser)],
      allowedMentions: { parse: ["everyone"] },
    });
  } catch (e) {
    console.error("sendTestimoniMessage error:", e);
  }
}

function buildRewardTicketMessage(order, role, tier) {
  const roleName = getRewardRoleDisplayName(tier, role);
  const roleMention = role ? `<@&${role.id}>` : `**${roleName}**`;

  return (
    `🎁 **REWARD ${roleName.toUpperCase()} AKTIF!** 🎁\n\n` +
    `Selamat <@${order.userId}>! Kamu otomatis mendapatkan role ${roleMention} ` +
    `karena telah order Robux di **${STORE_NAME}**.\n` +
    `🧾 Order ID: **${order.orderId}**\n` +
    `💎 Total Robux order ini: **${fmtIDR(order.qty)}**\n\n` +
    `Terima kasih sudah order, semoga betah jadi member ${roleName}! 💚`
  );
}

function buildRewardDmMessage(order, role, tier) {
  const roleName = getRewardRoleDisplayName(tier, role);

  return (
    `🎁 **REWARD ${roleName.toUpperCase()} AKTIF!** 🎁\n\n` +
    `Selamat! Kamu otomatis mendapatkan role **${roleName}** ` +
    `karena telah order Robux di **${STORE_NAME}**.\n` +
    `🧾 Order ID: **${order.orderId}**\n` +
    `💎 Total Robux order ini: **${fmtIDR(order.qty)}**\n\n` +
    `Terima kasih sudah order, semoga betah jadi member ${roleName}! 💚`
  );
}

async function grantOrderRewardRoleIfNeeded(client, order, ticketChannel) {
  try {
    const guild = await client.guilds.fetch(order.guildId || GUILD_ID).catch(() => null);
    if (!guild) return { granted: false, skipped: false, reason: "GUILD_NOT_FOUND" };

    const member = await guild.members.fetch(order.userId).catch(() => null);
    if (!member) return { granted: false, skipped: false, reason: "MEMBER_NOT_FOUND" };

    const executiveRole = await resolveExecutiveRole(guild);
    if (memberHasConfiguredRole(member, executiveRole, EXECUTIVE_ROLE_NAME || "Executive")) {
      return { granted: false, skipped: true, reason: "ALREADY_HAS_EXECUTIVE" };
    }

    const tier = getOrderRewardTier(order);
    const role = tier === "EXECUTIVE" ? executiveRole : await resolveVvipRole(guild);
    const roleName = tier === "EXECUTIVE" ? EXECUTIVE_ROLE_NAME || "Executive" : VVIP_ROLE_NAME || "VVIP";

    if (!role) {
      console.error(
        `${roleName} role not found. Set ${tier === "EXECUTIVE" ? "EXECUTIVE_ROLE_ID" : "VVIP_ROLE_ID"} or create role named ${roleName}.`
      );
      return { granted: false, skipped: false, reason: "ROLE_NOT_FOUND", tier };
    }

    if (tier === "VVIP" && memberHasConfiguredRole(member, role, roleName)) {
      return { granted: false, skipped: true, reason: "ALREADY_HAS_VVIP" };
    }

    await member.roles.add(role, `Reward ${roleName} order Robux ${fmtIDR(order.qty)} (${order.orderId})`);

    order.rewardRoleTier = tier;
    order.rewardRoleId = role.id;
    order.rewardRoleGivenAt = nowIso();

    if (tier === "VVIP") {
      order.vvipRewardRoleId = role.id;
      order.vvipRewardGivenAt = order.rewardRoleGivenAt;
    }

    if (tier === "EXECUTIVE") {
      order.executiveRewardRoleId = role.id;
      order.executiveRewardGivenAt = order.rewardRoleGivenAt;
    }

    orders.set(order.orderId, order);
    saveOrders();

    if (ticketChannel?.send) {
      await ticketChannel
        .send({ content: buildRewardTicketMessage(order, role, tier) })
        .catch((e) => console.error(`${roleName} ticket reward message error:`, e));
    }

    const customerUser = await client.users.fetch(order.userId).catch(() => null);
    if (customerUser) {
      await customerUser
        .send({ content: buildRewardDmMessage(order, role, tier) })
        .catch((e) => console.error(`${roleName} DM reward message error:`, e));
    }

    return { granted: true, skipped: false, reason: null, tier, roleId: role.id };
  } catch (e) {
    console.error("grantOrderRewardRoleIfNeeded error:", e);
    return { granted: false, skipped: false, reason: "ERROR" };
  }
}

async function sendAutoStockBroadcast(client, mode) {
  const embed = mode === "OUT" ? buildStockOutBroadcastEmbed() : buildStockReadyBroadcastEmbed();

  await sendUpdateStockChannelMessage(client, embed, {
    mentionEveryone: true,
    withOrderButton: true,
  });
}

async function maybeBroadcastStockChange(client, refreshResult, options = {}) {
  const { suppressBroadcast = false } = options;
  const current = refreshResult?.current;

  if (!current?.ok) return;

  const currAvailable = Number(current.available || 0);
  const currMode = getStockBroadcastMode(currAvailable);

  if (!stockBroadcastState.initialized || suppressBroadcast) {
    stockBroadcastState.initialized = true;
    stockBroadcastState.lastObservedAvailable = currAvailable;
    stockBroadcastState.lastObservedMode = currMode;
    return;
  }

  const prevMode = stockBroadcastState.lastObservedMode;

  let shouldBroadcast = false;
  let broadcastMode = null;

  if (prevMode !== currMode) {
    shouldBroadcast = true;
    broadcastMode = currMode;
  }

  if (shouldBroadcast && broadcastMode) {
    await sendAutoStockBroadcast(client, broadcastMode);
  }

  stockBroadcastState.lastObservedAvailable = currAvailable;
  stockBroadcastState.lastObservedMode = currMode;
}

async function syncStockAndPanel(client, options = {}) {
  const refreshResult = await refreshStockCache();
  await maybeBroadcastStockChange(client, refreshResult, options);
  await refreshPanelMessage(client);
  return refreshResult;
}

// ========= CHANNEL CLOSE =========
async function deleteTicketChannel(channel, order, reasonText, finalStatus = null) {
  try {
    const terminal = new Set(["DONE", "CANCELLED", "INELIGIBLE", "EXPIRED", "CLOSED"]);

    if (finalStatus) {
      order.status = finalStatus;
    } else if (!terminal.has(order.status)) {
      order.status = "CLOSED";
    }

    order.closedAt = nowIso();
    order.autoCloseEnabled = false;
    order.autoClosePaused = false;
    order.autoCloseDeadlineAt = null;

    orders.set(order.orderId, order);
    saveOrders();

    if (reasonText) {
      await channel.send(reasonText).catch(() => {});
    }

    setTimeout(async () => {
      try {
        await channel.delete("Ticket closed (deleted).");
      } catch (e) {
        console.error("Failed to delete channel:", e);

        try {
          await channel.permissionOverwrites
            .edit(order.userId, {
              SendMessages: false,
            })
            .catch(() => {});

          await channel
            .send("⚠️ Bot gagal menghapus channel (permission). Ticket dikunci sebagai fallback.")
            .catch(() => {});
        } catch {}
      }
    }, 3000);
  } catch (e) {
    console.error("deleteTicketChannel error:", e);
  }
}

async function runAutoCloseSweep(client) {
  const now = Date.now();

  for (const order of orders.values()) {
    try {
      if (!order?.channelId) continue;
      if (!order.autoCloseEnabled) continue;
      if (!order.autoCloseDeadlineAt) continue;

      if (["CLOSED", "CANCELLED", "EXPIRED", "PROOF_SUBMITTED", "PAID"].includes(order.status)) {
        continue;
      }

      const deadline = new Date(order.autoCloseDeadlineAt).getTime();

      if (!Number.isFinite(deadline)) continue;
      if (now < deadline) continue;

      const guild = await client.guilds.fetch(order.guildId).catch(() => null);
      if (!guild) continue;

      const ch = await guild.channels.fetch(order.channelId).catch(() => null);

      if (!ch) {
        order.autoCloseEnabled = false;
        order.autoCloseDeadlineAt = null;

        orders.set(order.orderId, order);
        saveOrders();

        continue;
      }

      if (
        order.status === "AWAITING_PAYMENT" ||
        order.status === "AWAITING_PROOF" ||
        order.status === "QRIS_PENDING"
      ) {
        if (order.status === "QRIS_PENDING") {
          await cancelMidtransPending(order);
        }

        order.status = "EXPIRED";
        order.expiredAt = nowIso();
        order.autoCloseEnabled = false;
        order.autoCloseDeadlineAt = null;

        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});

        const msg =
          `⌛ Ticket expired otomatis karena tidak ada aktivitas selama ${AUTO_CLOSE_MINUTES} menit. ` +
          `Order dibatalkan, stok dikembalikan. Ticket akan dihapus...`;

        await deleteTicketChannel(ch, order, msg, "EXPIRED");
        continue;
      }

      if (order.status === "INELIGIBLE") {
        await deleteTicketChannel(
          ch,
          order,
          `🔒 Ticket ineligible ditutup otomatis setelah ${AUTO_CLOSE_MINUTES} menit. Ticket akan dihapus...`,
          "INELIGIBLE"
        );
        continue;
      }

      if (order.status === "DONE") {
        await deleteTicketChannel(
          ch,
          order,
          `🔒 Ticket ditutup otomatis setelah order selesai karena tidak ada aktivitas selama ${AUTO_CLOSE_MINUTES} menit. Ticket akan dihapus...`,
          "CLOSED"
        );

        await syncStockAndPanel(client).catch(() => {});
        continue;
      }

      await deleteTicketChannel(
        ch,
        order,
        `🔒 Ticket ditutup otomatis karena tidak ada aktivitas selama ${AUTO_CLOSE_MINUTES} menit. Ticket akan dihapus...`,
        "CLOSED"
      );

      await syncStockAndPanel(client).catch(() => {});
    } catch (e) {
      console.error("Auto-close sweep error:", e);
    }
  }
}


let client;

async function upsertGuildCommands(guild, commands) {
  const existing = await guild.commands.fetch();

  for (const commandData of commands) {
    const found = existing.find((cmd) => cmd.name === commandData.name);

    if (found) {
      await guild.commands.edit(found.id, commandData);
    } else {
      await guild.commands.create(commandData);
    }
  }
}

export function setupOrderRobux(discordClient) {
  client = discordClient;
  loadOrders();
  loadTagSettings();
  loadOrderSettings();
  client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    if (!isMidtransConfigured()) {
      console.warn("⚠️ MIDTRANS_SERVER_KEY belum diisi. Tombol Bayar QRIS akan dinonaktifkan.");
    } else {
      console.log(
        `✅ Midtrans QRIS aktif (${MIDTRANS_IS_PRODUCTION ? "PRODUCTION" : "SANDBOX"}) | MDR config ${MIDTRANS_MDR_PERCENT}% | pembulatan Rp${fmtIDR(PAYMENT_ROUND_TO)}`
      );
      startMidtransWebhookServer(client);
      setInterval(
        () => pollPendingMidtransOrders(client),
        MIDTRANS_STATUS_POLL_SECONDS * 1000
      ).unref();
      setTimeout(() => pollPendingMidtransOrders(client), 5000).unref();
    }

    setInterval(() => runAutoCloseSweep(client), 60 * 1000).unref();

    const guild = await client.guilds.fetch(GUILD_ID);

    await upsertGuildCommands(guild, [
      new SlashCommandBuilder()
        .setName("proses")
        .setDescription("Staff: proses order")
        .addStringOption((option) =>
          option
            .setName("aksi")
            .setDescription("Aksi proses")
            .setRequired(true)
            .addChoices({ name: "selesai", value: "SELESAI" })
        )
        .addStringOption((option) =>
          option
            .setName("order")
            .setDescription("Order ID, contoh: T-12345. Kosongkan jika di dalam ticket.")
            .setRequired(false)
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("tagmap")
        .setDescription("Staff: atur wajib tag map di Display Name Roblox")
        .addStringOption((option) =>
          option
            .setName("aksi")
            .setDescription("Pilih aksi")
            .setRequired(true)
            .addChoices(
              { name: "status", value: "STATUS" },
              { name: "aktifkan", value: "AKTIFKAN" },
              { name: "matikan", value: "MATIKAN" },
              { name: "ganti keyword", value: "GANTI" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("keyword")
            .setDescription("Keyword baru, contoh: UCVR / ADBM")
            .setRequired(false)
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("order")
        .setDescription("Staff: buka/tutup order Robux manual")
        .addStringOption((option) =>
          option
            .setName("aksi")
            .setDescription("Pilih aksi")
            .setRequired(true)
            .addChoices(
              { name: "status", value: "STATUS" },
              { name: "open", value: "OPEN" },
              { name: "close", value: "CLOSE" }
            )
        )
        .toJSON(),
    ]);

    console.log("Slash commands /proses, /tagmap, and /order registered.");

    // Sinkronkan stok/panel saat startup tanpa broadcast restart/redeploy.
    await syncStockAndPanel(client, { suppressBroadcast: true });

    setInterval(async () => {
      try {
        await syncStockAndPanel(client);
      } catch (e) {
        console.error("stock/panel interval error:", e);
      }
    }, STOCK_REFRESH_MINUTES * 60 * 1000).unref();
  });

  // ========= MESSAGE TRACKING =========
  client.on("messageCreate", async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;

      const order = Array.from(orders.values()).find((o) => o.channelId === msg.channelId);
      if (!order) return;

      const isCustomer = msg.author.id === order.userId;

      touchActivity(order, isCustomer ? "customer_message" : "staff_or_other_message");

      if (order.status === "INELIGIBLE") {
        return;
      }

      if (order.status === "DONE") {
        bumpAutoCloseDeadline(order, AUTO_CLOSE_MINUTES, "message_after_done");
        orders.set(order.orderId, order);
        saveOrders();
        return;
      }

      if (order.status === "AWAITING_PAYMENT" || order.status === "AWAITING_PROOF") {
        bumpAutoCloseDeadline(order, AUTO_CLOSE_MINUTES, "message_before_done");
        orders.set(order.orderId, order);
        saveOrders();
      }

      if (order.status === "AWAITING_PROOF" && isCustomer) {
        const hasAnyAttachment = msg.attachments && msg.attachments.size > 0;
        if (!hasAnyAttachment) return;

        order.status = "PROOF_SUBMITTED";
        order.paymentMethod = "SEABANK_TRANSFER";
        order.paymentAmount = getBankTotal(order);
        order.total = getBankTotal(order);
        order.proofSubmittedAt = nowIso();
        order.autoCloseEnabled = false;
        order.autoClosePaused = false;
        order.autoCloseDeadlineAt = null;

        touchActivity(order, "proof_any_file_submitted");

        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});

        await msg.channel
          .send(
            `✅ Bukti transfer SeaBank diterima dari <@${order.userId}>.\n` +
              `📎 Tipe bukti: **file/forward**\n` +
              `💰 Nominal order: **Rp ${fmtIDR(getBankTotal(order))}**\n` +
              `👮‍♂️ Staff/Owner akan mengecek pembayaran lalu memproses Robux kamu, mohon bersedia menunggu.`
          )
          .catch(() => {});
      }
    } catch (e) {
      console.error("messageCreate error:", e);
    }
  });

  // ========= INTERACTIONS =========
  client.on("interactionCreate", async (i) => {
    try {
      if (i.isChatInputCommand() && i.commandName === "order") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);

        if (!isStaff(member)) {
          return i.reply({ content: "Khusus staff/owner.", ephemeral: true });
        }

        const aksi = i.options.getString("aksi");

        if (aksi === "STATUS") {
          return i.reply({
            content:
              `📌 **Status Order Robux**\n` +
              `Order: **${isOrderOpen() ? "OPEN" : "CLOSE"}**\n` +
              `Stok Roblox: **${stockCache.ok ? (isStockReady() ? "READY" : "HABIS") : "GAGAL FETCH"}**`,
            ephemeral: true,
          });
        }

        if (aksi === "OPEN") {
          orderSettings.open = true;
          saveOrderSettings();

          await syncStockAndPanel(client, { suppressBroadcast: true }).catch(() => {});
          await sendManualOrderBroadcast(client, "OPEN", i.user).catch(() => {});

          return i.reply({
            content:
              "✅ Order Robux sudah **DIBUKA**. Info update order/stok sudah dikirim ke channel update stock.",
            ephemeral: true,
          });
        }

        if (aksi === "CLOSE") {
          orderSettings.open = false;
          saveOrderSettings();

          await syncStockAndPanel(client, { suppressBroadcast: true }).catch(() => {});
          await sendManualOrderBroadcast(client, "CLOSE", i.user).catch(() => {});

          return i.reply({
            content:
              "🔒 Order Robux sudah **DITUTUP MANUAL**. Info update order/stok sudah dikirim ke channel update stock.",
            ephemeral: true,
          });
        }

        return i.reply({ content: "Aksi tidak valid.", ephemeral: true });
      }

      if (i.isChatInputCommand() && i.commandName === "tagmap") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);

        if (!isStaff(member)) {
          return i.reply({ content: "Khusus staff/owner.", ephemeral: true });
        }

        const aksi = i.options.getString("aksi");
        const keywordInput = i.options.getString("keyword");

        if (aksi === "STATUS") {
          return i.reply({
            content:
              `🏷️ **Status Tag Map**\n` +
              `Status: **${tagSettings.enabled ? "ON" : "OFF"}**\n` +
              `Keyword: **${getTagKeywordUpper()}**\n\n` +
              `Contoh valid: \`${buildTagExamples("DisplayName").examples[0]}\`, \`${buildTagExamples("DisplayName").examples[1]}\`, \`${buildTagExamples("DisplayName").examples[2]}\``,
            ephemeral: true,
          });
        }

        if (aksi === "AKTIFKAN") {
          tagSettings.enabled = true;
          saveTagSettings();

          await refreshPanelMessage(client).catch(() => {});

          return i.reply({
            content:
              `✅ Wajib tag map di Display Name Roblox sudah **DIATIFKAN**.\n` +
              `Keyword aktif: **${getTagKeywordUpper()}**`,
            ephemeral: true,
          });
        }

        if (aksi === "MATIKAN") {
          tagSettings.enabled = false;
          saveTagSettings();

          await refreshPanelMessage(client).catch(() => {});

          return i.reply({
            content: "✅ Wajib tag map di Display Name Roblox sudah **DIMATIKAN**.",
            ephemeral: true,
          });
        }

        if (aksi === "GANTI") {
          const cleanKeyword = normalizeTagKeyword(keywordInput);

          if (!cleanKeyword) {
            return i.reply({
              content: "❌ Keyword tidak boleh kosong. Contoh: `/tagmap aksi:ganti keyword keyword:adbm`",
              ephemeral: true,
            });
          }

          tagSettings.keyword = cleanKeyword;
          saveTagSettings();

          await refreshPanelMessage(client).catch(() => {});

          const example = buildTagExamples("DisplayName");

          return i.reply({
            content:
              `✅ Keyword tag map berhasil diganti menjadi **${getTagKeywordUpper()}**.\n` +
              `Status wajib tag map saat ini: **${tagSettings.enabled ? "ON" : "OFF"}**\n\n` +
              `Contoh valid:\n` +
              `• ${example.examples[0]}\n` +
              `• ${example.examples[1]}\n` +
              `• ${example.examples[2]}`,
            ephemeral: true,
          });
        }

        return i.reply({ content: "Aksi tidak valid.", ephemeral: true });
      }

      if (i.isChatInputCommand() && i.commandName === "proses") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);

        if (!isStaff(member)) {
          return i.reply({ content: "Khusus staff/owner.", ephemeral: true });
        }

        const aksi = i.options.getString("aksi");
        const orderArg = i.options.getString("order");
        const channelId = i.channelId;

        if (aksi !== "SELESAI") {
          return i.reply({ content: "Aksi tidak valid.", ephemeral: true });
        }

        let order = null;

        if (orderArg) {
          order = orders.get(orderArg);

          if (!order) {
            return i.reply({ content: "Order ID tidak ditemukan.", ephemeral: true });
          }
        } else {
          order = Array.from(orders.values()).find((o) => o.channelId === channelId);

          if (!order) {
            return i.reply({
              content: "Command ini harus dipakai di channel ticket, atau isi option order.",
              ephemeral: true,
            });
          }
        }

        if (order.channelId !== channelId) {
          return i.reply({
            content: "Order itu bukan untuk channel ini. Jalankan di channel ticket yang benar.",
            ephemeral: true,
          });
        }

        const processableStatuses = ["PAID", "PROOF_SUBMITTED"];
        if (!processableStatuses.includes(order.status)) {
          return i.reply({
            content:
              order.status === "QRIS_PENDING"
                ? "Pembayaran QRIS masih **PENDING**. Tunggu sampai bot memverifikasi pembayaran."
                : order.status === "AWAITING_PROOF"
                  ? "Transfer SeaBank masih menunggu **bukti pembayaran dari customer**. Staff belum bisa menyelesaikan order."
                  : "Pembayaran belum terverifikasi.",
            ephemeral: true,
          });
        }

        order.status = "DONE";
        order.doneAt = nowIso();

        setAutoCloseDeadline(order, AUTO_CLOSE_MINUTES, "staff_done_command");

        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});

        const now = new Date();
        const tanggal = now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
        const jam = now.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });

        await i.reply({
          content: `✅ Proses selesai untuk **${order.orderId}**.`,
          ephemeral: true,
        });

        await i.channel
          .send({
            content:
              `🎉 **ORDER BERHASIL DIKIRIM!** 🎉\n\n` +
              `👤 Username Roblox: \`${order.robloxUsername}\`\n` +
              `🏷️ Display Name: \`${order.robloxDisplayName || "-"}\`\n` +
              `💎 Total Robux: **${fmtIDR(order.qty)}**\n` +
              `💰 Total Bayar: **Rp ${fmtIDR(getPaymentTotal(order))}**\n` +
              `💳 Metode Bayar: **${getPaymentMethodLabel(order)}**\n` +
              `📅 Tanggal: **${tanggal}**\n` +
              `⏰ Jam: **${jam} WIB**\n\n` +
              `Silakan cek kembali Robux kamu.\n` +
              `Jika ada kendala, silakan hubungi staff/owner.\n\n` +
              `⏳ Ticket akan ditutup otomatis jika tidak ada aktivitas selama **${AUTO_CLOSE_MINUTES} menit**.`,
            components: buildButtonsAfterDone(order.orderId),
          })
          .catch(() => {});

        await grantOrderRewardRoleIfNeeded(client, order, i.channel);

        await sendTestimoniMessage(client, order, i.user).catch(() => {});

        let pdfPath = null;

        try {
          pdfPath = await createInvoicePdf(order, i.user);

          const fileName = path.basename(pdfPath);
          const invoiceEmbed = buildInvoiceEmbed(order);

          try {
            const customerUser = await client.users.fetch(order.userId);
            const dmInvoiceFile = new AttachmentBuilder(pdfPath, { name: fileName });

            await customerUser.send({
              content:
                `Halo! Berikut invoice untuk order kamu di **${STORE_NAME}**.\n` +
                `Order ID: **${order.orderId}**\n` +
                `Diproses oleh: **${i.user.tag}**`,
              embeds: [invoiceEmbed],
              files: [dmInvoiceFile],
            });
          } catch (eDm) {
            console.error("Invoice DM send error:", eDm?.stack || eDm);
          }

          const ticketInvoiceFile = new AttachmentBuilder(pdfPath, { name: fileName });

          await i.channel.send({
            content: `🧾 Invoice untuk order **${order.orderId}** (silakan download PDF di bawah).`,
            embeds: [invoiceEmbed],
            files: [ticketInvoiceFile],
          });
        } catch (e) {
          console.error("Invoice generate/send error:", e?.stack || e);

          await i.channel
            .send(
              `⚠️ Proses selesai, tapi gagal membuat/mengirim invoice PDF.\n**Error:** \`${String(
                e?.message || e
              )}\``
            )
            .catch(() => {});
        } finally {
          if (pdfPath) fs.unlink(pdfPath, () => {});
        }

        return;
      }

      if (i.isButton() && i.customId === "ob_order_open_modal") {
        await syncStockAndPanel(client).catch(() => {});

        if (!isOrderOpen()) {
          return i.reply({
            content: "🔒 Order Robux sedang **CLOSE**. Silakan tunggu info dari staff.",
            ephemeral: true,
          });
        }

        if (!isStockReady()) {
          return i.reply({
            content: `⛔ Stock HABIS.\nStatus stok saat ini: **HABIS**`,
            ephemeral: true,
          });
        }

        return i.showModal(buildOrderModal());
      }

      if (i.isButton() && i.customId === "ob_order_retry_panel") {
        await syncStockAndPanel(client).catch(() => {});

        if (!isOrderOpen()) {
          return i.reply({
            content: "🔒 Order Robux sedang **CLOSE**. Silakan tunggu info dari staff.",
            ephemeral: true,
          });
        }

        if (!isStockReady()) {
          return i.reply({
            content:
              "⛔ Stok Robux sedang **HABIS**.\n" +
              "Silakan tunggu update stok ready, lalu klik tombol order lagi.",
            ephemeral: true,
          });
        }

        return i.showModal(buildOrderModal());
      }

      if (i.isModalSubmit() && i.customId === "ob_order_modal_submit") {
        await i.deferReply({ ephemeral: true });

        return withOrderCreationLock(async () => {
          const robloxUsernameInput = i.fields
            .getTextInputValue("roblox_username")
            ?.trim()
            ?.replace(/^@/, "");

          const qtyRaw = i.fields.getTextInputValue("qty")?.trim();
          const note = i.fields.getTextInputValue("note")?.trim();

          const qty = Number(String(qtyRaw || "").replace(/[^\d]/g, ""));

          if (!Number.isFinite(qty) || qty < 1000) {
            return i.editReply("Jumlah minimal 1000.");
          }

          if (qty % 1000 !== 0) {
            return i.editReply("Jumlah harus kelipatan 1000. Contoh: 1000 / 2000 / 3000.");
          }

          await syncStockAndPanel(client).catch(() => {});

          if (!isOrderOpen()) {
            return i.editReply("🔒 Order Robux sedang **CLOSE**. Silakan tunggu info dari staff.");
          }

          if (!isStockReady()) {
            return i.editReply(`⛔ Stock HABIS.\nStatus stok saat ini: **HABIS**`);
          }

          if (qty > stockCache.available) {
            return i.editReply(
              `❌ Order gagal. Jumlah Robux yang kamu input **lebih besar** dari stok yang bisa diproses saat ini.\n` +
                `Silakan coba jumlah yang lebih kecil atau tunggu update stok berikutnya.`
            );
          }

          let eligibility;

          try {
            eligibility = await checkRobloxGroupEligibility(robloxUsernameInput);
          } catch (e) {
            console.error("Roblox check error:", e);
            return i.editReply("Gagal cek komunitas Roblox/API Roblox. Coba lagi beberapa saat.");
          }

          if (!eligibility.ok && eligibility.failType === "TAG_MISSING") {
            const tagUpper = getTagKeywordUpper();
            const tagExample = buildTagExamples(eligibility.robloxDisplayName || robloxUsernameInput);

            return i.editReply({
              content:
                `❌ **Order gagal.**\n\n` +
                `Display Name Roblox kamu belum mencantumkan tag map **${tagUpper}**.\n\n` +
                `👤 **Username Roblox:** \`${eligibility.robloxUsername || robloxUsernameInput}\`\n` +
                `🏷️ **Display Name saat ini:** \`${eligibility.robloxDisplayName || "-"}\`\n\n` +
                `Silakan ubah Display Name Roblox kamu terlebih dahulu.\n\n` +
                `Contoh Display Name yang benar:\n` +
                `• **${tagExample.examples[0]}**\n` +
                `• **${tagExample.examples[1]}**\n` +
                `• **${tagExample.examples[2]}**\n\n` +
                `Jika sudah diganti, klik tombol **Order Robux Ulang** di bawah ini.`,
              components: buildPanelRetryButton(),
            });
          }

          const orderId = newOrderId();
          const baseTotal = computeBaseTotal(qty);
          const qrisTotal = computeTotal(qty);
          const total = qrisTotal; // backward compatibility; nominal final dikunci saat metode dipilih

          const guild = await client.guilds.fetch(GUILD_ID);
          const user = i.user;

          let ticket;

          try {
            const ticketName = `ucvr-${orderId}`.toLowerCase();

            ticket = await guild.channels.create({
              name: ticketName,
              type: ChannelType.GuildText,
              parent: TICKET_CATEGORY_ID,
              topic: `UNDERCOVER | ${orderId} | User: ${user.id} | Roblox: ${robloxUsernameInput}`,
              permissionOverwrites: [
                {
                  id: guild.id,
                  deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                  id: client.user.id,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.ManageChannels,
                    PermissionsBitField.Flags.ManageMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.EmbedLinks,
                  ],
                },
                {
                  id: user.id,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles,
                  ],
                },
                {
                  id: STAFF_ROLE_ID,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.ManageMessages,
                  ],
                },
              ],
            });
          } catch (e) {
            console.error("Ticket create error:", e);

            return i.editReply(
              "Gagal membuat ticket. Cek permission bot di **Category Ticket**: Manage Channels, View Channel, Send Messages."
            );
          }

          const order = {
            orderId,
            guildId: GUILD_ID,
            channelId: ticket.id,
            userId: user.id,

            robloxUsername: eligibility.robloxUsername || robloxUsernameInput,
            robloxDisplayName: eligibility.robloxDisplayName || "-",
            robloxUserId: eligibility.userId ?? null,
            robloxJoinTime: eligibility.joinTime ?? null,
            robloxDaysInGroup: eligibility.daysInGroup ?? 0,
            robloxEligible: Boolean(eligibility.ok),
            ineligibleReason: eligibility.ok ? null : eligibility.reason,
            failType: eligibility.failType || null,

            tagRequired: tagSettings.enabled,
            tagKeyword: tagSettings.keyword,
            tagValid: eligibility.tagValid ?? !tagSettings.enabled,

            qty,
            baseTotal,
            bankTotal: baseTotal,
            qrisTotal,
            total,
            paymentAmount: null,
            note: note || "",

            status: eligibility.ok ? "AWAITING_PAYMENT" : "INELIGIBLE",
            paymentMethod: null,
            createdAt: nowIso(),
            lastActivityAt: nowIso(),

            autoCloseEnabled: true,
            autoClosePaused: false,
            autoCloseDeadlineAt: new Date(Date.now() + AUTO_CLOSE_MINUTES * 60 * 1000).toISOString(),
          };

          orders.set(orderId, order);
          saveOrders();

          await syncStockAndPanel(client).catch(() => {});

          const statusEmbed = buildCustomerStatusEmbed(order);

          if (order.robloxEligible) {
            await ticket
              .send({
                content: `Halo <@${user.id}> 👋\nBerikut detail order kamu. Silakan pilih **Transfer SeaBank** atau **QRIS** melalui tombol di bawah.`,
                embeds: [statusEmbed],
                components: buildCustomerButtonsEligible(orderId),
              })
              .catch(() => {});

            if (order.note) {
              await ticket.send({ content: `📝 Catatan: ${order.note}` }).catch(() => {});
            }
          } else {
            await ticket
              .send({
                content:
                  `Halo <@${user.id}> 👋\nKamu **belum memenuhi syarat** untuk order.\n` +
                  `⏳ Ticket ini akan auto close dalam **${AUTO_CLOSE_MINUTES} menit**.\n\n` +
                  `Kalau syarat sudah diperbaiki, klik tombol **🔁 Order Robux Ulang** di bawah.`,
                embeds: [statusEmbed],
                components: buildCustomerButtonsIneligible(orderId),
              })
              .catch(() => {});
          }

          return i.editReply(`✅ Ticket dibuat: <#${ticket.id}>`);
        });
      }

      if (!i.isButton()) return;
      if (!i.guild) return;

      const parts = i.customId.split(":");
      const key = parts[0];
      const orderId = parts[1] || parts[2];
      const order = orderId ? orders.get(orderId) : null;

      const needsOrder = [
        "ob_qris",
        "ob_qris_status",
        "ob_bank",
        "ob_cancel_user",
        "ob_close_ineligible",
        "ob_copy_username",
        "ob_close_ticket",
        "ob_copy_bank",
        "ob_order_retry",
      ];

      if (needsOrder.includes(key)) {
        if (!order) {
          return i.reply({
            content: "Order tidak ditemukan.",
            ephemeral: true,
          });
        }

        if (i.channelId !== order.channelId) {
          return i.reply({
            content: "Tombol ini hanya valid di ticket ini.",
            ephemeral: true,
          });
        }
      }

      if (key === "ob_order_retry") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        await syncStockAndPanel(client).catch(() => {});

        if (!isOrderOpen()) {
          return i.reply({
            content: "🔒 Order Robux sedang **CLOSE**. Silakan tunggu info dari staff.",
            ephemeral: true,
          });
        }

        if (!isStockReady()) {
          return i.reply({
            content:
              "⛔ Stok Robux sedang **HABIS**.\n" +
              "Silakan tunggu update stok ready, lalu klik tombol ini lagi.",
            ephemeral: true,
          });
        }

        return i.showModal(buildOrderModal());
      }

      if (key === "ob_copy_username") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        return i.reply({
          content: `📋 Copy username berikut:\n\`\`\`\n${order.robloxUsername}\n\`\`\``,
          ephemeral: true,
        });
      }

      if (key === "ob_copy_bank") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        return i.reply({
          content: `🏦 Copy nomor rekening berikut:\n\`\`\`\n${SEABANK_ACCOUNT}\n\`\`\``,
          ephemeral: true,
        });
      }

      if (key === "ob_qris") {
        if (!order.robloxEligible) {
          return i.reply({
            content: "Order ini tidak eligible.",
            ephemeral: true,
          });
        }

        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        if (
          order.paymentMethod === "SEABANK_TRANSFER" ||
          (["AWAITING_PROOF", "PROOF_SUBMITTED"].includes(order.status) && !order.midtransOrderId)
        ) {
          return i.reply({
            content:
              "🏦 Metode pembayaran order ini sudah dikunci ke **Transfer SeaBank**. " +
              "Silakan lanjut transfer dan upload bukti. Jika ingin QRIS, close order lalu buat order baru.",
            ephemeral: true,
          });
        }

        if (!isMidtransConfigured()) {
          return i.reply({
            content:
              "⚠️ Midtrans belum dikonfigurasi. Staff perlu mengisi `MIDTRANS_SERVER_KEY` di `.env` lalu restart bot.",
            ephemeral: true,
          });
        }

        if (["PAID", "DONE"].includes(order.status)) {
          return i.reply({
            content: "✅ Pembayaran order ini sudah terverifikasi.",
            ephemeral: true,
          });
        }

        if (["CANCELLED", "EXPIRED", "CLOSED"].includes(order.status)) {
          return i.reply({
            content: "Order ini sudah ditutup/expired dan tidak bisa dibayar.",
            ephemeral: true,
          });
        }

        if (qrisCreationLocks.has(order.orderId)) {
          return i.reply({
            content: "⏳ QRIS untuk order ini sedang dibuat. Tunggu sebentar.",
            ephemeral: true,
          });
        }

        qrisCreationLocks.add(order.orderId);
        await i.deferReply();

        try {
          await createMidtransQris(order);

          if (order.status === "QRIS_PENDING") {
            setAutoCloseDeadline(order, AUTO_CLOSE_MINUTES, "qris_created");
          }

          orders.set(order.orderId, order);
          saveOrders();
          await syncStockAndPanel(client).catch(() => {});

          const alreadyPaid = ["PAID", "DONE"].includes(order.status);
          await i.editReply({
            embeds: [alreadyPaid ? buildQrisPaidEmbed(order) : buildQrisPaymentEmbed(order)],
            components: alreadyPaid ? [] : buildQrisPaymentButtons(order.orderId),
          });

          const paymentMessage = await i.fetchReply().catch(() => null);
          if (paymentMessage?.id) {
            order.paymentMessageId = paymentMessage.id;
            orders.set(order.orderId, order);
            saveOrders();
          }

          // Sinkronisasi sekali lagi setelah message ID tersimpan untuk menutup race dengan webhook.
          getMidtransStatus(order)
            .then((statusData) => applyMidtransStatus(client, order, statusData, "post_create_check"))
            .catch(() => {});
        } catch (error) {
          console.error(`Create Midtrans QRIS ${order.orderId} error:`, error);
          await i
            .editReply({
              content:
                "❌ Gagal membuat QRIS Midtrans. Silakan coba lagi beberapa saat atau hubungi staff.\n" +
                `Kode: \`${String(error?.message || error).slice(0, 180)}\``,
              embeds: [],
              components: [],
            })
            .catch(() => {});
        } finally {
          qrisCreationLocks.delete(order.orderId);
        }

        return;
      }

      if (key === "ob_qris_status") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        if (!order.midtransOrderId) {
          return i.reply({
            content: "QRIS belum dibuat untuk order ini.",
            ephemeral: true,
          });
        }

        await i.deferReply({ ephemeral: true });

        try {
          const statusData = await getMidtransStatus(order);
          await applyMidtransStatus(client, order, statusData, "manual_check");

          const status = String(statusData.transaction_status || "unknown").toUpperCase();
          const latestOrder = orders.get(order.orderId) || order;

          if (["PAID", "DONE"].includes(latestOrder.status)) {
            return i.editReply(
              `✅ Pembayaran sudah **TERVERIFIKASI**. Total: **Rp ${fmtIDR(getPaymentTotal(latestOrder))}**.`
            );
          }

          return i.editReply(`🔄 Status Midtrans saat ini: **${status}**.`);
        } catch (error) {
          console.error(`Manual Midtrans status ${order.orderId} error:`, error);
          return i.editReply("⚠️ Gagal mengecek status Midtrans. Coba lagi beberapa saat.");
        }
      }

      if (key === "ob_bank") {
        if (!order.robloxEligible) {
          return i.reply({
            content: "Order ini tidak eligible.",
            ephemeral: true,
          });
        }

        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        if (order.midtransOrderId || (order.paymentMethod === "MIDTRANS_QRIS" && !isLegacySeaBankOrder(order))) {
          return i.reply({
            content:
              "📱 Metode pembayaran order ini sudah dikunci ke **QRIS**. " +
              "Silakan selesaikan QRIS yang sudah dibuat. Jika ingin SeaBank, close order lalu buat order baru.",
            ephemeral: true,
          });
        }

        const bankTotal = getBankTotal(order);
        order.paymentMethod = "SEABANK_TRANSFER";
        order.paymentAmount = bankTotal;
        order.total = bankTotal; // backward compatibility: total = nominal metode yang dipilih
        order.status = "AWAITING_PROOF";

        setAutoCloseDeadline(order, AUTO_CLOSE_MINUTES, "bank_transfer_clicked");

        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});

        await i.reply({
          embeds: [buildSeaBankInstructions(order)],
          components: buildPaymentButtons(order.orderId),
        });

        await i.channel
          .send(
            `📌 Setelah transfer, kirim **bukti pembayaran (file apapun / gambar / dokumen / forward)** di sini. ` +
              `Jika dalam **${AUTO_CLOSE_MINUTES} menit** tidak kirim bukti pembayaran, order akan di close otomatis.`
          )
          .catch(() => {});

        return;
      }

      if (key === "ob_cancel_user") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        if (["PAID", "DONE"].includes(order.status)) {
          return i.reply({
            content:
              order.status === "PAID"
                ? "Pembayaran sudah **TERVERIFIKASI**. Order tidak bisa dibatalkan dari tombol ini; hubungi staff jika ada kendala."
                : "Order sudah **DONE**. Tidak bisa cancel. Silakan gunakan tombol **Close Ticket**.",
            ephemeral: true,
          });
        }

        await cancelMidtransPending(order);

        order.status = "CANCELLED";
        order.cancelledAt = nowIso();
        order.autoCloseEnabled = false;
        order.autoClosePaused = false;
        order.autoCloseDeadlineAt = null;

        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});

        await i.reply({
          content: "❌ Order ditutup. Ticket akan dihapus dalam 3 detik...",
          ephemeral: true,
        });

        await deleteTicketChannel(
          i.channel,
          order,
          "❌ Order ditutup oleh user. Ticket akan dihapus...",
          "CANCELLED"
        );

        return;
      }

      if (key === "ob_close_ticket") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk ticket ini.",
            ephemeral: true,
          });
        }

        if (order.status !== "DONE" && !isStaff(member)) {
          return i.reply({
            content: "Ticket ini belum DONE. Jika mau batal, gunakan tombol **Close Order**.",
            ephemeral: true,
          });
        }

        await i.reply({
          content: "🔒 Ticket akan ditutup dan dihapus dalam 3 detik...",
          ephemeral: true,
        });

        await deleteTicketChannel(
          i.channel,
          order,
          "🔒 Ticket ditutup. Channel akan dihapus...",
          "CLOSED"
        );

        return;
      }

      if (key === "ob_close_ineligible") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk ticket ini.",
            ephemeral: true,
          });
        }

        await i.reply({
          content: "🔒 Ticket akan ditutup dan dihapus dalam 3 detik...",
          ephemeral: true,
        });

        await deleteTicketChannel(
          i.channel,
          order,
          "🔒 Ticket ineligible ditutup. Channel akan dihapus...",
          "INELIGIBLE"
        );

        return;
      }
    } catch (e) {
      console.error("interactionCreate error:", e);

      if (i.isRepliable()) {
        if (i.deferred || i.replied) {
          await i.editReply("Terjadi error internal. Cek console/log bot.").catch(() => {});
        } else {
          await i.reply({
            content: "Terjadi error internal. Cek console/log bot.",
            ephemeral: true,
          }).catch(() => {});
        }
      }
    }
  });
}
