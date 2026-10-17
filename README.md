# フローチャート工房

カードを方眼に並べてプログラムの流れを組み立てるパズルです。IF・LOOP・PRINT などのカードで作った流れが、お題どおりに動くかをテストで確かめます。ブラウザだけで遊べます。

遊ぶ: https://ryou061029.github.io/flowchart-workshop/

## 遊び方

- 練習 2 問で、カードの置き方と盤面の読み方を覚えます。
- フリーでは、本編 10 問を好きな順に解きます。★ は、クリア・基準の枚数以内・ヒントを見ずに基準の時間以内の 3 つです。
- チャレンジでは、限られた手札で 3 問を続けて解きます。
- 遊んだ記録は、ブラウザの中にだけ保存します。どこにも送信しません。文字の表示のために Google Fonts からフォントを読み込みます。

確かめている環境は PC のブラウザと、スマートフォン相当の画面(幅 360〜400px と横向き、タッチ操作)の自動テストです。実機のスマートフォンでの操作感(ドラッグの追従、ソフトキーボード、拡大表示)は、まだ十分に確かめていません。

## 開発

ゲームは HTML と JavaScript だけで動き、ほかのライブラリに依存しません。テストには Node.js 20 以上を使います。

- テスト: `node --test test/engine.test.js`
- スマートフォン幅・タッチ操作の UI テスト: 作業用のフォルダ `tmp/` の中の `playwright` に `npm i playwright` と `npx playwright install chromium` をしてから、`node test/ui/mobile-touch.js` を実行する。結果は `generated/reports/` の中の `ui-tests` に出る(Playwright はリポジトリの依存に入れていない)
- 手元で確認: `node tools/preview-server.js app 5178` を実行し、`http://127.0.0.1:5178/` を開く
- 仕様: [generated/docs/flowchart-kobo.md](generated/docs/flowchart-kobo.md)
- カードの見本: [generated/docs/flowchart-kobo-card-design.html](generated/docs/flowchart-kobo-card-design.html)

変更はブランチで作り、プルリクエストを通して main に入れます。プルリクエストではテストが流れます。main に入るとテストが流れ、合格したときだけ公開が更新されます。

## 不具合・感想

[GitHub の Issues](https://github.com/ryou061029/flowchart-workshop/issues) へお寄せください。

## ライセンス

MIT License © 2026 ryou061029。詳しくは [LICENSE](LICENSE) を見てください。
