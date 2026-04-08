/**
 * 抽獎系統 GAS 後端 — Code.gs
 *
 * 架構：LINE Webhook → processAction() → Google Sheets（優惠碼庫存）
 *                                      → Firestore（用戶紀錄、週次限制）
 *
 * Google Sheets 分頁結構：
 *   stores          : storeId | name
 *   coupons_{store} : code | type | status (available/assigned/used)
 *   draw_records    : uid | week | couponId
 *   user_coupons    : uid | codes | used_status
 *
 * Firestore 集合：
 *   users/{uid}          — 用戶資料與角色
 *   weeklyDraws/{id}     — 週次限制紀錄
 *   drawRecords/{id}     — 抽獎流水紀錄
 */

// ─── 設定 ────────────────────────────────────────────────────────

const CONFIG = {
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '',
  FIRESTORE_PROJECT: PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT') || '',
  LINE_CHANNEL_SECRET: PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET') || '',
  LINE_CHANNEL_TOKEN: PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN') || '',
};

// ─── LINE Webhook 入口 ────────────────────────────────────────────

/**
 * LINE Platform POST callback — registered as Web App URL.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Validate LINE signature
    if (!verifyLineSignature(e.postData.contents, e.parameter['x-line-signature'])) {
      return ContentService.createTextOutput('Unauthorized').setMimeType(ContentService.MimeType.TEXT);
    }

    for (const event of body.events) {
      handleLineEvent(event);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err);
  }
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function verifyLineSignature(body, signature) {
  if (!signature || !CONFIG.LINE_CHANNEL_SECRET) return true; // skip in dev
  const hash = Utilities.computeHmacSha256Signature(body, CONFIG.LINE_CHANNEL_SECRET);
  const expected = Utilities.base64Encode(hash);
  return expected === signature;
}

// ─── LINE Event Router ────────────────────────────────────────────

function handleLineEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  processAction({ userId, text, replyToken });
}

// ─── 核心 API：processAction() ────────────────────────────────────

/**
 * 主要分派函式
 * @param {{ userId: string, text: string, replyToken: string }} params
 */
function processAction({ userId, text, replyToken }) {
  let replyText = '';

  if (text === '抽獎' || text.startsWith('抽獎 ')) {
    const storeId = text.split(' ')[1] || null;
    replyText = handleDraw(userId, storeId);

  } else if (text === '我的優惠券' || text === '查看優惠券') {
    replyText = handleViewCoupons(userId);

  } else if (text === '店家列表') {
    replyText = handleListStores();

  } else {
    replyText = buildHelpMessage();
  }

  if (replyToken) {
    replyToLine(replyToken, replyText);
  }
  return replyText;
}

// ─── 抽獎邏輯 ────────────────────────────────────────────────────

/**
 * 執行抽獎，包含週次限制與防重複發放
 */
function handleDraw(userId, storeId) {
  // 1. 確認店家
  const stores = getStores();
  const store = storeId
    ? stores.find(s => s.id === storeId)
    : stores[0]; // 若無指定，取第一家

  if (!store) return '找不到指定店家，請輸入「店家列表」查看可用店家。';

  // 2. 週次限制檢查（ISO Week key）
  const week = getISOWeekKey();
  const weekDocId = `${userId}_${store.id}_${week}`;

  if (firestoreDocExists(`weeklyDraws/${weekDocId}`)) {
    return `您本週（${week}）已在「${store.name}」抽過獎了，請下週再來！\n每週一（台灣時間）重置。`;
  }

  // 3. 從 Sheets 取得可用序號
  const coupon = claimAvailableCoupon(store.id, userId);
  if (!coupon) {
    return `很抱歉，「${store.name}」的優惠券庫存已抽完，請稍後再試。`;
  }

  // 4. 寫入 Firestore 週次限制記錄
  const now = Date.now();
  firestoreWrite(`weeklyDraws/${weekDocId}`, {
    userId, storeId: store.id, week,
    couponId: coupon.code, drawnAt: now
  });

  // 5. 寫入 Firestore 抽獎流水紀錄
  const recordId = Utilities.getUuid();
  firestoreWrite(`drawRecords/${recordId}`, {
    id: recordId, userId, storeId: store.id,
    couponId: coupon.code, week, timestamp: now, source: 'draw'
  });

  return `🎉 恭喜！您獲得「${store.name}」的 ${coupon.type} 優惠券！\n\n序號：${coupon.code}\n\n請截圖保存，到店出示兌換。`;
}

// ─── 優惠券操作（Google Sheets）───────────────────────────────────

