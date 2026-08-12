# fandom-isearch

Fandom（MediaWiki）のXMLアーカイブをローカルのSQLite DBに変換し、ブラウザでインクリメンタル検索するツールです。ページタイトル、本文、編集者を対象に、日本語を含む部分一致検索ができます。

## 使い方

Python 3でDBを作成します。

```console
$ ./makedb data/jagoogology_pages_current.xml
/.../data/jagoogology_pages_current.xml → /.../web/db/jagoogology_pages_current.db
  5,000 ページを読み込みました…
  検索インデックスを作成しています…
完了: 9,178 ページ / 52.5 MiB
```

生成物は `web/db/<XMLファイル名>.db` です。`.xml.gz` と `.xml.bz2` も直接読み込めます。`makedb` を再実行すると同名のDBが安全に置き換わります。

SQLite WebAssemblyを使うため、`index.html` は `file://` ではなくローカルHTTPサーバー経由で開きます。

```console
$ ./serve
fandom-isearch: http://127.0.0.1:8000/
```

ブラウザで <http://127.0.0.1:8000/> を開いてください。別のポートを使う場合は、例えば `./serve 8080` とします。

## Agent・ターミナル用CLI

`fandom-search` は `findmine` と同様に、引数ありではワンショット検索、TTYで引数なしならcursesによるインクリメンタル検索になります。

```console
$ ./fandom-search 不可説不可説転 --limit 10
$ ./fandom-search '巨大数 グラハム' --url
$ ./fandom-search                         # 対話検索
```

検索対象は `--target`（別名 `--search-target`）で複数指定できます。引数なしで指定すると選択肢を一覧表示します。

```console
$ ./fandom-search --search-target
TARGET  DESCRIPTION
title   ページタイトル
body    本文
author  編集者

$ ./fandom-search Kyodaisuu --target author
$ ./fandom-search 巨大数 --target title --target body
```

名前空間は `--name-space`（別名 `--namespace`）で複数指定できます。名前、IDのどちらでも指定でき、引数なしならDB内の名前空間一覧とページ数を表示します。

```console
$ ./fandom-search --name-space
$ ./fandom-search 巨大数 --name-space '標準（記事）'
$ ./fandom-search 巨大数 --name-space 0 --name-space ユーザーブログ
```

DBは `web/db/databases.json` の先頭を自動選択します。別のDBは `--db web/db/example.db` で指定できます。PATHを通して使う場合は、実体へのシンボリックリンクを作れます。

```console
$ ln -s "$(pwd)/fandom-search" ~/bin/fandom-search
```

## 検索UI

- 検索対象は「ページタイトル」「本文」「編集者」から複数選択できます。
- 名前空間も複数選択できます。初期状態は全選択で、一覧は折り畳まれています。
- 名前空間には、そのDBに実際にページが存在するものだけが表示されます。
- 空白区切りはAND検索、未引用の大文字 `OR` はOR検索、`"abc def"` は空白を含むフレーズ検索です。明示的な `AND` も使用できます。
- 3文字以上の検索にはSQLite FTS5 trigram索引を使い、1〜2文字では部分一致検索へフォールバックします。
- 最大200件を更新日時の新しい順に表示します。
- 複数のDBを作ると、画面上部のアーカイブ選択に追加されます。

検索語、DB、検索対象、名前空間はURLクエリに反映されます。そのURLをコピーすると同じ条件を再現できます。

初期状態でONの項目はURLに出さず、OFFにした例外だけを記録します。例えば編集者とユーザーブログ名前空間を検索対象から外した場合は次のようになります。

```text
?q=巨大数&db=jagoogology_pages_current.db&exclude=author&excludeNs=500
```

全項目ONなら `exclude` と `excludeNs` はどちらも付きません。全項目をOFFにした場合は全値が列挙されます。ダークモードと名前空間パネルの開閉状態はブラウザの `localStorage` に保存されます。

## DBに保存する情報

XMLの各ページから次の情報を保存します。

- ページID、名前空間、ページタイトル、本文
- 最新リビジョンの編集者、リビジョンID、更新日時
- サイト名、記事URLの基点、MediaWikiバージョンなどのメタデータ

編集コメント（リビジョンの編集要約）は保存・検索しません。

## 必要環境

- Python 3.9以降
- FTS5およびtrigram tokenizerが有効なPython標準SQLite
- WebAssemblyを利用できるモダンブラウザ

フロントエンドはビルド不要のHTML/CSS/JavaScriptです。SQLite WebAssemblyは `web/vendor/` に同梱しています。
