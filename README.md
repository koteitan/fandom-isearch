[← Back](../README.md) | [English](README.md) | [Japanese](README-ja.md)

# fandom-isearch

fandom-isearch converts a Fandom (MediaWiki) XML archive into a local SQLite database and provides incremental search in a browser or terminal. It supports substring matching, including Japanese text, across page titles, body text, and editors.

![fandom-isearch browser search interface](img/fandom-isearch-screenshot.png)

## Build a database

Use Python 3 to build the database:

```console
$ ./makedb data/jagoogology_pages_current.xml
```

The output is `web/db/<XML-filename>.db`. The command can also read `.xml.gz` and `.xml.bz2` files directly. Running `makedb` again atomically replaces the database with the same name.

SQLite WebAssembly cannot run from `file://`, so serve `index.html` over the bundled local HTTP server:

```console
$ ./serve
fandom-isearch: http://127.0.0.1:8000/
```

Open <http://127.0.0.1:8000/> in a browser. To use another port, run a command such as `./serve 8080`.

## Agent and terminal CLI

Like `findmine`, `fandom-search` performs a one-shot search when given arguments and opens a curses incremental-search interface when run without arguments on a TTY.

```console
$ ./fandom-search googol --limit 10
$ ./fandom-search 'large number' --url
$ ./fandom-search                         # interactive search
```

Use `--target` (alias: `--search-target`) repeatedly to select search targets. Omit its value to list the available targets:

```console
$ ./fandom-search --search-target
TARGET  DESCRIPTION
title   Page title
body    Body
author  Editor

$ ./fandom-search Alice --target author
$ ./fandom-search googol --target title --target body
```

Use `--name-space` (alias: `--namespace`) repeatedly to select namespaces. A namespace can be specified by name or ID. Omit the value to list the namespaces in the selected database and their page counts:

```console
$ ./fandom-search --name-space
$ ./fandom-search googol --name-space 'Main (articles)'
$ ./fandom-search googol --name-space 0 --name-space 500
```

The CLI selects the first entry in `web/db/databases.json` by default. Use `--db web/db/example.db` to select another database. To invoke it from anywhere, create a symbolic link to the actual script:

```console
$ ln -s "$(pwd)/fandom-search" ~/bin/fandom-search
```

## Search UI and syntax

- Page title, body, and editor can be enabled independently as search targets.
- Multiple namespaces can be selected. All are enabled initially, and the namespace list is collapsed by default.
- Only namespaces that contain pages in the selected database are displayed.
- Space-separated terms use AND. An unquoted uppercase `OR` uses OR. `"abc def"` matches a phrase containing the space. Explicit `AND` is also accepted.
- Searches of at least three characters use the SQLite FTS5 trigram index. One- and two-character searches fall back to substring matching.
- Up to 200 results are shown, newest first.
- Building more than one database adds an archive selector to the page.

The browser detects `navigator.language`. A locale beginning with `ja` selects Japanese; all other locales select English. For testing, `?lang=en` or `?lang=ja` overrides the browser locale. Unsupported `lang` values fall back to automatic detection. The terminal CLI applies the same automatic rule to `LC_ALL`, `LC_MESSAGES`, `LANGUAGE`, or `LANG`. Tool-generated UI, help, status, and error messages are translated; archive-provided namespace names and page content remain in their source language.

The search query, database, targets, and namespaces are reflected in the URL, so copying the URL reproduces the same search. Options that are on by default are omitted; only disabled exceptions are recorded. For example, disabling the editor target and namespace 500 produces:

```text
?q=googol&db=jagoogology_pages_current.db&exclude=author&excludeNs=500
```

When all checkboxes are on, neither `exclude` nor `excludeNs` is present. Turning every item off lists every value. Dark mode and namespace-panel expansion are stored in browser `localStorage`.

## Stored data

The database stores the following values from each XML page:

- Page ID, namespace, page title, and body
- Latest revision editor, revision ID, and update time
- Metadata including the site name, article URL base, and MediaWiki version

Revision edit summaries are neither stored nor searched.

## Requirements

- Python 3.9 or later
- Python's SQLite built with FTS5 and the trigram tokenizer
- A modern browser with WebAssembly support

The frontend is build-free HTML, CSS, and JavaScript. SQLite WebAssembly is bundled in `web/vendor/`.
