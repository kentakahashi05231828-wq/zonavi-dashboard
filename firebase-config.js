// ZONAVI 利用状況ダッシュボード — Firebase 接続設定
//
// 設定済み（Firebase のウェブアプリ "ZONAVI Dashboard" / 2026-09-05 登録）。
// 値を取り直したいときは:
//   cd 制作物/app/ZONAVI
//   firebase apps:sdkconfig WEB 1:551623719407:web:a99643cf4f9b6f97a39e1a --project zonavi-f51fa
//
// apiKey はウェブに公開される前提の識別子で、秘密鍵ではありません。
// 実際のアクセス制御は Realtime Database のセキュリティルール
// （database.rules.json の analytics ノード＝管理者メールのみ読み取り可）が行います。

export const firebaseConfig = {
  apiKey:            "AIzaSyAdksSKmiNM1JlPn-3AcpH_YjNuonxaczw",
  authDomain:        "zonavi-f51fa.firebaseapp.com",
  databaseURL:       "https://zonavi-f51fa-default-rtdb.firebaseio.com",
  projectId:         "zonavi-f51fa",
  storageBucket:     "zonavi-f51fa.firebasestorage.app",
  messagingSenderId: "551623719407",
  appId:             "1:551623719407:web:a99643cf4f9b6f97a39e1a",
};

/** 設定がまだプレースホルダのままか */
export const isConfigured = () =>
  !Object.values(firebaseConfig).some(v => typeof v === "string" && v.startsWith("PASTE_"));
