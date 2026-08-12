import sqlite3InitModule from './vendor/sqlite3.js';

const {locale, t} = window.FandomI18n;
const LIMIT = 200;
const UI_KEY = 'fandom-isearch:ui';
const DB_KEY = 'fandom-isearch:database';
const FIELD_NAMES = ['title', 'body', 'author'];
const FIELD_COLUMNS = {title: 'title', body: 'body', author: 'author'};

const elements = {
  database: document.getElementById('database'),
  query: document.getElementById('query'),
  meta: document.getElementById('meta'),
  results: document.getElementById('results'),
  namespaceDetails: document.getElementById('namespaceDetails'),
  namespaceGrid: document.getElementById('namespaceGrid'),
  namespaceSummary: document.getElementById('namespaceSummary'),
  selectAllNamespaces: document.getElementById('selectAllNamespaces'),
  clearNamespaces: document.getElementById('clearNamespaces'),
  menuContainer: document.getElementById('menuContainer'),
  menuToggle: document.getElementById('menuToggle'),
  menuDropdown: document.getElementById('menuDropdown'),
  darkMode: document.getElementById('darkMode'),
  protocolWarning: document.getElementById('protocolWarning'),
  appVersion: document.getElementById('appVersion'),
  licenseNotice: document.getElementById('licenseNotice'),
};

let sqlite3 = null;
let database = null;
let databaseFile = '';
let metadata = {};
let namespaces = [];
let searchTimer = null;
let loadSequence = 0;

function readUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function saveUiState(patch) {
  const state = {...readUiState(), ...patch};
  localStorage.setItem(UI_KEY, JSON.stringify(state));
}

function setupMenu() {
  const ui = readUiState();
  elements.darkMode.checked = document.documentElement.classList.contains('dark');
  elements.namespaceDetails.open = ui.namespacesOpen === true;

  elements.menuToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = elements.menuDropdown.classList.toggle('open');
    elements.menuToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (!elements.menuContainer.contains(event.target)) {
      elements.menuDropdown.classList.remove('open');
      elements.menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
  elements.darkMode.addEventListener('change', () => {
    document.documentElement.classList.toggle('dark', elements.darkMode.checked);
    saveUiState({dark: elements.darkMode.checked});
  });
  elements.namespaceDetails.addEventListener('toggle', () => {
    saveUiState({namespacesOpen: elements.namespaceDetails.open});
  });
}

function selectedFields() {
  return [...document.querySelectorAll('input[name="field"]:checked')]
    .map((input) => input.value);
}

function selectedNamespaces() {
  return [...elements.namespaceGrid.querySelectorAll('input:checked')]
    .map((input) => Number(input.value));
}

function restoreFieldsFromUrl() {
  const params = new URLSearchParams(location.search);
  let selected;
  if (params.has('exclude')) {
    const excluded = new Set(
      params.get('exclude').split(',').filter((name) => FIELD_NAMES.includes(name)),
    );
    selected = new Set(FIELD_NAMES.filter((name) => !excluded.has(name)));
  } else if (params.has('fields')) {
    // Compatibility with URLs generated before the query format was inverted.
    selected = new Set(
      params.get('fields').split(',').filter((name) => FIELD_NAMES.includes(name)),
    );
  } else {
    selected = new Set(FIELD_NAMES);
  }
  for (const input of document.querySelectorAll('input[name="field"]')) {
    input.checked = selected.has(input.value);
  }
}

function restoreNamespacesFromUrl() {
  const params = new URLSearchParams(location.search);
  const allIds = namespaces.map((item) => item.id);
  let selected;
  if (params.has('excludeNs')) {
    const excluded = new Set(parseIdList(params.get('excludeNs')));
    selected = new Set(allIds.filter((id) => !excluded.has(id)));
  } else if (params.has('ns')) {
    // Compatibility with URLs generated before the query format was inverted.
    const value = params.get('ns');
    selected = new Set(value === '*' ? allIds : parseIdList(value));
  } else {
    selected = new Set(allIds);
  }
  for (const input of elements.namespaceGrid.querySelectorAll('input')) {
    input.checked = selected.has(Number(input.value));
  }
  updateNamespaceSummary();
}

function parseIdList(value) {
  if (!value) return [];
  return value.split(',')
    .filter((part) => /^-?\d+$/.test(part))
    .map(Number);
}

function syncUrl() {
  const url = new URL(location.href);
  const query = elements.query.value;
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');

  const selectedFieldSet = new Set(selectedFields());
  const excludedFields = FIELD_NAMES.filter((name) => !selectedFieldSet.has(name));
  if (excludedFields.length) url.searchParams.set('exclude', excludedFields.join(','));
  else url.searchParams.delete('exclude');
  url.searchParams.delete('fields');
  if (databaseFile) url.searchParams.set('db', databaseFile);

  const namespaceInputs = [...elements.namespaceGrid.querySelectorAll('input')];
  if (namespaceInputs.length) {
    const excluded = namespaceInputs.filter((input) => !input.checked);
    if (excluded.length) {
      url.searchParams.set('excludeNs', excluded.map((input) => input.value).join(','));
    } else {
      url.searchParams.delete('excludeNs');
    }
    url.searchParams.delete('ns');
  }
  history.replaceState(null, '', url);
}

function namespaceLabel(namespace) {
  return namespace.id === 0
    ? t('standardNamespace')
    : (namespace.name || t('unnamedNamespace', {id: namespace.id}));
}

function renderNamespaceOptions() {
  elements.namespaceGrid.replaceChildren();
  for (const namespace of namespaces) {
    const label = document.createElement('label');
    label.className = 'namespace-option checkbox-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(namespace.id);
    const caption = document.createElement('span');
    caption.className = 'namespace-caption';
    const name = document.createElement('span');
    name.textContent = namespaceLabel(namespace);
    const count = document.createElement('small');
    count.textContent = Number(namespace.page_count).toLocaleString(locale);
    caption.append(name, count);
    label.append(input, caption);
    elements.namespaceGrid.append(label);
  }
  restoreNamespacesFromUrl();
}

function updateNamespaceSummary() {
  const selected = selectedNamespaces().length;
  const total = namespaces.length;
  elements.namespaceSummary.textContent = selected === total
    ? t('allSelected', {total})
    : t('selectionCount', {selected, total});
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 100);
}

