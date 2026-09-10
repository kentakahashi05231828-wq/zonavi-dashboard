// 計測イベントのカタログ
// iOS 側の AnalyticsEvent（ZONAVI/Services/AnalyticsService.swift）と 1:1 で対応する。
// アプリにイベントを追加したら、ここにも 1 行足すと日本語名でダッシュボードに出る。

/** タブの識別子・表示名・配色（配色は dataviz バリデータで検証済み） */
export const TABS = [
  { id: "schedule", label: "予定",   en: "Schedule" },
  { id: "home",     label: "ホーム", en: "Home" },
  { id: "links",    label: "リンク", en: "Links" },
  { id: "settings", label: "設定",   en: "Settings" },
];

/** タブに属さない計測（起動・ログインなど） */
export const APP_GROUP = { id: "app", label: "起動・ログイン", en: "App" };

/**
 * イベント定義。
 *  key   : RTDB のキー（= Swift の AnalyticsEvent.rawValue）
 *  tab   : 所属タブ（TABS の id、または "app"）
 *  label : ダッシュボードでの表示名
 *  note  : 補足（テーブルのツールチップに出す）
 */
export const EVENTS = [
  // 起動・認証
  { key: "app_open",              tab: "app", label: "アプリ起動",             note: "30分以上あけて開いたら1回" },
  { key: "onboarding_start",      tab: "app", label: "オンボーディング開始" },
  { key: "onboarding_complete",   tab: "app", label: "オンボーディング完了" },
  { key: "consent_agree",         tab: "app", label: "利用規約に同意" },
  { key: "login_success",         tab: "app", label: "ログイン成功" },
  { key: "login_failed",          tab: "app", label: "ログイン失敗" },
  { key: "feature_tips_shown",    tab: "app", label: "機能ヒント表示" },
  { key: "feature_tips_finished", tab: "app", label: "機能ヒント読了" },

  // ホームタブ
  { key: "home_bus_direction_university", tab: "home", label: "バス｜大学行に切替" },
  { key: "home_bus_direction_station",    tab: "home", label: "バス｜相原駅行に切替" },
  { key: "home_bus_timetable_open",       tab: "home", label: "バス｜全時刻表を開く" },
  { key: "home_bus_notif_open",           tab: "home", label: "バス｜通知シートを開く" },
  { key: "home_bus_notif_set",            tab: "home", label: "バス｜通知を設定" },
  { key: "home_bus_notif_cancel",         tab: "home", label: "バス｜通知を削除" },
  { key: "home_cafeteria_weekly_open",    tab: "home", label: "学食｜週間メニューを開く" },
  { key: "home_notification_list_open",   tab: "home", label: "お知らせ一覧を開く" },
  { key: "home_appbar_settings_open",     tab: "home", label: "アプリバー表示設定を開く" },
  { key: "home_hanako_open",              tab: "home", label: "AIチャットを開く" },
  { key: "home_hanako_message_sent",      tab: "home", label: "AIチャットに送信" },

  // 予定タブ
  { key: "schedule_tab_timetable",   tab: "schedule", label: "時間割タブを表示" },
  { key: "schedule_tab_annual",      tab: "schedule", label: "年間スケジュールを表示" },
  { key: "schedule_class_add",       tab: "schedule", label: "授業を追加" },
  { key: "schedule_class_edit",      tab: "schedule", label: "授業を編集" },
  { key: "schedule_class_delete",    tab: "schedule", label: "授業を削除" },
  { key: "schedule_image_recognize", tab: "schedule", label: "時間割を画像から読み取り" },
  { key: "schedule_annual_image_set",tab: "schedule", label: "年間予定の画像を登録" },
  { key: "schedule_share_open",      tab: "schedule", label: "時間割をシェア" },
  { key: "schedule_credits_open",    tab: "schedule", label: "単位一覧を開く" },
  { key: "schedule_settings_open",   tab: "schedule", label: "時間割の設定を開く" },
  { key: "schedule_memo_open",       tab: "schedule", label: "メモを開く" },
  { key: "schedule_memo_save",       tab: "schedule", label: "メモを保存" },

  // リンクタブ
  { key: "links_campusnet",      tab: "links", label: "CampusNet を開く" },
  { key: "links_zokei_site",     tab: "links", label: "大学公式サイトを開く" },
  { key: "links_bus_timetable",  tab: "links", label: "公式バス時刻表を開く" },
  { key: "links_cafeteria_menu", tab: "links", label: "公式学食メニューを開く" },
  { key: "links_train_status",   tab: "links", label: "JR運行情報を開く" },
  { key: "links_share",          tab: "links", label: "ZONAVI をシェア" },
  { key: "links_feedback_open",  tab: "links", label: "フィードバックを開く" },
  { key: "links_feedback_submit",tab: "links", label: "フィードバックを送信" },

  // 設定タブ
  { key: "settings_account_open",      tab: "settings", label: "アカウント設定を開く" },
  { key: "settings_notification_open", tab: "settings", label: "通知設定を開く" },
  { key: "settings_language_open",     tab: "settings", label: "言語設定を開く" },
  { key: "settings_appearance_open",   tab: "settings", label: "表示モード設定を開く" },
  { key: "settings_admin_open",        tab: "settings", label: "管理者用設定を開く" },
  { key: "settings_guide_open",        tab: "settings", label: "使い方ガイドを開く" },
  { key: "settings_legal_open",        tab: "settings", label: "法的表記を開く" },
  { key: "settings_language_ja",       tab: "settings", label: "言語を日本語に変更" },
  { key: "settings_language_en",       tab: "settings", label: "言語を英語に変更" },
  { key: "settings_appearance_light",  tab: "settings", label: "ライトモードに変更" },
  { key: "settings_appearance_dark",   tab: "settings", label: "ダークモードに変更" },
  { key: "settings_sign_out",          tab: "settings", label: "ログアウト" },
];

