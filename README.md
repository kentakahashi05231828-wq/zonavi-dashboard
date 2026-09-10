# ZONAVI 利用状況ダッシュボード

東京造形大学の学生向けアプリ **ZONAVI**（iOS）の利用状況を可視化する、静的ウェブダッシュボードです。
ビルド不要のバニラ ES モジュールのみで構成し、Firebase Realtime Database に保存された
匿名の集計カウンタを読み出してグラフとして表示します。

## デモ

Firebase に接続せず、サンプルデータで画面を確認できます。

```
index.html?demo=1
```

## 画面の内容

| セクション | 内容 |
| --- | --- |
| サマリー | 選択期間の KPI。増減は直前の同じ長さの期間との比較 |
| 日別の推移 | アクティブ端末数・セッション数などの折れ線 |
| タブ別の使われ方 | 予定 / ホーム / リンク / 設定 の表示回数 |
| 機能別の利用回数 | タブごとにまとめた、実際に押された機能の回数 |
| 時間帯別の利用 | 1 日のどの時間に使われているか |
| 利用環境の内訳 | アプリバージョン・iOS バージョン・端末・言語・表示モード・利用期間 |
| 全データ表 | グラフの元データ。CSV でダウンロード可能 |

表示期間は 7 / 14 / 30 / 90 日、データソースは本番（`analytics`）と開発（`analyticsDebug`）を切り替えられます。
ライト / ダークの表示モードにも対応しています。

## ファイル構成

```
index.html          画面の骨組み（セクションと操作 UI）
app.js              データ取得・集計・SVG 描画・CSV 書き出し・デモデータ生成
catalog.js          計測イベントのカタログ（iOS 側 AnalyticsEvent と 1:1 対応）
styles.css          デザイントークンとレイアウト
firebase-config.js  Firebase ウェブアプリの接続設定
```

Firebase SDK は `https://www.gstatic.com/firebasejs/10.14.1` から動的 import しているため、
npm install もバンドラも不要です。ローカルで開くときは ES モジュールの都合上、
`file://` ではなく簡易サーバー経由で開いてください。

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html?demo=1
```

## セキュリティについて

- `firebase-config.js` の `apiKey` は**秘密鍵ではなく**、ウェブに公開される前提の識別子です。
- 実際のアクセス制御は Realtime Database のセキュリティルールが行います。
  `analytics` ノードは許可された管理者メールアドレスでログインした場合のみ読み取れます。
- ダッシュボードが扱うのは匿名の集計カウンタのみで、UID・メールアドレス・端末 ID などの
  個人を特定できる情報は一切含まれません。
- アプリ側で「設定 → 利用状況の記録」を OFF にした端末は集計対象外です。

## GitHub Pages で公開する場合

1. リポジトリの **Settings → Pages** で、Source に `main` ブランチ（root）を指定します。
2. Firebase コンソール → **Authentication → Settings → 承認済みドメイン** に、
   公開される `<ユーザー名>.github.io` を追加します。これを忘れると Google ログインが失敗します。

`index.html` には `noindex, nofollow` を指定しているため、検索エンジンには載りません。

## イベントを追加したとき

iOS 側（`ZONAVI/Services/AnalyticsService.swift` の `AnalyticsEvent`）にイベントを追加したら、
`catalog.js` の `EVENTS` に 1 行足してください。日本語のラベル付きでダッシュボードに反映されます。
未登録のキーもキー名のまま表示されるので、取りこぼしは起きません。