function setupControls() {
  restoreFieldsFromUrl();
  const initialQuery = new URLSearchParams(location.search).get('q');
  if (initialQuery !== null) elements.query.value = initialQuery;

  elements.query.addEventListener('input', () => {
    syncUrl();
    scheduleSearch();
  });
  for (const input of document.querySelectorAll('input[name="field"]')) {
    input.addEventListener('change', () => {
      syncUrl();
      scheduleSearch();
    });
  }
  elements.namespaceGrid.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"]')) {
      updateNamespaceSummary();
      syncUrl();
      scheduleSearch();
    }
  });
  elements.selectAllNamespaces.addEventListener('click', () => {
    for (const input of elements.namespaceGrid.querySelectorAll('input')) input.checked = true;
    updateNamespaceSummary();
    syncUrl();
    scheduleSearch();
  });
  elements.clearNamespaces.addEventListener('click', () => {
    for (const input of elements.namespaceGrid.querySelectorAll('input')) input.checked = false;
    updateNamespaceSummary();
    syncUrl();
    scheduleSearch();
  });
  elements.database.addEventListener('change', async () => {
    databaseFile = elements.database.value;
    localStorage.setItem(DB_KEY, databaseFile);
    syncUrl();
    await loadDatabase(databaseFile);
  });
}

function queryRows(db, sql, bind) {
  const rows = [];
  db.exec({sql, bind: bind?.length ? bind : undefined, rowMode: 'object', resultRows: rows});
  return rows;
}

function escapeLike(value) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

function parseSearch(value) {
  const tokens = [];
  let index = 0;
  while (index < value.length) {
    while (/\s/u.test(value[index] || '')) index += 1;
    if (index >= value.length) break;

    if (value[index] === '"') {
      index += 1;
      let phrase = '';
      while (index < value.length) {
        if (value[index] === '"') {
          index += 1;
          break;
        }
        if (value[index] === '\\' && ['"', '\\'].includes(value[index + 1])) {
          phrase += value[index + 1];
          index += 2;
        } else {
          phrase += value[index];
          index += 1;
        }
      }
      if (phrase) tokens.push({type: 'term', value: phrase});
      continue;
    }

    const start = index;
    while (index < value.length && !/\s/u.test(value[index])) index += 1;
    const word = value.slice(start, index);
    if (word === 'OR') tokens.push({type: 'or'});
    else if (word === 'AND') tokens.push({type: 'and'});
    else if (word) tokens.push({type: 'term', value: word});
  }

  const groups = [[]];
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (token.type === 'term') {
      groups[groups.length - 1].push(token.value);
    } else if (token.type === 'or') {
      const hasTermAfter = tokens.slice(tokenIndex + 1).some((item) => item.type === 'term');
      if (groups[groups.length - 1].length && hasTermAfter) groups.push([]);
    }
  }
  const nonemptyGroups = groups.filter((group) => group.length);
  if (!nonemptyGroups.length && value.trim()) nonemptyGroups.push([value.trim()]);
  return {
    groups: nonemptyGroups,
    terms: [...new Set(nonemptyGroups.flat())],
  };
}