/** 画面（screen_view）の表示名 */
export const SCREENS = {
  home:     "ホーム",
  schedule: "予定",
  links:    "リンク",
  settings: "設定",
};

/**
 * 機種識別子 → 製品名。
 * RTDB には "," を "_" に置き換えた形（iPhone18_3）で入る。
 * ここに無いキーは識別子のまま表示されるので、新機種が出ても表示は壊れない。
 * 新機種を足すときは Apple のモデル識別子を確認して 1 行追加する。
 */
export const DEVICE_MODELS = {
  // ── iPhone ──
  iPhone10_1: "iPhone 8",        iPhone10_4: "iPhone 8",
  iPhone10_2: "iPhone 8 Plus",   iPhone10_5: "iPhone 8 Plus",
  iPhone10_3: "iPhone X",        iPhone10_6: "iPhone X",
  iPhone11_2: "iPhone XS",
  iPhone11_4: "iPhone XS Max",   iPhone11_6: "iPhone XS Max",
  iPhone11_8: "iPhone XR",
  iPhone12_1: "iPhone 11",
  iPhone12_3: "iPhone 11 Pro",
  iPhone12_5: "iPhone 11 Pro Max",
  iPhone12_8: "iPhone SE(第2世代)",
  iPhone13_1: "iPhone 12 mini",
  iPhone13_2: "iPhone 12",
  iPhone13_3: "iPhone 12 Pro",
  iPhone13_4: "iPhone 12 Pro Max",
  iPhone14_2: "iPhone 13 Pro",
  iPhone14_3: "iPhone 13 Pro Max",
  iPhone14_4: "iPhone 13 mini",
  iPhone14_5: "iPhone 13",
  iPhone14_6: "iPhone SE(第3世代)",
  iPhone14_7: "iPhone 14",
  iPhone14_8: "iPhone 14 Plus",
  iPhone15_2: "iPhone 14 Pro",
  iPhone15_3: "iPhone 14 Pro Max",
  iPhone15_4: "iPhone 15",
  iPhone15_5: "iPhone 15 Plus",
  iPhone16_1: "iPhone 15 Pro",
  iPhone16_2: "iPhone 15 Pro Max",
  iPhone17_1: "iPhone 16 Pro",
  iPhone17_2: "iPhone 16 Pro Max",
  iPhone17_3: "iPhone 16",
  iPhone17_4: "iPhone 16 Plus",
  iPhone17_5: "iPhone 16e",
  iPhone18_1: "iPhone 17 Pro",
  iPhone18_2: "iPhone 17 Pro Max",
  iPhone18_3: "iPhone 17",
  iPhone18_4: "iPhone Air",

  // ── iPad ──
  iPad11_1: "iPad mini(第5世代)",  iPad11_2: "iPad mini(第5世代)",
  iPad11_3: "iPad Air(第3世代)",   iPad11_4: "iPad Air(第3世代)",
  iPad11_6: "iPad(第8世代)",       iPad11_7: "iPad(第8世代)",
  iPad12_1: "iPad(第9世代)",       iPad12_2: "iPad(第9世代)",
  iPad13_1: "iPad Air(第4世代)",   iPad13_2: "iPad Air(第4世代)",
  iPad13_16: "iPad Air(第5世代)",  iPad13_17: "iPad Air(第5世代)",
  iPad13_18: "iPad(第10世代)",     iPad13_19: "iPad(第10世代)",
  iPad14_1: "iPad mini(第6世代)",  iPad14_2: "iPad mini(第6世代)",
  iPad14_8: "iPad Air 11(M2)",     iPad14_9: "iPad Air 11(M2)",
  iPad14_10: "iPad Air 13(M2)",    iPad14_11: "iPad Air 13(M2)",
  iPad16_1: "iPad mini(A17 Pro)",  iPad16_2: "iPad mini(A17 Pro)",
  iPad16_3: "iPad Pro 11(M4)",     iPad16_4: "iPad Pro 11(M4)",
  iPad16_5: "iPad Pro 13(M4)",     iPad16_6: "iPad Pro 13(M4)",
};

