import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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

// ShopeePay Merchant QRIS Statis
// Simpan gambar QRIS asli merchant pada path ini. Tidak memerlukan API/webhook.
const QRIS_STATIC_IMAGE_PATH = path.resolve(
  String(process.env.QRIS_STATIC_IMAGE_PATH || "./assets/qris-shopeepay.png").trim()
);
const QRIS_STATIC_MERCHANT_NAME = String(
  process.env.QRIS_STATIC_MERCHANT_NAME || "BLOXBUX"
).trim();

const PRICE_PER_1000 = Number(process.env.PRICE_PER_1000 || 100000);
const QRIS_ADMIN_PERCENT = Number(process.env.QRIS_ADMIN_PERCENT || 1);
const AUTO_CLOSE_MINUTES = Number(process.env.AUTO_CLOSE_MINUTES || 30);

const STORE_NAME = process.env.STORE_NAME || "BLOXBUX";
const STORE_FOOTER = process.env.STORE_FOOTER || "BLOXBUX — Invoice System";
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
const ORDER_SETTINGS_FILE = path.resolve("./order_settings.json");
const PAYMENT_SETTINGS_FILE = path.resolve("./payment_settings.json");

/** @type {Map<string, any>} */
const orders = new Map();

let orderSettings = {
  open: true,
  minOrderQty: null,
  stockMode: "AUTO",
  manualStockTotal: null,
};

let paymentSettings = {
  seabankEnabled: true,
  qrisEnabled: true,
  qrisAutoEnabled: true,
};