function ftsTerm(value, fields) {
  const characters = [...value];
  const grams = [];
  for (let index = 0; index <= characters.length - 3; index += 1) {
    const gram = characters.slice(index, index + 3).join('');
    if (!grams.includes(gram)) grams.push(gram);
  }
  const columns = fields.map((field) => FIELD_COLUMNS[field]);
  const columnExpression = columns.length === 1
    ? columns[0]
    : `{${columns.join(' ')}}`;
  const terms = grams.map((gram) => `"${gram.replaceAll('"', '""')}"`);
  return `${columnExpression} : (${terms.join(' AND ')})`;
}

function ftsQuery(groups, fields) {
  return groups.map((group) => {
    const indexedTerms = group.filter((term) => [...term].length >= 3);
    return `(${indexedTerms.map((term) => ftsTerm(term, fields)).join(' AND ')})`;
  }).join(' OR ');
}

function exactQuery(groups, fields, bind) {
  const groupClauses = groups.map((group) => {
    const termClauses = group.map((term) => {
      bind.push(...fields.map(() => escapeLike(term)));
      return `(${fields.map((field) =>
        `p.${FIELD_COLUMNS[field]} LIKE ? ESCAPE '\\'`).join(' OR ')})`;
    });
    return `(${termClauses.join(' AND ')})`;
  });
  return `(${groupClauses.join(' OR ')})`;
}

function namespaceSql(ids, bind) {
  if (ids.length === namespaces.length) return '';
  bind.push(...ids);
  return ` AND p.namespace IN (${ids.map(() => '?').join(',')})`;
}