/**
 * 從 Sheets 的 coupons_{storeId} 分頁取得並鎖定一張可用序號
 * 使用 LockService 防止並發搶奪
 */
function claimAvailableCoupon(storeId, userId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheetName = `coupons_${storeId}`;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return null;

    const data = sheet.getDataRange().getValues();
    // Headers: code | type | status (row 0)
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === 'available') {
        // Mark as assigned
        sheet.getRange(i + 1, 3).setValue('assigned'); // status
        sheet.getRange(i + 1, 4).setValue(userId);     // userId
        sheet.getRange(i + 1, 5).setValue(new Date().toISOString()); // assignedAt
        SpreadsheetApp.flush();
        return { code: data[i][0], type: data[i][1] };
      }
    }
    return null;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 批量匯入優惠碼到 Sheets
 * @param {string} storeId
 * @param {string} type — '100pt' | '50pt' | '20pt'
 * @param {string[]} codes
 * @returns {{ added: number, dupes: number }}
 */
function importCoupons(storeId, type, codes) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetName = `coupons_${storeId}`;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['code', 'type', 'status', 'userId', 'assignedAt']);
  }

  const existing = sheet.getDataRange().getValues().slice(1).map(r => r[0]);
  const existingSet = new Set(existing);
  let added = 0;
  let dupes = 0;

  for (const code of codes) {
    if (existingSet.has(code)) { dupes++; continue; }
    sheet.appendRow([code, type, 'available', '', '']);
    added++;
  }
  return { added, dupes };
}

// ─── 查看自己的優惠券 ────────────────────────────────────────────

function handleViewCoupons(userId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const stores = getStores();
  const lines = [];

  for (const store of stores) {
    const sheetName = `coupons_${store.id}`;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    const data = sheet.getDataRange().getValues().slice(1);
    const mine = data.filter(r => r[3] === userId && r[2] === 'assigned');
    for (const row of mine) {
      lines.push(`【${store.name}】${row[1]} — ${row[0]}`);
    }
  }

  if (lines.length === 0) return '您目前沒有待使用的優惠券。\n輸入「抽獎」參加活動！';
  return '您的優惠券：\n' + lines.join('\n');
}

// ─── 店家列表 ─────────────────────────────────────────────────────

function handleListStores() {
  const stores = getStores();
  if (stores.length === 0) return '目前沒有參與活動的店家。';
  const lines = stores.map((s, i) => `${i + 1}. ${s.name}（輸入「抽獎 ${s.id}」）`);
  return '參與抽獎的店家：\n' + lines.join('\n');
}

function getStores() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('stores');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .filter(r => r[0])
    .map(r => ({ id: String(r[0]), name: String(r[1]) }));
}

// ─── ISO 週次工具 ─────────────────────────────────────────────────

function getISOWeekKey(date) {
  const d = new Date(date || Date.now());
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ─── Firestore REST API ───────────────────────────────────────────

function getFirestoreBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${CONFIG.FIRESTORE_PROJECT}/databases/(default)/documents`;
}

function firestoreDocExists(path) {
  const url = `${getFirestoreBaseUrl()}/${path}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  return res.getResponseCode() === 200;
}

function firestoreWrite(path, data) {
  const url = `${getFirestoreBaseUrl()}/${path}`;
  // Convert JS object → Firestore document format
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  }
  UrlFetchApp.fetch(url, {
    method: 'PATCH',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true
  });
}

// ─── LINE Reply ───────────────────────────────────────────────────

function replyToLine(replyToken, text) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_TOKEN },
    payload: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }]
    }),
    muteHttpExceptions: true
  });
}

// ─── 說明訊息 ─────────────────────────────────────────────────────

function buildHelpMessage() {
  return [
    '📋 抽獎系統指令：',
    '',
    '「抽獎」— 參加抽獎（每週一次）',
    '「抽獎 [店家ID]」— 指定店家抽獎',
    '「我的優惠券」— 查看已獲得的序號',
    '「店家列表」— 查看參與店家',
    '',
    '每週一台灣時間 00:00 重置抽獎次數。'
  ].join('\n');
}

// ─── 手動測試用 ───────────────────────────────────────────────────

function testDraw() {
  const result = processAction({
    userId: 'test-user-001',
    text: '抽獎',
    replyToken: null
  });
  Logger.log(result);
}

function testImport() {
  const result = importCoupons('store-001', '100pt', [
    'CODE001', 'CODE002', 'CODE003'
  ]);
  Logger.log(JSON.stringify(result));
}