// ========= ORDER OPEN/CLOSE SETTINGS =========
function loadOrderSettings() {
  try {
    if (!fs.existsSync(ORDER_SETTINGS_FILE)) {
      saveOrderSettings();
      return;
    }

    const raw = fs.readFileSync(ORDER_SETTINGS_FILE, "utf-8");
    const json = JSON.parse(raw);

    const minOrderQty = Number(json.minOrderQty);
    const manualStockTotal = Number(json.manualStockTotal);

    orderSettings = {
      open: typeof json.open === "boolean" ? json.open : true,
      minOrderQty:
        Number.isFinite(minOrderQty) && minOrderQty >= 1000 && minOrderQty % 1000 === 0
          ? Math.floor(minOrderQty)
          : null,
      stockMode: json.stockMode === "MANUAL" ? "MANUAL" : "AUTO",
      manualStockTotal:
        Number.isFinite(manualStockTotal) && manualStockTotal >= 0
          ? Math.floor(manualStockTotal)
          : null,
    };

    saveOrderSettings();
  } catch (e) {
    console.error("Failed to load order_settings.json:", e);
    orderSettings = {
      open: true,
      minOrderQty: null,
      stockMode: "AUTO",
      manualStockTotal: null,
    };
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

function getConfiguredMinOrderQty() {
  const qty = Number(orderSettings.minOrderQty);
  return Number.isFinite(qty) && qty >= 1000 && qty % 1000 === 0 ? Math.floor(qty) : null;
}

function isManualStockMode() {
  return orderSettings.stockMode === "MANUAL";
}

function getStockModeLabel() {
  return isManualStockMode() ? "MANUAL" : "OTOMATIS (Username)";
}

// ========= PAYMENT METHOD SETTINGS =========
function loadPaymentSettings() {
  try {
    if (!fs.existsSync(PAYMENT_SETTINGS_FILE)) {
      savePaymentSettings();
      return;
    }

    const raw = fs.readFileSync(PAYMENT_SETTINGS_FILE, "utf-8");
    const json = JSON.parse(raw);

    paymentSettings = {
      seabankEnabled:
        typeof json.seabankEnabled === "boolean" ? json.seabankEnabled : true,
      qrisEnabled: typeof json.qrisEnabled === "boolean" ? json.qrisEnabled : true,
      qrisAutoEnabled:
        typeof json.qrisAutoEnabled === "boolean" ? json.qrisAutoEnabled : true,
    };

    savePaymentSettings();
  } catch (e) {
    console.error("Failed to load payment_settings.json:", e);
    paymentSettings = {
      seabankEnabled: true,
      qrisEnabled: true,
      qrisAutoEnabled: true,
    };
    savePaymentSettings();
  }
}

function savePaymentSettings() {
  try {
    fs.writeFileSync(PAYMENT_SETTINGS_FILE, JSON.stringify(paymentSettings, null, 2));
  } catch (e) {
    console.error("Failed to save payment_settings.json:", e);
  }
}

function isSeaBankEnabled() {
  return paymentSettings.seabankEnabled === true;
}

function isQrisEnabled() {
  return paymentSettings.qrisEnabled === true;
}

function isQrisAutoEnabled() {
  return paymentSettings.qrisAutoEnabled === true;
}

function isQrisAvailable() {
  return isQrisEnabled() && isStaticQrisConfigured();
}

function isAnyPaymentMethodAvailable() {
  return isSeaBankEnabled() || isQrisAvailable() || isQrisAutoEnabled();
}

function getEnabledPaymentMethodLabels() {
  const methods = [];
  if (isSeaBankEnabled()) methods.push("Transfer SeaBank");
  if (isQrisAvailable()) methods.push("QRIS Statis");
  if (isQrisAutoEnabled()) methods.push("QRIS Auto");
  return methods;
}

function buildPaymentChoicePrompt(userId) {
  const methods = getEnabledPaymentMethodLabels();
  if (methods.length === 0) {
    return `Halo <@${userId}> 👋\nSaat ini tidak ada metode pembayaran yang aktif. Silakan hubungi staff.`;
  }

  return (
    `Halo <@${userId}> 👋\nBerikut detail order kamu. Silakan pilih **${methods.join("** atau **")}** melalui tombol di bawah.`
  );
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
      order.status === "DONE"
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

function parseProviderDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    return new Date(`${raw.replace(" ", "T")}+07:00`);
  }

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function fmtProviderDateID(value) {
  const parsed = parseProviderDate(value);
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

function computeBaseTotal(qty) {
  const blocks = qty / 1000;
  return Math.round(blocks * PRICE_PER_1000);
}

function getBankTotal(order) {
  const value = Number(order?.bankTotal ?? order?.baseTotal);
  if (Number.isFinite(value) && value > 0) return Math.round(value);
  return computeBaseTotal(Number(order?.qty || 0));
}

function getQrisAdminPercent() {
  return Number.isFinite(QRIS_ADMIN_PERCENT) && QRIS_ADMIN_PERCENT >= 0
    ? QRIS_ADMIN_PERCENT
    : 1;
}

function getQrisAdminFee(order) {
  const bankTotal = getBankTotal(order);
  return Math.round((bankTotal * getQrisAdminPercent()) / 100);
}

function getQrisTotal(order) {
  // Order QRIS statis baru: harga dasar SeaBank + biaya admin QRIS.
  if (order?.paymentMethod === "SHOPEEPAY_QRIS_STATIC") {
    const explicit = Number(order?.paymentAmount ?? order?.qrisTotal);
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
    return getBankTotal(order) + getQrisAdminFee(order);
  }

  // Kompatibilitas invoice/order lama dari QRIS dinamis Midtrans/ShopeePay.
  if (["SHOPEEPAY_QRIS", "MIDTRANS_QRIS"].includes(order?.paymentMethod)) {
    const legacy = Number(order?.paymentAmount ?? order?.qrisTotal ?? order?.total);
    if (Number.isFinite(legacy) && legacy > 0) return Math.round(legacy);
  }

  return getBankTotal(order) + getQrisAdminFee(order);
}

function isLegacySeaBankOrder(order) {
  return (
    ["AWAITING_PROOF", "PROOF_SUBMITTED"].includes(order?.status) &&
    !["SHOPEEPAY_QRIS_STATIC", "AUTO_QRIS", "SHOPEEPAY_QRIS", "MIDTRANS_QRIS"].includes(
      order?.paymentMethod
    )
  );
}

function getPaymentTotal(order) {
  const explicit = Number(order?.paymentAmount);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  if (order?.paymentMethod === "SHOPEEPAY_QRIS_STATIC") return getQrisTotal(order);
  if (order?.paymentMethod === "AUTO_QRIS") return getBankTotal(order);
  if (["SHOPEEPAY_QRIS", "MIDTRANS_QRIS"].includes(order?.paymentMethod)) {
    return getQrisTotal(order);
  }
  if (order?.paymentMethod === "SEABANK_TRANSFER" || isLegacySeaBankOrder(order)) {
    return getBankTotal(order);
  }

  const legacy = Number(order?.total);
  if (Number.isFinite(legacy) && legacy > 0) return Math.round(legacy);

  return getBankTotal(order);
}

function getPaymentMethodLabel(order) {
  if (order?.paymentMethod === "SHOPEEPAY_QRIS_STATIC") {
    return "QRIS Statis";
  }
  if (order?.paymentMethod === "AUTO_QRIS") {
    return "QRIS Auto";
  }
  if (order?.paymentMethod === "SHOPEEPAY_QRIS") {
    return "QRIS";
  }
  if (order?.paymentMethod === "MIDTRANS_QRIS") return "QRIS (Midtrans - legacy)";
  if (order?.paymentMethod === "SEABANK_TRANSFER" || isLegacySeaBankOrder(order)) {
    return "Bank Transfer (SeaBank)";
  }
  return "Belum dipilih";
}

function isStaticQrisConfigured() {
  try {
    if (!QRIS_STATIC_IMAGE_PATH || !fs.existsSync(QRIS_STATIC_IMAGE_PATH)) return false;
    const stat = fs.statSync(QRIS_STATIC_IMAGE_PATH);
    if (!stat.isFile() || stat.size <= 0) return false;

    const ext = path.extname(QRIS_STATIC_IMAGE_PATH).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
  } catch {
    return false;
  }
}

function getStaticQrisAttachmentName() {
  const ext = path.extname(QRIS_STATIC_IMAGE_PATH).toLowerCase() || ".png";
  return `qris-shopeepay${ext}`;
}

function buildQrisStaticEmbed(order) {
  const baseTotal = getBankTotal(order);
  const adminFee = getQrisAdminFee(order);
  const total = getQrisTotal(order);

  return new EmbedBuilder()
    .setTitle("🟠 PEMBAYARAN QRIS")
    .setDescription(
      [
        `🧾 **Order:** ${order.orderId}`,
        `🎮 **Roblox:** \`${order.robloxUsername}\``,
        `💎 **Jumlah:** ${fmtIDR(order.qty)} Robux`,
        `🏪 **Merchant:** **${QRIS_STATIC_MERCHANT_NAME}**`,
        "",
        `💵 **Harga Robux:** Rp ${fmtIDR(baseTotal)}`,
        `🧾 **Biaya admin QRIS ${getQrisAdminPercent()}%:** Rp ${fmtIDR(adminFee)}`,
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "💰 **TOTAL YANG HARUS DIBAYAR:**",
        `# Rp ${fmtIDR(total)}`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "📲 Scan gambar QRIS di bawah menggunakan aplikasi bank/e-wallet yang mendukung QRIS.",
        "⌨️ Karena ini **QRIS statis**, masukkan nominal pembayaran secara manual.",
        `ℹ️ Pembayaran QRIS dikenakan **biaya admin ${getQrisAdminPercent()}%**.`,
        "⚠️ **Pastikan nominal yang dimasukkan sama persis dengan total di atas.**",
        "",
        "✅ Setelah pembayaran berhasil, kirim bukti pembayaran di chat ticket ini.",
        "👮 Staff/Owner akan mengecek bukti sebelum memproses Robux.",
      ].join("\n")
    )
    .setColor(0xee4d2d)
    .setFooter({ text: "BLOXBUX — QRIS Payment" });
}

function buildQrisStaticPayload(order) {
  if (!isStaticQrisConfigured()) {
    throw new Error(
      `Gambar QRIS statis belum ditemukan. Simpan file pada: ${QRIS_STATIC_IMAGE_PATH}`
    );
  }

  const fileName = getStaticQrisAttachmentName();
  const embed = buildQrisStaticEmbed(order).setImage(`attachment://${fileName}`);

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(QRIS_STATIC_IMAGE_PATH, { name: fileName })],
    components: buildQrisStaticButtons(order.orderId),
  };
}

function buildQrisStaticButtons(orderId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_copy_bank_total:${orderId}`)
        .setLabel("💰 Copy Total Bayar")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ob_cancel_user:${orderId}`)
        .setLabel("❌ Close Order")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
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

// ========= AUTO STOCK ==========
async function robloxGetGroupFunds(groupId) {
  const url = `https://economy.roblox.com/v1/groups/${groupId}/currency`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
      "User-Agent": "BLOXBUX-StockBot/1.0",
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
      "AWAITING_AUTO_QRIS",
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
  source: "AUTO",
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
  const reserved = computeReservedRobux();

  if (isManualStockMode()) {
    const manualTotal = Number(orderSettings.manualStockTotal);
    const safeTotal = Number.isFinite(manualTotal) && manualTotal >= 0 ? Math.floor(manualTotal) : 0;
    const available = Math.max(0, Math.floor(safeTotal - reserved));

    stockCache = {
      ok: true,
      source: "MANUAL",
      groupFunds: safeTotal,
      reserved,
      available,
      updatedAt: nowIso(),
      error: null,
    };

    return { previous, current: { ...stockCache } };
  }

  try {
    const groupFunds = await robloxGetGroupFunds(ROBLOX_GROUP_ID);
    const available = Math.max(0, Math.floor(groupFunds - reserved));

    stockCache = {
      ok: true,
      source: "AUTO",
      groupFunds,
      reserved,
      available,
      updatedAt: nowIso(),
      error: null,
    };
  } catch (e) {
    stockCache = {
      ...stockCache,
      source: "AUTO",
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

function consumeManualStockForCompletedOrder(order) {
  if (!isManualStockMode() || order?.manualStockConsumed === true) return;

  const qty = Math.max(0, Math.floor(Number(order?.qty || 0)));
  const currentTotal = Math.max(0, Math.floor(Number(orderSettings.manualStockTotal || 0)));

  orderSettings.manualStockTotal = Math.max(0, currentTotal - qty);
  order.manualStockConsumed = true;
  saveOrderSettings();
}

function getMinimumProcessableQty() {
  return getConfiguredMinOrderQty() || 1000;
}

function isStockReady() {
  return Number(stockCache?.available || 0) >= getMinimumProcessableQty();
}

function getStockBroadcastMode(available) {
  return Number(available || 0) >= getMinimumProcessableQty() ? "READY" : "OUT";
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

      const itemName = "Robux via Username";
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
    ? `\n_Mode stok: ${getStockModeLabel()} | Updated: ${fmtDateID(stockCache.updatedAt)} WIB_`
    : `\n_Mode stok: ${getStockModeLabel()} | Updated: ${fmtDateID(stockCache.updatedAt)} WIB | Error: ${stockCache.error}_`;

  return new EmbedBuilder()
    .setTitle("💸ORDER ROBUX — VIA USERNAME")
    .setDescription(
      [
        stockLine + stockWarn + stockMeta,
        "",
        "**Syarat sebelum order**",
        getConfiguredMinOrderQty()
          ? `• Minimum order saat ini **${fmtIDR(getConfiguredMinOrderQty())} Robux**`
          : "• Minimum order khusus: **tidak diatur** (tetap kelipatan 1.000 Robux)",
        "",
        "💰 **RATE ROBUX**",
        `💎 1.000 Robux = Rp ${fmtIDR(PRICE_PER_1000)}`,
        `💎 2.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 2)}`,
        `💎 3.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 3)}`,
        `💎 4.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 4)}`,
        `💎 5.000 Robux = Rp ${fmtIDR(PRICE_PER_1000 * 5)}`,
        "➡️ dan seterusnya (kelipatan 1.000)",
        `ℹ️ Pembayaran QRIS Statis dikenakan biaya admin **${getQrisAdminPercent()}%**.`,
        "",
        "💳 **METODE PEMBAYARAN**",
        isSeaBankEnabled()
          ? "• 🏦 **Transfer SeaBank** → transfer manual, upload bukti, lalu staff cek/proses"
          : "• 🏦 **Transfer SeaBank** → **NONAKTIF**",
        isQrisAvailable()
          ? `• 🟠 **QRIS Statis** → scan QR statis, biaya admin ${getQrisAdminPercent()}%, upload bukti, lalu staff cek/proses`
          : isQrisEnabled()
            ? "• 🟠 **QRIS Statis** → **BELUM TERSEDIA (gambar QRIS belum terpasang)**"
            : "• 🟠 **QRIS Statis** → **NONAKTIF**",
        isQrisAutoEnabled()
          ? `• 🟣 **QRIS Auto** → customer menunggu QRIS dibuat Owner/Staff, lalu bayar dan upload bukti`
          : "• 🟣 **QRIS Auto** → **NONAKTIF**",
        "",
        "**Cara order (step by step)**",
        "1) Klik tombol **ORDER ROBUX** di bawah",
        "2) Isi **Username Roblox** & **Jumlah**",
        "3) Ticket dibuat otomatis",
        "4) Pilih metode pembayaran yang sedang aktif",
        "5) SeaBank: transfer → upload bukti → staff cek",
        `6) QRIS Statis: scan QR → bayar harga + admin ${getQrisAdminPercent()}% → upload bukti → staff cek`,
        "7) QRIS Auto: tunggu Owner/Staff mengirim QRIS → bayar → upload bukti",
        "8) Setelah pembayaran valid, staff melanjutkan pengiriman Robux",
        "",
        "⚠️ **Metode pembayaran terkunci setelah dipilih. Jika salah pilih, close order lalu buat order baru.**",
      ].join("\n")
    )
    .setFooter({ text: "BLOXBUX — Order Robux System" });
}

function buildStockStatusButton() {
  if (!isOrderOpen()) {
    return new ButtonBuilder()
      .setCustomId("ob_stock_info")
      .setLabel("🔒 ORDER: CLOSE")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
  }

  if (!isAnyPaymentMethodAvailable()) {
    return new ButtonBuilder()
      .setCustomId("ob_stock_info")
      .setLabel("💳 PAYMENT: OFF")
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
  const ready = isOrderOpen() && isStockReady() && isAnyPaymentMethodAvailable();

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
    .setTitle("Order Robux - BLOXBUX");

  const username = new TextInputBuilder()
    .setCustomId("roblox_username")
    .setLabel("Username Roblox (tanpa @, bukan Display Name)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const qty = new TextInputBuilder()
    .setCustomId("qty")
    .setLabel(
      getConfiguredMinOrderQty()
        ? `Jumlah Robux (min ${fmtIDR(getConfiguredMinOrderQty())}; x1000)`
        : "Jumlah Robux (kelipatan 1000)"
    )
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
  const desc = [
    `👤 **Username Roblox:** \`${order.robloxUsername}\``,
    `🏷️ **Display Name:** \`${order.robloxDisplayName || "-"}\``,
    "",
    `💎 **Total Robux:** ${fmtIDR(order.qty)}`,
    `📌 **Rate:** Rp ${fmtIDR(PRICE_PER_1000)} / 1.000 Robux`,
    "",
    "💳 **Pilih Metode Pembayaran:**",
    isSeaBankEnabled()
      ? `🏦 **Transfer SeaBank:** Rp ${fmtIDR(getBankTotal(order))}`
      : "🏦 **Transfer SeaBank:** NONAKTIF",
    isQrisAvailable()
      ? `🟠 **QRIS Statis:** Rp ${fmtIDR(getQrisTotal(order))} *(termasuk admin ${getQrisAdminPercent()}%)*`
      : "🟠 **QRIS Statis:** NONAKTIF",
    isQrisAutoEnabled()
      ? "🟣 **QRIS Auto:** tunggu QRIS pembayaran dari Owner/Staff"
      : "🟣 **QRIS Auto:** NONAKTIF",
    "",
    "🏦 **SeaBank:** transfer sesuai nominal → upload bukti transfer → tunggu staff cek.",
    `📱 **QRIS Statis:** scan QR statis → bayar total termasuk admin ${getQrisAdminPercent()}% → upload bukti → tunggu staff cek.`,
    "🟣 **QRIS Auto:** setelah dipilih, tunggu Owner/Staff mengirim QRIS pembayaran di ticket.",
    "",
    "⚠️ Setelah salah satu metode dipilih, metode pembayaran dikunci untuk order ini.",
  ].join("\n");

  return new EmbedBuilder()
    .setTitle(`BLOXBUX — Ticket ${order.orderId}`)
    .setDescription(desc)
    .setColor(0x2ecc71)
    .setFooter({ text: "BLOXBUX — Order System" });
}

function buildCustomerButtonsEligible(orderId) {
  const paymentButtons = [];

  if (isSeaBankEnabled()) {
    paymentButtons.push(
      new ButtonBuilder()
        .setCustomId(`ob_bank:${orderId}`)
        .setLabel("🏦 Transfer SeaBank")
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (isQrisAvailable()) {
    paymentButtons.push(
      new ButtonBuilder()
        .setCustomId(`ob_qris:${orderId}`)
        .setLabel(`📱 QRIS Statis (+${getQrisAdminPercent()}%)`)
        .setStyle(ButtonStyle.Success)
    );
  }

  if (isQrisAutoEnabled()) {
    paymentButtons.push(
      new ButtonBuilder()
        .setCustomId(`ob_qris_auto:${orderId}`)
        .setLabel("🟣 QRIS Auto")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  paymentButtons.push(
    new ButtonBuilder()
      .setCustomId(`ob_cancel_user:${orderId}`)
      .setLabel("❌ Close Order")
      .setStyle(ButtonStyle.Danger)
  );

  return [
    new ActionRowBuilder().addComponents(...paymentButtons),
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

function buildSeaBankInstructions(order) {
  const bankTotal = getBankTotal(order);

  return new EmbedBuilder()
    .setTitle("🏦 PEMBAYARAN SEABANK — PERHATIKAN DATA TRANSFER")
    .setDescription(
      [
        `🧾 **Order:** ${order.orderId}`,
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "🏦 **BANK TUJUAN: SEABANK**",
        `💳 **NOMOR REKENING:**`,
        `## ${SEABANK_ACCOUNT}`,
        `👤 **ATAS NAMA:** **${SEABANK_NAME}**`,
        "",
        `💰 **TOTAL YANG HARUS DIBAYAR:**`,
        `# Rp ${fmtIDR(bankTotal)}`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "⚠️ **Transfer harus sesuai rekening dan total di atas.**",
        "✅ Setelah transfer, kirim bukti pembayaran di chat ticket ini.",
        "👮 Staff/Owner akan mengecek bukti sebelum memproses Robux.",
      ].join("\n")
    )
    .setColor(0xffb000)
    .setFooter({ text: "BLOXBUX — SeaBank Transfer" });
}

function buildPaymentButtons(orderId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ob_copy_bank:${orderId}`)
        .setLabel("📋 Copy No. Rekening")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ob_copy_bank_total:${orderId}`)
        .setLabel("💰 Copy Total Bayar")
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
        "🎯 **Via Username**",
        "",
        `🛒 **Langsung order ke <#${PANEL_CHANNEL_ID}>**`,
        "",
        "❗ **Buruan order sebelum stok berubah lagi!**",
      ].join("\n")
    )
    .setFooter({ text: "BLOXBUX — Realtime Stock Update" })
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
    .setFooter({ text: "BLOXBUX — Realtime Stock Update" })
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
    .setFooter({ text: "BLOXBUX — Railway Redeploy Stock Update" })
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
    .setFooter({ text: "BLOXBUX — Manual Order Update" })
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
        "Layanan   : Robux via Username",
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
    .setFooter({ text: "BLOXBUX — Testimoni Order" })
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
    const isQris = ["SHOPEEPAY_QRIS_STATIC", "AUTO_QRIS"].includes(order.paymentMethod);
    const proofAttachments = isQris && Array.isArray(order.proofAttachments)
      ? order.proofAttachments.filter((attachment) => attachment?.url).slice(0, 10)
      : [];

    const payload = {
      content:
        "@everyone\n✨ **Testimoni order baru berhasil diproses!** ✨" +
        (proofAttachments.length > 0
          ? "\n📎 Bukti pembayaran QRIS Order Robux - BLOXBUX."
          : ""),
      embeds: [buildTestimoniEmbed(order, customerUser, staffUser)],
      allowedMentions: { parse: ["everyone"] },
    };

    if (proofAttachments.length > 0) {
      payload.files = proofAttachments.map((attachment, index) => ({
        attachment: attachment.url,
        name: attachment.name || `bukti-qris-${order.orderId}-${index + 1}`,
      }));
    }

    try {
      await channel.send(payload);
    } catch (uploadError) {
      // Testimoni tetap harus terkirim apabila Discord gagal mengambil ulang file bukti.
      console.error(
        `Failed to attach QRIS proof to final testimonial ${order.orderId}:`,
        uploadError
      );

      const proofLinks = proofAttachments
        .map((attachment, index) => `${index + 1}. ${attachment.url}`)
        .join("\n");

      await channel.send({
        content:
          "@everyone\n✨ **Testimoni order baru berhasil diproses!** ✨" +
          (proofLinks
            ? `\n📎 Discord gagal mengunggah ulang file bukti. Tautan bukti:\n${proofLinks}`
            : ""),
        embeds: [buildTestimoniEmbed(order, customerUser, staffUser)],
        allowedMentions: { parse: ["everyone"] },
      });
    }
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
    const terminal = new Set(["DONE", "CANCELLED", "EXPIRED", "CLOSED"]);

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

async function findPaymentChoiceMessage(channel, order) {
  if (!channel || !order) return null;

  if (order.paymentChoiceMessageId) {
    const direct = await channel.messages.fetch(order.paymentChoiceMessageId).catch(() => null);
    if (direct) return direct;
  }

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return null;

  return (
    messages.find((message) =>
      message.components?.some((row) =>
        row.components?.some((component) =>
          [
            `ob_bank:${order.orderId}`,
            `ob_qris:${order.orderId}`,
            `ob_qris_auto:${order.orderId}`,
            `ob_cancel_user:${order.orderId}`,
          ].includes(component.customId)
        )
      )
    ) || null
  );
}

async function refreshPendingPaymentChoiceMessages(client) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;

  for (const order of orders.values()) {
    if (order.status !== "AWAITING_PAYMENT" || order.paymentMethod) continue;
    if (!order.channelId) continue;

    const channel = await guild.channels.fetch(order.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) continue;

    const message = await findPaymentChoiceMessage(channel, order);
    if (!message) continue;

    await message
      .edit({
        content: buildPaymentChoicePrompt(order.userId),
        embeds: [buildCustomerStatusEmbed(order)],
        components: buildCustomerButtonsEligible(order.orderId),
      })
      .catch((error) =>
        console.error(`Failed to refresh payment buttons for ${order.orderId}:`, error)
      );

    if (message.id !== order.paymentChoiceMessageId) {
      order.paymentChoiceMessageId = message.id;
      orders.set(order.orderId, order);
    }
  }

  saveOrders();
}

function setPaymentMethodEnabled(method, enabled) {
  if (method === "SEABANK" || method === "ALL") {
    paymentSettings.seabankEnabled = enabled;
  }
  if (method === "QRIS" || method === "ALL") {
    paymentSettings.qrisEnabled = enabled;
  }
  if (method === "QRIS_AUTO" || method === "ALL") {
    paymentSettings.qrisAutoEnabled = enabled;
  }
  savePaymentSettings();
}

function buildPaymentSettingsStatus() {
  const qrisDetail = isQrisEnabled()
    ? isStaticQrisConfigured()
      ? "ENABLE"
      : "ENABLE, tetapi gambar QRIS belum ditemukan"
    : "DISABLE";

  return (
    `🏦 SeaBank: **${isSeaBankEnabled() ? "ENABLE" : "DISABLE"}**\n` +
    `📱 QRIS Statis: **${qrisDetail}**\n` +
    `🟣 QRIS Auto: **${isQrisAutoEnabled() ? "ENABLE" : "DISABLE"}**`
  );
}

export function setupOrderRobux(discordClient) {
  client = discordClient;
  loadOrders();
  loadOrderSettings();
  loadPaymentSettings();
  client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    if (!isStaticQrisConfigured()) {
      console.warn(
        `⚠️ Gambar QRIS statis belum ditemukan. Tombol Bayar QRIS dinonaktifkan. Path: ${QRIS_STATIC_IMAGE_PATH}`
      );
    } else {
      console.log(`✅ QRIS tersedia: ${QRIS_STATIC_IMAGE_PATH}`);
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

      new SlashCommandBuilder()
        .setName("enable")
        .setDescription("Staff: aktifkan metode pembayaran")
        .addStringOption((option) =>
          option
            .setName("metode")
            .setDescription("Metode pembayaran yang diaktifkan")
            .setRequired(true)
            .addChoices(
              { name: "SeaBank", value: "SEABANK" },
              { name: "QRIS Statis", value: "QRIS" },
              { name: "QRIS Auto", value: "QRIS_AUTO" },
              { name: "Semua metode", value: "ALL" }
            )
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("disable")
        .setDescription("Staff: matikan metode pembayaran")
        .addStringOption((option) =>
          option
            .setName("metode")
            .setDescription("Metode pembayaran yang dimatikan")
            .setRequired(true)
            .addChoices(
              { name: "SeaBank", value: "SEABANK" },
              { name: "QRIS Statis", value: "QRIS" },
              { name: "QRIS Auto", value: "QRIS_AUTO" },
              { name: "Semua metode", value: "ALL" }
            )
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("minimalorder")
        .setDescription("Staff: atur minimal order Robux")
        .addStringOption((option) =>
          option
            .setName("aksi")
            .setDescription("Pilih aksi")
            .setRequired(true)
            .addChoices(
              { name: "status", value: "STATUS" },
              { name: "set", value: "SET" },
              { name: "hapus minimum", value: "HAPUS" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("jumlah")
            .setDescription("Minimal Robux, contoh 2000 (kelipatan 1000)")
            .setRequired(false)
            .setMinValue(1000)
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("stokrobux")
        .setDescription("Staff: pilih stok otomatis atau set stok manual")
        .addStringOption((option) =>
          option
            .setName("aksi")
            .setDescription("Pilih mode/aksi stok")
            .setRequired(true)
            .addChoices(
              { name: "status", value: "STATUS" },
              { name: "otomatis (Username)", value: "AUTO" },
              { name: "manual", value: "MANUAL" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("jumlah")
            .setDescription("Stok tersedia saat mode manual")
            .setRequired(false)
            .setMinValue(0)
        )
        .toJSON(),
    ]);

    // Hapus command lama /tagmap dari versi sebelumnya agar syarat nama/tag UCVR tidak bisa diaktifkan lagi.
    const legacyCommands = await guild.commands.fetch();
    const legacyTagMapCommand = legacyCommands.find((cmd) => cmd.name === "tagmap");
    if (legacyTagMapCommand) {
      await guild.commands.delete(legacyTagMapCommand.id).catch((e) =>
        console.error("Failed to remove legacy /tagmap command:", e)
      );
    }

    console.log(
      "Slash commands /proses, /order, /enable, /disable, /minimalorder, and /stokrobux registered."
    );

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

      const staffSentAutoQris =
        order.status === "AWAITING_AUTO_QRIS" &&
        !isCustomer &&
        ((msg.attachments && msg.attachments.size > 0) ||
          msg.embeds?.some((embed) => embed?.image?.url || embed?.thumbnail?.url) ||
          /https?:\/\/\S+\.(?:png|jpe?g|webp)(?:\?\S*)?/i.test(msg.content || ""));

      if (staffSentAutoQris) {
        order.status = "AWAITING_PROOF";
        order.autoQrisSentAt = nowIso();
        order.autoQrisMessageId = msg.id;
        setAutoCloseDeadline(order, AUTO_CLOSE_MINUTES, "auto_qris_sent_by_staff");
        orders.set(order.orderId, order);
        saveOrders();
        await syncStockAndPanel(client).catch(() => {});

        // Send payment instructions with 2-minute warning
        await msg.channel.send({
          content:
            `🔔 **SEGERA LAKUKAN PEMBAYARAN VIA QRIS DI BAWAH INI**\n\n` +
            `📱 Cara pembayaran:\n` +
            `1️⃣ Scan atau simpan gambar QRIS terlebih dahulu\n` +
            `2️⃣ Lakukan pembayaran sesuai nominal\n` +
            `3️⃣ Upload bukti pembayaran di ticket ini\n\n` +
            `⏰ **QRIS hanya berlaku 2 MENIT!**\n` +
            `Jika sudah 2 menit, QRIS otomatis terhapus dan kamu harus klik tombol meminta QRIS baru.`,
        }).catch(() => {});

        // Schedule auto-delete of QRIS message after 2 minutes
        setTimeout(async () => {
          try {
            const channel = await client.channels.fetch(msg.channelId).catch(() => null);
            if (channel) {
              const qrisMessage = await channel.messages.fetch(msg.id).catch(() => null);
              if (qrisMessage) {
                await qrisMessage.delete("QRIS Auto expired after 2 minutes").catch(() => {});
                
                // Send notification that QRIS expired
                await channel.send({
                  content:
                    `⏰ **QRIS TELAH EXPIRED!**\n\n` +
                    `QRIS pembayaran telah dihapus karena sudah lewat 2 menit.\n` +
                    `Silakan klik tombol **🟣 QRIS Auto** lagi untuk meminta QRIS baru.`,
                }).catch(() => {});
              }
            }
          } catch (e) {
            console.error("Failed to auto-delete QRIS message:", e);
          }
        }, 2 * 60 * 1000); // 2 minutes

        return;
      }

      if (order.status === "AWAITING_PROOF" && isCustomer) {
        const hasAnyAttachment = msg.attachments && msg.attachments.size > 0;
        if (!hasAnyAttachment) return;

        const selectedMethod = ["SHOPEEPAY_QRIS_STATIC", "AUTO_QRIS"].includes(
          order.paymentMethod
        )
          ? order.paymentMethod
          : "SEABANK_TRANSFER";
        const paymentTotal = getPaymentTotal(order);

        order.status = "PROOF_SUBMITTED";
        order.paymentMethod = selectedMethod;
        order.paymentAmount = paymentTotal;
        order.total = paymentTotal;
        order.proofSubmittedAt = nowIso();
        order.proofMessageId = msg.id;
        order.proofAttachments = Array.from(msg.attachments.values()).map((attachment) => ({
          id: attachment.id,
          name: attachment.name || null,
          url: attachment.url,
          contentType: attachment.contentType || null,
          size: attachment.size || null,
        }));
        order.autoCloseEnabled = false;
        order.autoClosePaused = false;
        order.autoCloseDeadlineAt = null;

        touchActivity(order, "proof_any_file_submitted");

        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});

        await msg.channel
          .send(
            `✅ Bukti pembayaran **${getPaymentMethodLabel(order)}** diterima dari <@${order.userId}>.\n` +
              `📎 Tipe bukti: **file/forward**\n` +
              `💰 Nominal order: **Rp ${fmtIDR(getPaymentTotal(order))}**\n` +
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
      if (
        i.isChatInputCommand() &&
        (i.commandName === "enable" || i.commandName === "disable")
      ) {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);

        if (!isStaff(member)) {
          return i.reply({ content: "Khusus staff/owner.", ephemeral: true });
        }

        const method = i.options.getString("metode", true);
        const enabled = i.commandName === "enable";

        setPaymentMethodEnabled(method, enabled);

        await refreshPanelMessage(client).catch(() => {});
        await refreshPendingPaymentChoiceMessages(client).catch(() => {});

        const methodLabel =
          method === "SEABANK"
            ? "SeaBank"
            : method === "QRIS"
              ? "QRIS Statis"
              : method === "QRIS_AUTO"
                ? "QRIS Auto"
                : "semua metode pembayaran";

        const qrisWarning =
          enabled && (method === "QRIS" || method === "ALL") && !isStaticQrisConfigured()
            ? `\n⚠️ QRIS sudah berstatus ENABLE, tetapi tombol belum muncul sampai gambar QRIS tersedia di \`${QRIS_STATIC_IMAGE_PATH}\`.`
            : "";

        return i.reply({
          content:
            `${enabled ? "✅" : "⛔"} **${methodLabel}** sudah **${
              enabled ? "DIAKTIFKAN" : "DINONAKTIFKAN"
            }**.\n\n` +
            `${buildPaymentSettingsStatus()}${qrisWarning}`,
          ephemeral: true,
        });
      }

      if (i.isChatInputCommand() && i.commandName === "minimalorder") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        if (!isStaff(member)) {
          return i.reply({ content: "Khusus staff/owner.", ephemeral: true });
        }

        const aksi = i.options.getString("aksi", true);
        const jumlah = i.options.getInteger("jumlah");

        if (aksi === "STATUS") {
          const min = getConfiguredMinOrderQty();
          return i.reply({
            content: min
              ? `📏 Minimal order saat ini: **${fmtIDR(min)} Robux**.`
              : "📏 Minimal order khusus saat ini: **KOSONG / TANPA MINIMUM TAMBAHAN**. Order tetap wajib kelipatan 1.000 Robux.",
            ephemeral: true,
          });
        }

        if (aksi === "HAPUS") {
          orderSettings.minOrderQty = null;
          saveOrderSettings();
          await refreshPanelMessage(client).catch(() => {});
          return i.reply({
            content: "✅ Minimal order khusus sudah **DIHAPUS**. Sekarang tidak ada minimum tambahan; jumlah tetap kelipatan 1.000 Robux.",
            ephemeral: true,
          });
        }

        if (aksi === "SET") {
          if (!Number.isInteger(jumlah) || jumlah < 1000 || jumlah % 1000 !== 0) {
            return i.reply({
              content: "❌ Isi `jumlah` dengan kelipatan 1.000. Contoh: 2000, 3000, 5000.",
              ephemeral: true,
            });
          }

          orderSettings.minOrderQty = jumlah;
          saveOrderSettings();
          await refreshPanelMessage(client).catch(() => {});
          return i.reply({
            content: `✅ Minimal order berhasil diset menjadi **${fmtIDR(jumlah)} Robux**.`,
            ephemeral: true,
          });
        }

        return i.reply({ content: "Aksi tidak valid.", ephemeral: true });
      }

      if (i.isChatInputCommand() && i.commandName === "stokrobux") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        if (!isStaff(member)) {
          return i.reply({ content: "Khusus staff/owner.", ephemeral: true });
        }

        const aksi = i.options.getString("aksi", true);
        const jumlah = i.options.getInteger("jumlah");

        if (aksi === "STATUS") {
          await syncStockAndPanel(client, { suppressBroadcast: true }).catch(() => {});
          return i.reply({
            content:
              `📦 **Status Stok Robux**\n` +
              `Mode: **${getStockModeLabel()}**\n` +
              `Stok tersedia: **${fmtIDR(stockCache.available)} Robux**\n` +
              `Reserved order aktif: **${fmtIDR(stockCache.reserved)} Robux**`,
            ephemeral: true,
          });
        }

        if (aksi === "AUTO") {
          orderSettings.stockMode = "AUTO";
          orderSettings.manualStockTotal = null;
          saveOrderSettings();
          await syncStockAndPanel(client, { suppressBroadcast: true }).catch(() => {});
          return i.reply({
            content:
              `✅ Mode stok diubah ke **OTOMATIS (Username)**.\n` +
              `Stok tersedia saat ini: **${stockCache.ok ? `${fmtIDR(stockCache.available)} Robux` : "gagal fetch"}**.`,
            ephemeral: true,
          });
        }

        if (aksi === "MANUAL") {
          if (!Number.isInteger(jumlah) || jumlah < 0) {
            return i.reply({
              content: "❌ Untuk mode manual, isi `jumlah` stok Robux. Contoh: `/stokrobux aksi:manual jumlah:10000`.",
              ephemeral: true,
            });
          }

          const reserved = computeReservedRobux();
          orderSettings.stockMode = "MANUAL";
          // Simpan gross stock agar angka yang diinput tampil sebagai stok AVAILABLE saat command dijalankan.
          orderSettings.manualStockTotal = jumlah + reserved;
          saveOrderSettings();
          await syncStockAndPanel(client, { suppressBroadcast: true }).catch(() => {});
          return i.reply({
            content:
              `✅ Mode stok diubah ke **MANUAL**.\n` +
              `Stok tersedia diset: **${fmtIDR(jumlah)} Robux**.`,
            ephemeral: true,
          });
        }

        return i.reply({ content: "Aksi tidak valid.", ephemeral: true });
      }

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
              `Stok Roblox: **${stockCache.ok ? (isStockReady() ? "READY" : "HABIS") : "GAGAL FETCH"}**\n` +
              `Mode Stok: **${getStockModeLabel()}**\n` +
              `Stok Tersedia: **${fmtIDR(stockCache.available)} Robux**\n` +
              `Minimal Order: **${getConfiguredMinOrderQty() ? `${fmtIDR(getConfiguredMinOrderQty())} Robux` : "tidak diatur"}**\n\n` +
              buildPaymentSettingsStatus(),
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
                ? "Order QRIS versi lama masih berstatus **PENDING** dan tidak dapat diverifikasi otomatis oleh mode QRIS statis."
                : order.status === "AWAITING_PROOF"
                  ? `${getPaymentMethodLabel(order)} masih menunggu **bukti pembayaran dari customer**. Staff belum bisa menyelesaikan order.`
                  : "Pembayaran belum terverifikasi.",
            ephemeral: true,
          });
        }

        consumeManualStockForCompletedOrder(order);
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

        if (!isAnyPaymentMethodAvailable()) {
          return i.reply({
            content: "⛔ Saat ini tidak ada metode pembayaran yang aktif. Silakan hubungi staff.",
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

        if (!isAnyPaymentMethodAvailable()) {
          return i.reply({
            content: "⛔ Saat ini tidak ada metode pembayaran yang aktif. Silakan hubungi staff.",
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
            return i.editReply("Jumlah harus minimal 1.000 Robux dan kelipatan 1.000.");
          }

          const configuredMin = getConfiguredMinOrderQty();
          if (configuredMin && qty < configuredMin) {
            return i.editReply(
              `❌ Minimal order saat ini **${fmtIDR(configuredMin)} Robux**. Silakan input minimal ${fmtIDR(configuredMin)}.`
            );
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

          if (!isAnyPaymentMethodAvailable()) {
            return i.editReply(
              "⛔ Order tidak dapat dibuat karena saat ini tidak ada metode pembayaran yang aktif."
            );
          }

          const orderId = newOrderId();
          const baseTotal = computeBaseTotal(qty);
          const qrisTotal = baseTotal + Math.round((baseTotal * getQrisAdminPercent()) / 100); // QRIS + biaya admin
          const total = baseTotal; // nominal final dikunci saat metode dipilih

          const guild = await client.guilds.fetch(GUILD_ID);
          const user = i.user;

          let ticket;

          try {
            const ticketName = `bb-${orderId}`.toLowerCase();

            ticket = await guild.channels.create({
              name: ticketName,
              type: ChannelType.GuildText,
              parent: TICKET_CATEGORY_ID,
              topic: `BLOXBUX | ${orderId} | User: ${user.id} | Roblox: ${robloxUsernameInput}`,
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

            robloxUsername: robloxUsernameInput,
            robloxDisplayName: "-",

            qty,
            stockModeAtCreation: isManualStockMode() ? "MANUAL" : "AUTO",
            baseTotal,
            bankTotal: baseTotal,
            qrisTotal,
            total,
            paymentAmount: null,
            note: note || "",

            status: "AWAITING_PAYMENT",
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

          const paymentChoiceMessage = await ticket
            .send({
              content: buildPaymentChoicePrompt(user.id),
              embeds: [statusEmbed],
              components: buildCustomerButtonsEligible(orderId),
            })
            .catch(() => null);

          if (paymentChoiceMessage) {
            order.paymentChoiceMessageId = paymentChoiceMessage.id;
            orders.set(order.orderId, order);
            saveOrders();
          }

          if (order.note) {
            await ticket.send({ content: `📝 Catatan: ${order.note}` }).catch(() => {});
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
        "ob_qris_auto",
        "ob_bank",
        "ob_cancel_user",
        "ob_copy_username",
        "ob_close_ticket",
        "ob_copy_bank",
        "ob_copy_bank_total",
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


      if (key === "ob_copy_bank_total") {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({
            content: "Kamu tidak punya akses untuk order ini.",
            ephemeral: true,
          });
        }

        return i.reply({
          content: `💰 Copy total pembayaran berikut:
\`\`\`
${getPaymentTotal(order)}
\`\`\`
**Format:** Rp ${fmtIDR(getPaymentTotal(order))}`,
          ephemeral: true,
        });
      }

      if (key === "ob_qris_auto") {
        if (!isQrisAutoEnabled() && order.paymentMethod !== "AUTO_QRIS") {
          return i.reply({
            content: "⛔ Pembayaran via QRIS Auto sedang dinonaktifkan oleh staff.",
            ephemeral: true,
          });
        }

        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);
        if (!allowed) {
          return i.reply({ content: "Kamu tidak punya akses untuk order ini.", ephemeral: true });
        }

        if (order.paymentMethod && order.paymentMethod !== "AUTO_QRIS") {
          return i.reply({
            content:
              `Metode pembayaran order ini sudah dikunci ke **${getPaymentMethodLabel(order)}**. ` +
              "Jika ingin QRIS Auto, close order lalu buat order baru.",
            ephemeral: true,
          });
        }

        if (["PAID", "DONE", "PROOF_SUBMITTED"].includes(order.status)) {
          return i.reply({
            content:
              order.status === "PROOF_SUBMITTED"
                ? "✅ Bukti pembayaran sudah dikirim dan sedang menunggu pengecekan staff."
                : "✅ Pembayaran/order ini sudah diproses.",
            ephemeral: true,
          });
        }

        if (["CANCELLED", "EXPIRED", "CLOSED"].includes(order.status)) {
          return i.reply({
            content: "Order ini sudah ditutup/expired dan tidak bisa dibayar.",
            ephemeral: true,
          });
        }

        if (order.status === "AWAITING_AUTO_QRIS" && order.paymentMethod === "AUTO_QRIS") {
          return i.reply({
            content: "⏳ Mohon tunggu sebentar, QRIS pembayaran sedang dibuat oleh Owner/Staff.",
            ephemeral: true,
          });
        }

        const total = getBankTotal(order);
        order.paymentMethod = "AUTO_QRIS";
        order.paymentAmount = total;
        order.qrisTotal = total;
        order.total = total;
        order.status = "AWAITING_AUTO_QRIS";
        order.autoCloseEnabled = false;
        order.autoClosePaused = true;
        order.autoCloseDeadlineAt = null;
        touchActivity(order, "auto_qris_requested");
        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});
        return i.reply({
          content: "⏳ Mohon tunggu sebentar, QRIS pembayaran sedang dibuat oleh Owner/Staff.",
        });
      }

      if (key === "ob_qris") {
        if (!isQrisEnabled() && order.paymentMethod !== "SHOPEEPAY_QRIS_STATIC") {
          return i.reply({
            content: "⛔ Pembayaran via QRIS sedang dinonaktifkan oleh staff.",
            ephemeral: true,
          });
        }

        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const allowed = i.user.id === order.userId || isStaff(member);

        if (!allowed) {
          return i.reply({ content: "Kamu tidak punya akses untuk order ini.", ephemeral: true });
        }

        if (order.paymentMethod && order.paymentMethod !== "SHOPEEPAY_QRIS_STATIC") {
          return i.reply({
            content:
              `Metode pembayaran order ini sudah dikunci ke **${getPaymentMethodLabel(order)}**. ` +
              "Jika ingin QRIS Statis, close order lalu buat order baru.",
            ephemeral: true,
          });
        }

        if (!isStaticQrisConfigured()) {
          return i.reply({
            content:
              `⚠️ Gambar QRIS statis belum dipasang. Simpan QRIS asli merchant ke \`${QRIS_STATIC_IMAGE_PATH}\` lalu restart bot.`,
            ephemeral: true,
          });
        }

        if (["PAID", "DONE", "PROOF_SUBMITTED"].includes(order.status)) {
          return i.reply({
            content:
              order.status === "PROOF_SUBMITTED"
                ? "✅ Bukti pembayaran sudah dikirim dan sedang menunggu pengecekan staff."
                : "✅ Pembayaran/order ini sudah diproses.",
            ephemeral: true,
          });
        }

        if (["CANCELLED", "EXPIRED", "CLOSED"].includes(order.status)) {
          return i.reply({
            content: "Order ini sudah ditutup/expired dan tidak bisa dibayar.",
            ephemeral: true,
          });
        }

        const total = getQrisTotal(order);

        let paymentPayload;
        try {
          paymentPayload = buildQrisStaticPayload(order);
        } catch (error) {
          console.error(`Show static QRIS ${order.orderId} error:`, error);
          return i.reply({
            content:
              "❌ Gagal menampilkan gambar QRIS statis. Periksa path/file gambar QRIS pada konfigurasi bot.",
            ephemeral: true,
          });
        }

        order.paymentMethod = "SHOPEEPAY_QRIS_STATIC";
        order.paymentAmount = total;
        order.qrisTotal = total;
        order.total = total;
        order.status = "AWAITING_PROOF";

        setAutoCloseDeadline(order, AUTO_CLOSE_MINUTES, "static_qris_clicked");
        orders.set(order.orderId, order);
        saveOrders();

        await syncStockAndPanel(client).catch(() => {});
        await i.reply(paymentPayload);

        await i.channel
          .send(
            `📌 QRIS dikenakan **biaya admin ${getQrisAdminPercent()}%**. Setelah membayar **Rp ${fmtIDR(total)}**, kirim **bukti pembayaran (gambar/file/dokumen/forward)** di sini. ` +
              `Jika dalam **${AUTO_CLOSE_MINUTES} menit** tidak mengirim bukti, order akan ditutup otomatis.`
          )
          .catch(() => {});

        return;
      }

      if (key === "ob_bank") {
        if (!isSeaBankEnabled() && order.paymentMethod !== "SEABANK_TRANSFER") {
          return i.reply({
            content: "⛔ Pembayaran via SeaBank sedang dinonaktifkan oleh staff.",
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
          order.paymentMethod &&
          order.paymentMethod !== "SEABANK_TRANSFER" &&
          !isLegacySeaBankOrder(order)
        ) {
          return i.reply({
            content:
              `Metode pembayaran order ini sudah dikunci ke **${getPaymentMethodLabel(order)}**. ` +
              "Jika ingin SeaBank, close order lalu buat order baru.",
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
            `📌 Setelah transfer, kirim **bukti pembayaran (file/gambar/dokumen/forward)** di sini. ` +
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