function runSearch() {
  if (!database) return;
  const started = performance.now();
  const raw = elements.query.value.trim();
  const parsed = parseSearch(raw);
  const fields = selectedFields();
  const namespaceIds = selectedNamespaces();

  if (!namespaceIds.length) {
    elements.meta.textContent = t('namespaceRequired');
    elements.results.innerHTML = `<div class="empty">${t('noNamespaceSelected')}</div>`;
    return;
  }
  if (raw && !fields.length) {
    elements.meta.textContent = t('targetRequired');
    elements.results.innerHTML = `<div class="empty">${t('noTargetSelected')}</div>`;
    return;
  }

  const bind = [];
  let sql;
  if (!raw) {
    sql = `SELECT p.id, p.namespace, p.title, p.body, p.author, p.updated_at
      FROM pages AS p WHERE 1=1${namespaceSql(namespaceIds, bind)}
      ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`;
  } else {
    const exactBind = [];
    const exact = exactQuery(parsed.groups, fields, exactBind);
    const canUseIndex = parsed.groups.every(
      (group) => group.some((term) => [...term].length >= 3),
    );
    if (canUseIndex) {
      bind.push(ftsQuery(parsed.groups, fields), ...exactBind);
      sql = `SELECT p.id, p.namespace, p.title, p.body, p.author, p.updated_at
        FROM page_search JOIN pages AS p ON p.id=page_search.rowid
        WHERE page_search MATCH ? AND ${exact}${namespaceSql(namespaceIds, bind)}
        ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`;
    } else {
      bind.push(...exactBind);
      sql = `SELECT p.id, p.namespace, p.title, p.body, p.author, p.updated_at
        FROM pages AS p WHERE ${exact}${namespaceSql(namespaceIds, bind)}
        ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`;
    }
  }
  bind.push(LIMIT + 1);

  try {
    const found = queryRows(database, sql, bind);
    const truncated = found.length > LIMIT;
    const rows = truncated ? found.slice(0, LIMIT) : found;
    renderResults(rows, parsed.terms, fields);
    const elapsed = (performance.now() - started).toFixed(1);
    const targetTotal = namespaces
      .filter((item) => namespaceIds.includes(item.id))
      .reduce((sum, item) => sum + Number(item.page_count), 0);
    elements.meta.textContent = t('resultsMeta', {
      count: rows.length.toLocaleString(locale),
      more: truncated ? '+' : '',
      total: targetTotal.toLocaleString(locale),
      ms: elapsed,
    });
  } catch (error) {
    console.error(error);
    elements.meta.textContent = t('searchError', {message: error.message});
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(value, terms) {
  const source = String(value);
  const patterns = [...new Set(terms.filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);
  if (!patterns.length) return escapeHtml(source);
  let expression;
  try {
    expression = new RegExp(patterns.join('|'), 'giu');
  } catch (_) {
    return escapeHtml(source);
  }
  let html = '';
  let lastIndex = 0;
  for (const match of source.matchAll(expression)) {
    html += escapeHtml(source.slice(lastIndex, match.index));
    html += `<mark>${escapeHtml(match[0])}</mark>`;
    lastIndex = match.index + match[0].length;
  }
  return html + escapeHtml(source.slice(lastIndex));
}

function excerpt(body, terms, preferMatch) {
  const value = String(body || '');
  if (!value) return {text: t('noBody'), prefix: '', suffix: ''};
  const maxLength = 430;
  let start = 0;
  if (terms.length && preferMatch) {
    const lowerValue = value.toLocaleLowerCase('ja');
    const positions = terms
      .map((term) => lowerValue.indexOf(term.toLocaleLowerCase('ja')))
      .filter((position) => position >= 0);
    const firstMatch = positions.length ? Math.min(...positions) : -1;
    if (firstMatch > 100) start = Math.max(0, firstMatch - 100);
  }
  const end = Math.min(value.length, start + maxLength);
  return {
    text: value.slice(start, end),
    prefix: start > 0 ? '…' : '',
    suffix: end < value.length ? '…' : '',
  };
}

function formatDate(timestamp) {
  if (!timestamp) return t('unknownDate');
  return new Date(Number(timestamp) * 1000).toLocaleString(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function articleUrl(title) {
  if (!metadata.wiki_base_url) return '';
  const encoded = String(title).replaceAll(' ', '_').split('/').map(encodeURIComponent).join('/');
  return metadata.wiki_base_url + encoded;
}

function renderLicense() {
  const container = elements.licenseNotice;
  container.replaceChildren();
  if (!metadata.license_name || !metadata.license_url) {
    container.textContent = t('licenseNotDetected');
    container.hidden = false;
    return;
  }

  const licenseLink = document.createElement('a');
  licenseLink.href = metadata.license_url;
  licenseLink.target = '_blank';
  licenseLink.rel = 'license noopener';
  licenseLink.textContent = metadata.license_name;
  container.append(document.createTextNode(`${t('licensePrefix')} `), licenseLink);
  container.append(document.createTextNode(` ${t('licenseSuffix')}`));
  if (metadata.license_scope === 'wiki_text') {
    container.append(document.createTextNode(` ${t('licenseDiscussionCaveat')}`));
  }

  if (metadata.license_source_title) {
    const sourceUrl = articleUrl(metadata.license_source_title);
    container.append(document.createTextNode(` ${t('licenseSource')} `));
    if (sourceUrl) {
      const sourceLink = document.createElement('a');
      sourceLink.href = sourceUrl;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener';
      sourceLink.textContent = metadata.license_source_title;
      container.append(sourceLink);
    } else {
      container.append(document.createTextNode(metadata.license_source_title));
    }
  }
  container.hidden = false;
}

function renderResults(rows, terms, fields) {
  if (!rows.length) {
    elements.results.innerHTML = `<div class="empty">${t('noResults')}</div>`;
    return;
  }
  const namespaceMap = new Map(namespaces.map((item) => [item.id, namespaceLabel(item)]));
  const html = rows.map((row) => {
    const url = articleUrl(row.title);
    const title = highlight(row.title, fields.includes('title') ? terms : []);
    const titleHtml = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${title}<span class="external">↗</span></a>`
      : title;
    const authorTerms = fields.includes('author') ? terms : [];
    const bodyTerms = fields.includes('body') ? terms : [];
    const body = excerpt(row.body, terms, fields.includes('body'));
    return `<article class="card">
      <div class="card-top">
        <span class="badge">${escapeHtml(namespaceMap.get(row.namespace) || row.namespace)}</span>
        <span>${escapeHtml(formatDate(row.updated_at))}</span>
        <span class="author">${t('editorPrefix')} ${highlight(row.author || t('unknown'), authorTerms)}</span>
      </div>
      <h2>${titleHtml}</h2>
      <div class="content">${body.prefix}${highlight(body.text, bodyTerms)}${body.suffix}</div>
    </article>`;
  });
  elements.results.innerHTML = html.join('');
}

async function loadDatabase(file) {
  const sequence = ++loadSequence;
  elements.query.disabled = true;
  elements.namespaceGrid.innerHTML = '';
  elements.namespaceSummary.textContent = t('loading');
  elements.results.innerHTML = '';
  elements.licenseNotice.hidden = true;
  elements.meta.textContent = t('loadingFile', {file});
  try {
    if (!/^[^/\\]+\.db$/u.test(file)) throw new Error(t('invalidDatabaseName'));
    sqlite3 ||= await sqlite3InitModule();
    const url = new URL(`./db/${encodeURIComponent(file)}`, import.meta.url);
    const response = await fetch(url, {cache: 'no-cache'});
    if (!response.ok) throw new Error(t('databaseFetchError', {status: response.status}));
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sequence !== loadSequence) return;

    const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
    const nextDatabase = new sqlite3.oo1.DB();
    const rc = sqlite3.capi.sqlite3_deserialize(
      nextDatabase.pointer,
      'main',
      pointer,
      bytes.byteLength,
      bytes.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    nextDatabase.checkRc(rc);
    const version = queryRows(nextDatabase, 'PRAGMA user_version')[0]?.user_version;
    if (Number(version) !== 1) {
      nextDatabase.close();
      throw new Error(t('unsupportedDatabase', {version}));
    }

    if (database) database.close();
    database = nextDatabase;
    metadata = Object.fromEntries(
      queryRows(database, 'SELECT key, value FROM metadata').map((row) => [row.key, row.value]),
    );
    renderLicense();
    namespaces = queryRows(
      database,
      'SELECT id, name, page_count FROM namespaces ORDER BY id',
    ).map((row) => ({...row, id: Number(row.id), page_count: Number(row.page_count)}));
    renderNamespaceOptions();
    syncUrl();
    elements.query.disabled = false;
    elements.query.focus();
    runSearch();
  } catch (error) {
    console.error(error);
    if (sequence !== loadSequence) return;
    elements.meta.textContent = t('loadFailed', {message: error.message});
    elements.results.innerHTML = `<div class="empty">${t('buildDatabaseFirst')}</div>`;
  }
}

async function initializeDatabaseList() {
  let entries = [];
  try {
    const response = await fetch(new URL('./db/databases.json', import.meta.url), {cache: 'no-cache'});
    if (response.ok) {
      const manifest = await response.json();
      entries = Array.isArray(manifest.databases) ? manifest.databases : [];
    }
  } catch (error) {
    console.warn(t('databaseListWarning'), error);
  }

  const params = new URLSearchParams(location.search);
  const requested = params.get('db');
  if (requested && !entries.some((entry) => entry.file === requested)) {
    entries.push({file: requested, name: requested.replace(/\.db$/u, ''), siteName: ''});
  }
  if (!entries.length) {
    elements.database.innerHTML = `<option>${t('noDatabase')}</option>`;
    elements.meta.textContent = t('noDatabaseMessage');
    return;
  }

  elements.database.replaceChildren();
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.file;
    option.textContent = entry.siteName && entry.siteName !== entry.name
      ? `${entry.siteName} — ${entry.name}`
      : entry.name;
    elements.database.append(option);
  }
  const saved = localStorage.getItem(DB_KEY);
  const preferred = requested || saved;
  if (preferred && entries.some((entry) => entry.file === preferred)) {
    elements.database.value = preferred;
  }
  databaseFile = elements.database.value;
  elements.database.disabled = false;
  localStorage.setItem(DB_KEY, databaseFile);
  syncUrl();
  await loadDatabase(databaseFile);
}

async function showVersion() {
  try {
    const response = await fetch(new URL('./version.json', import.meta.url), {cache: 'no-cache'});
    if (!response.ok) return;
    const document = await response.json();
    if (/^\d+\.\d+\.\d+$/u.test(document.version || '')) {
      elements.appVersion.textContent = `v${document.version}`;
    }
  } catch (_) {
    // A missing version label must not prevent searching.
  }
}

setupMenu();
setupControls();
showVersion();
initializeDatabaseList();
