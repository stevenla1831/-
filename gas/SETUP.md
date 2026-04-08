# GAS 後端部署說明

## 環境需求

- Google 帳號（與 Firestore 同一個）
- LINE Messaging API channel
- Google Sheets（同一個 Google 帳號）

## 1. 建立 Google Sheets

建立一個新的 Google Spreadsheet，並記下試算表 ID（URL 中 `/d/` 後的部分）。

建立以下分頁：

| 分頁名稱 | 欄位 |
|---------|------|
| `stores` | storeId, name |
| `coupons_{storeId}` | code, type, status, userId, assignedAt |
| `draw_records` | uid, week, couponId |
| `user_coupons` | uid, codes, used_status |

## 2. 建立 Google Apps Script 專案

1. 前往 [script.google.com](https://script.google.com)
2. 建立新專案
3. 將 `Code.gs` 內容貼入編輯器
4. 將 `appsscript.json` 的內容貼入「專案設定 → appsscript.json」

## 3. 設定 Script Properties

「專案設定 → 指令碼屬性」中新增：

| 屬性名稱 | 說明 |
|---------|------|
| `SPREADSHEET_ID` | Google Sheets 的試算表 ID |
| `FIRESTORE_PROJECT` | Firebase 專案 ID（gen-lang-client-0600332943） |
| `LINE_CHANNEL_SECRET` | LINE Messaging API Channel Secret |
| `LINE_CHANNEL_TOKEN` | LINE Messaging API Channel Access Token |

## 4. 部署為 Web App

1. 點選「部署 → 新增部署項目」
2. 類型選「網頁應用程式」
3. 執行身份：「我（部署者）」
4. 存取權限：「所有人（包含匿名）」
5. 複製部署 URL

## 5. 設定 LINE Webhook

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 選擇你的 Messaging API channel
3. 在「Messaging API」→「Webhook URL」填入 GAS 部署 URL
4. 啟用「使用 Webhook」

## 6. 測試

在 GAS 編輯器中執行 `testDraw()` 確認基本流程正常。
