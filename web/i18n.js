(function () {
  'use strict';

  const requestedLanguage = new URLSearchParams(location.search).get('lang');
  const language = ['en', 'ja'].includes(requestedLanguage)
    ? requestedLanguage
    : (String(navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en');
  const messages = {
    en: {
      homeLabel: 'fandom isearch home',
      menuLabel: 'Menu',
      darkMode: 'Dark mode',
      protocolBefore: 'SQLite WebAssembly cannot load from',
      protocolAfterRun: '. Run',
      protocolAfterOpen: 'in the repository and open the displayed URL.',
      searchLabel: 'Search',
      archive: 'Archive',
      loadingDatabaseList: 'Loading database list…',
      searchPlaceholder: 'Search… (substring match)',
      searchQueryLabel: 'Search query',
      searchHelpBefore: 'Spaces mean AND;',
      searchHelpMiddle: 'means OR;',
      searchHelpAfter: 'matches a phrase containing a space',
      searchTargets: 'Search targets',
      pageTitle: 'Page title',
      body: 'Body',
      editor: 'Editor',
      namespaces: 'Namespaces',
      loading: 'Loading…',
      selectAll: 'Select all',
      clearAll: 'Clear all',
      loadingDatabase: 'Loading database…',
      searchResultsLabel: 'Search results',
      httpRequired: 'A local HTTP server is required. Run ./serve in the repository.',
      standardNamespace: 'Main (articles)',
      unnamedNamespace: 'Namespace {id}',
      allSelected: 'All ({total})',
      selectionCount: '{selected} / {total} selected',
      namespaceRequired: 'Select at least one namespace',
      noNamespaceSelected: 'No namespaces are selected',
      targetRequired: 'Select at least one search target',
      noTargetSelected: 'No search targets are selected',
      resultsMeta: '{count}{more} results / {total} pages · {ms} ms',
      searchError: 'Search error: {message}',
      noBody: '(No body text)',
      unknownDate: 'Unknown date',
      noResults: 'No matching pages',
      unknown: 'Unknown',
      editorPrefix: 'Editor:',
      loadingFile: 'Loading {file}…',
      invalidDatabaseName: 'Invalid database filename',
      databaseFetchError: 'Could not fetch database (HTTP {status})',
      unsupportedDatabase: 'Unsupported database format (version {version})',
      loadFailed: 'Load failed: {message}',
      buildDatabaseFirst: 'Run <code>./makedb archive.xml</code> first',
      databaseListWarning: 'Could not load database list',
      noDatabase: 'No databases',
      noDatabaseMessage: 'No database found. Run ./makedb archive.xml first',
      licensePrefix: 'Wiki text in this archive is available under',
      licenseSuffix: 'unless otherwise noted.',
      licenseDiscussionCaveat: 'This notice is not applied to comments or discussions.',
      licenseSource: 'Source:',
      licenseNotDetected: 'License information was not detected in this archive.',
    },
    ja: {
      homeLabel: 'fandom isearch ホーム',
      menuLabel: 'メニュー',
      darkMode: 'ダークモード',
      protocolBefore: 'SQLite WebAssembly は',
      protocolAfterRun: ' から読み込めません。リポジトリで',
      protocolAfterOpen: 'を実行し、表示されたURLを開いてください。',
      searchLabel: '検索',
      archive: 'アーカイブ',
      loadingDatabaseList: 'DB一覧を読み込み中…',
      searchPlaceholder: '検索…（部分一致・日本語OK）',
      searchQueryLabel: '検索語',
      searchHelpBefore: '空白はAND・',
      searchHelpMiddle: 'はOR・',
      searchHelpAfter: 'は空白を含むフレーズ',
      searchTargets: '検索対象',
      pageTitle: 'ページタイトル',
      body: '本文',
      editor: '編集者',
      namespaces: '名前空間',
      loading: '読み込み中…',
      selectAll: 'すべて選択',
      clearAll: 'すべて解除',
      loadingDatabase: 'DBを読み込み中…',
      searchResultsLabel: '検索結果',
      httpRequired: 'ローカルHTTPサーバーが必要です。リポジトリで ./serve を実行してください',
      standardNamespace: '標準（記事）',
      unnamedNamespace: '名前空間 {id}',
      allSelected: 'すべて（{total}）',
      selectionCount: '{selected} / {total} 選択',
      namespaceRequired: '名前空間を1つ以上選択してください',
      noNamespaceSelected: '検索する名前空間が選択されていません',
      targetRequired: '検索対象を1つ以上選択してください',
      noTargetSelected: '検索対象が選択されていません',
      resultsMeta: '{count}{more}件 / 対象{total}ページ · {ms} ms',
      searchError: '検索エラー: {message}',
      noBody: '（本文なし）',
      unknownDate: '日時不明',
      noResults: '該当するページはありません',
      unknown: '不明',
      editorPrefix: '編集者:',
      loadingFile: '{file} を読み込み中…',
      invalidDatabaseName: '不正なDBファイル名です',
      databaseFetchError: 'DBを取得できませんでした（HTTP {status}）',
      unsupportedDatabase: '未対応のDB形式です（version {version}）',
      loadFailed: '読み込み失敗: {message}',
      buildDatabaseFirst: '先に <code>./makedb archive.xml</code> を実行してください',
      databaseListWarning: 'DB一覧を読み込めませんでした',
      noDatabase: 'DBがありません',
      noDatabaseMessage: 'DBがありません。先に ./makedb archive.xml を実行してください',
      licensePrefix: 'このアーカイブのWikiテキストは、特記のない限り',
      licenseSuffix: 'で提供されています。',
      licenseDiscussionCaveat: 'コメント・ディスカッションにはこの表示を適用していません。',
      licenseSource: '出典:',
      licenseNotDetected: 'このアーカイブからライセンス情報を検出できませんでした。',
    },
  };

  function t(key, variables = {}) {
    const template = messages[language][key] ?? messages.en[key] ?? key;
    return template.replace(/\{(\w+)\}/gu, (_, name) => String(variables[name] ?? `{${name}}`));
  }

  document.documentElement.lang = language;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  }
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  }

  window.FandomI18n = Object.freeze({language, locale: language === 'ja' ? 'ja-JP' : 'en', t});
})();
