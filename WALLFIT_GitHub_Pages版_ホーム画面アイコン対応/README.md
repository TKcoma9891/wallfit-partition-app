# WALLFIT — GitHub Pages版

パーテーション自動拾い出しWebアプリ（静的版）です。計算はブラウザ内で実行され、図面画像はサーバーへ送信されません。

## GitHub Pagesでの公開

1. GitHubで新規Publicリポジトリを作成
2. このフォルダ内のファイルをすべてアップロード
3. `Settings` → `Pages`
4. `Deploy from a branch`、Branch=`main`、Folder=`/ (root)` を選択して保存
5. 数分後、Pages画面に表示されるURLを開く

## 確定計算ルール

- END有効控除 = END幅 − 入り込み寸法
- PL：2WAY／3WAYの寸法控除なし
- SW：存在する2WAY／3WAYを各80mm控除
- 500mm未満の調整パネルはW1200をW900へ置換して回避
- 1WAYは使用しない

## 注意

GitHub Pages無料版は原則公開サイトです。顧客名・機密情報を含む図面はアップロードしないでください。OCR候補は必ず図面と照合してください。
