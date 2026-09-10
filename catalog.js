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

/** 内訳カードの表示設定 */
export const BREAKDOWNS = [
  { key: "versions", label: "アプリバージョン", format: v => v.replace(/_/g, ".") },
  { key: "os",       label: "iOS バージョン",   format: v => `iOS ${v}` },
  { key: "device",   label: "端末",             format: v => v },
  { key: "lang",     label: "表示言語",         format: v => ({ ja: "日本語", en: "English" }[v] ?? v) },
  { key: "theme",    label: "表示モード",       format: v => ({ light: "ライト", dark: "ダーク" }[v] ?? v) },
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