/** 識別子を製品名にする。未知のキーは識別子をそのまま返す（"," 表記に戻す） */
export const deviceName = key =>
  DEVICE_MODELS[key] ?? String(key).replace(/_(?=\d)/, ",");

/** 曜日キー（0=日曜、JST） */
export const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 通知許可の状態 */
export const NOTIF_LABELS = {
  granted:        "許可",
  provisional:    "仮許可",
  denied:         "拒否",
  ephemeral:      "一時的",
  notDetermined:  "未選択",
};

/** 画面サイズ区分 */
export const DISPLAY_LABELS = {
  small:    "小(SE・mini)",
  standard: "標準",
  large:    "大(Plus・Pro Max)",
  tablet:   "タブレット",
};

/** 内訳カードの表示設定 */
export const BREAKDOWNS = [
  { key: "model",    label: "機種",                 format: deviceName, limit: 10, since: true },
  { key: "versions", label: "アプリバージョン",      format: v => v.replace(/_/g, ".") },
  { key: "osFull",   label: "iOS バージョン（詳細）", format: v => `iOS ${v.replace(/_/g, ".")}`, since: true },
  { key: "os",       label: "iOS メジャーバージョン", format: v => `iOS ${v}` },
  { key: "device",   label: "端末種別",             format: v => v },
  { key: "display",  label: "画面サイズ",           format: v => DISPLAY_LABELS[v] ?? v, since: true,
    order: ["small", "standard", "large", "tablet"] },
  { key: "notif",    label: "通知の許可状況",        format: v => NOTIF_LABELS[v] ?? v, since: true,
    order: ["granted", "provisional", "denied", "ephemeral", "notDetermined"] },
  { key: "lang",     label: "表示言語",             format: v => ({ ja: "日本語", en: "English" }[v] ?? v) },
  { key: "theme",    label: "表示モード",           format: v => ({ light: "ライト", dark: "ダーク" }[v] ?? v) },
  {
    key: "tenure", label: "インストールからの経過", format: v =>
      ({ d0: "当日", d1_6: "1〜6日", d7_29: "7〜29日", d30plus: "30日以上" }[v] ?? v),
    order: ["d0", "d1_6", "d7_29", "d30plus"],
  },
];

const byKey = new Map(EVENTS.map(e => [e.key, e]));
/** 未知のキー（アプリ側だけ先に追加された場合）もそのまま表示できるようにする */
export const lookupEvent = key =>
  byKey.get(key) ?? { key, tab: "app", label: key, unknown: true };
export const tabOf = id => TABS.find(t => t.id === id) ?? APP_GROUP;
