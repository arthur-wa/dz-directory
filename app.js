'use strict';
/* app.js: wiring preserved from the previous build (filters, modal, favorites, CSV, URL state). */
const $ = (id) => document.getElementById(id);
const fmt = (n) => new Intl.NumberFormat('ar-DZ').format(n);
const esc = (s) => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 60) || 'sans-nom';

const imgPath = (m, k) =>
  `merchants/${slugify(m.w || 'sans-wilaya')}/${m.i}-${slugify(m.n)}/img-${k}.jpg`;

/* some source names carry junk dash runs and invisible marks; both leak into titles */
const cleanName = (s) => String(s || '')
  .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u061c\ufe00-\ufe0f\ufffc-\ufffd]/g, '')
  .replace(/[-\u2013\u2014_]{2,}/g, ' ')
  .replace(/\s+/g, ' ')
  .trim() || 'بدون اسم';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- search index ----------
 * Arabic-aware normalization: hamza forms, taa marbuta, alef maqsura and
 * diacritics fold so "مقهى" matches "مقهاة" and "شاردة" matches "شارضه".
 * Latin is case-folded and digits in Arabic-Indic form fold to ASCII. */
const fold = (s) => String(s || '')
  .toLowerCase()
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  .replace(/[\u0622\u0623\u0625\u0627]/g, '\u0627')
  .replace(/\u0649/g, '\u064A')
  .replace(/\u0629/g, '\u0647')
  .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
  .replace(/\u066B/g, '.')
  .replace(/[\u0300-\u036f]/g, '');

/* tokenized index per merchant: folded haystack + field weights */
const SEARCH_FIELDS = [
  [(m) => m.n, 3],
  [(m) => m.c, 2],
  [(m) => m.ci, 2],
  [(m) => m.a, 1],
  [(m) => m.p, 2],
  [(m) => m.w, 1]
];
let SEARCH_INDEX = null;
function buildIndex() {
  SEARCH_INDEX = M.map((m) => {
    const fields = SEARCH_FIELDS.map(([get]) => fold(get(m)));
    const hay = ' ' + fields.join(' ') + ' ';
    return { hay, fields };
  });
}

/* score = best field weight for every token present; AND semantics */
function searchScore(idx, qTokens) {
  const it = SEARCH_INDEX[idx];
  let total = 0;
  for (const t of qTokens) {
    let best = 0;
    for (let f = 0; f < it.fields.length; f++) {
      if (it.fields[f].includes(t)) best = Math.max(best, SEARCH_FIELDS[f][1]);
    }
    if (!best && it.hay.includes(t)) best = 1;
    if (!best) return 0;
    total += best;
  }
  return total;
}
const tokenize = (q) => fold(q).split(/\s+/).filter(Boolean);

/* ---------- data ---------- */
let M = [];
let stats = { total: 0, wilayas: 0, phone: 0, rated: 0, avg: 0, imgs: 0 };

try {
  if (typeof MERCHANTS === 'undefined' || !Array.isArray(MERCHANTS)) throw new Error('no data');
  M = MERCHANTS.map((m, i) => ({ ...m, i: Number(m.i), _p: i }));
  const wset = new Set(); let phone = 0, rated = 0, sum = 0;
  for (const m of M) {
    if (m.w) wset.add(m.w);
    if (m.p) phone++;
    if (m.r != null) { rated++; sum += m.r; }
  }
  stats = {
    total: M.length, wilayas: wset.size, phone,
    rated, avg: rated ? sum / rated : 0
  };
} catch (e) {
  $('grid').innerHTML = `<div class="state-msg"><b>تعذر تحميل البيانات</b><br>${esc(e.message)}</div>`;
}

/* ---------- selects ---------- */
function fillSelect(sel, counts, allLabel) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
  for (const [v, n] of sorted) {
    const o = document.createElement('option');
    o.value = v; o.textContent = `${v} (${fmt(n)})`;
    sel.append(o);
  }
}
const wilayaCounts = new Map(), catCounts = new Map();
for (const m of M) {
  if (m.w) wilayaCounts.set(m.w, (wilayaCounts.get(m.w) || 0) + 1);
  if (m.c) catCounts.set(m.c, (catCounts.get(m.c) || 0) + 1);
}
fillSelect($('wilaya'), wilayaCounts, 'كل الولايات');
fillSelect($('category'), catCounts, 'كل التصنيفات');
buildIndex();

/* ---------- categories dashboard ---------- */
const CAT_ICONS = [
  [/pharma|طبيب|صيدل|عياد|dentist|médic/i, '<path d="M12 3v18M3 12h18"/><rect x="3" y="3" width="18" height="18" rx="2"/>'],
  [/restaur|café|cafe|fast.?food|pizza|pizzeria|sandwich|burger|طعام|مطعم|غذاء/i, '<path d="M4 3v7a2 2 0 0 0 2 2v9M8 3v7a2 2 0 0 1-2 2M17 3c-1.5 1-2 3-2 5h2V3Zm0 0v18M21 12a4 4 0 0 0-4-4v13"/>'],
  [/hotel|hôt|auber|فندق|إقام/i, '<path d="M3 21V7l7-4 7 4v14M3 21h18M17 21v-9h4v9M7 9h2m-2 4h2m-2 4h2"/>'],
  [/épicer|aliment|supermarch|supérette|boulanger|pâtiss|بقال|خبز|حلويات|مواد/i, '<path d="M3 8h18l-2 12H5L3 8Zm4 0a5 5 0 0 1 10 0"/>'],
  [/vêtem|prêt|mode|chauss|bijout|حلوى|ملابس|ألبسة|أحذية|مجوهر/i, '<path d="M8 4 5 6l-2 5 3 1v9h12v-9l3-1-2-5-3-2a4 4 0 0 1-8 0Z"/>'],
  [/coiff|barbier|salon|beauté|حلاق|صالون|تجميل/i, '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l10 10M8 16 18 6"/>'],
  [/garage|mécan|auto|voiture|carross|pneu|سيارة|إصلاح|ميكانيك/i, '<path d="M5 16 6.5 10h11L19 16M5 16h14v3h-3v-3M5 16v3h3v-3M4 16h16M8 10l1-3h6l1 3"/>'],
  [/immobil|agence|مكتب|عقار/i, '<path d="M4 21V5l8-2v18M12 21h8V9l-8-3M7 8v2m0 4v2m9-5v2m0 4v2"/>'],
  [/électr|electr|informat|téléphon|telephon|ordinateur|إلكترون|هاتف|كمبيوتر/i, '<rect x="4" y="4" width="16" height="12" rx="1"/><path d="M2 20h20M9 8l-2 2 2 2m6-4 2 2-2 2"/>'],
  [/école|ecole|scolair|formation|مدرسة|تعليم|دروس/i, '<path d="m3 9 9-5 9 5-9 5-9-5Zm3 3v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>'],
  [/transpo|taxi|transport|livraison|نقل|توصيل|سيارات/i, '<path d="M4 17h16l-1-5H5l-1 5Zm2-5 1.5-4h9L18 12M6 17v3m12-3v3M7 14.5h.01M17 14.5h.01"/>'],
  [/menuis|meub|décor|decor|bois|charpente|نجارة|أثاث|أخشاب|مفروش/i, '<path d="M4 8h16l-2-4H6L4 8Zm0 0v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>']
];
const CAT_ICON_FALLBACK = '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/>';
const catIcon = (c) => {
  for (const [re, svg] of CAT_ICONS) if (re.test(c)) return svg;
  return CAT_ICON_FALLBACK;
};

const catsSorted = [...catCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
const CATS_VISIBLE = 24;
const $cats = $('catsDash'), $catsToggle = $('catsToggle');
function renderCats(expanded) {
  const list = expanded ? catsSorted : catsSorted.slice(0, CATS_VISIBLE);
  $cats.innerHTML = list.map(([c, n]) => `
    <button class="cat" type="button" data-c="${esc(c)}" title="${esc(c)}">
      <span class="cat-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${catIcon(c)}</svg></span>
      <span class="cat-name">${esc(c)}</span>
      <span class="cat-count">${fmt(n)} عنوان</span>
    </button>`).join('');
  if (catsSorted.length > CATS_VISIBLE) {
    $catsToggle.hidden = false;
    $catsToggle.textContent = expanded ? 'إظهار أقل' : `إظهار كل التصنيفات (${fmt(catsSorted.length)})`;
    $catsToggle.setAttribute('aria-expanded', String(expanded));
  }
}
let catsExpanded = false;
renderCats(false);
$catsToggle.addEventListener('click', () => { catsExpanded = !catsExpanded; renderCats(catsExpanded); });
$cats.addEventListener('click', (e) => {
  const b = e.target.closest('.cat'); if (!b) return;
  $c.value = b.dataset.c;
  curPage = 1;
  apply(); writeUrl();
  document.getElementById('results')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
});
/* ---------- board ---------- */
$('totalN').textContent = fmt(stats.total);
$('totalW').textContent = fmt(stats.wilayas);
$('kpis').innerHTML = [
  ['بالهاتف', stats.phone],
  ['بتقييم', stats.rated],
  ['متوسط النجوم', stats.avg ? stats.avg.toFixed(2) : 'غير متوفر'],
  ['بالصور', M.filter(m => m.ps || m.image).length]
].map(([l, n]) => `<div class="bk"><div class="n">${esc(String(n))}</div><div class="l">${l}</div></div>`).join('');

/* ---------- state ---------- */
const PER = 60;
let filtered = [], curPage = 1, quickOpen = false, withPhoneOnly = false, favOnly = false;
let favs = new Set(JSON.parse(localStorage.getItem('dz_favs') || '[]'));
const $q = $('q'), $w = $('wilaya'), $c = $('category'), $r = $('rating'), $s = $('sort');

function readUrl() {
  const u = new URL(location);
  $q.value = u.searchParams.get('q') || '';
  $w.value = u.searchParams.get('w') || '';
  $c.value = u.searchParams.get('c') || '';
  $r.value = u.searchParams.get('r') || '';
  $s.value = u.searchParams.get('s') || 'name';
  quickOpen = u.searchParams.get('open') === '1';
  withPhoneOnly = u.searchParams.get('phone') === '1';
  favOnly = u.searchParams.get('fav') === '1';
  curPage = Math.max(1, parseInt(u.searchParams.get('page') || '1', 10) || 1);
}
function writeUrl() {
  const u = new URL(location);
  u.search = '';
  const p = u.searchParams;
  if ($q.value.trim()) p.set('q', $q.value.trim());
  if ($w.value) p.set('w', $w.value);
  if ($c.value) p.set('c', $c.value);
  if ($r.value) p.set('r', $r.value);
  if ($s.value !== 'name') p.set('s', $s.value);
  if (quickOpen) p.set('open', '1');
  if (withPhoneOnly) p.set('phone', '1');
  if (favOnly) p.set('fav', '1');
  if (curPage > 1) p.set('page', String(curPage));
  history.replaceState(null, '', u);
}
const syncChips = () => {
  $('quickRating').querySelectorAll('.cell').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.r === ($r.value === 'none' ? '' : $r.value))));
  $('quickOpen').setAttribute('aria-pressed', String(quickOpen));
  $('withPhoneChip').setAttribute('aria-pressed', String(withPhoneOnly));
  $('favChip').setAttribute('aria-pressed', String(favOnly));
  $('favBtn').setAttribute('aria-pressed', String(favOnly));
};

/* ---------- filter / sort / render ---------- */
function apply() {
  const qTokens = tokenize($q.value);
  const hasQ = qTokens.length > 0;
  const w = $w.value, c = $c.value, r = $r.value, s = $s.value;
  filtered = M.filter(m => {
    if (w && m.w !== w) return false;
    if (c && m.c !== c) return false;
    if (r === 'none' && m.r != null) return false;
    if (r && r !== 'none' && !(m.r != null && m.r >= Number(r))) return false;
    if (quickOpen && !(m.s || '').startsWith('Ouvert')) return false;
    if (withPhoneOnly && !m.p) return false;
    if (favOnly && !favs.has(m.i)) return false;
    return true;
  });
  if (hasQ && SEARCH_INDEX) {
    const scored = [];
    for (const m of filtered) {
      const sc = searchScore(m._p, qTokens);
      if (sc) scored.push([sc, m]);
    }
    filtered = scored.map(([, m]) => m);
    if (s === 'name') {
      scored.sort((a, b) => b[0] - a[0] || (a[1].n || '').localeCompare(b[1].n || '', 'ar'));
      filtered = scored.map(([, m]) => m);
    }
  }
  if (s === 'rating') filtered.sort((a, b) => (b.r ?? -1) - (a.r ?? -1) || (b.rv ?? 0) - (a.rv ?? 0));
  else if (s === 'reviews') filtered.sort((a, b) => (b.rv ?? 0) - (a.rv ?? 0));
  else if (s === 'wilaya') filtered.sort((a, b) => (a.w || '').localeCompare(b.w || '', 'ar') || (a.n || '').localeCompare(b.n || '', 'ar'));
  else if (s === 'name' && !hasQ) filtered.sort((a, b) => (a.n || '').localeCompare(b.n || '', 'ar'));

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PER));
  if (curPage > pages) curPage = pages;
  const slice = filtered.slice((curPage - 1) * PER, curPage * PER);

  $('count').innerHTML = `<b>${fmt(total)}</b> نتيجة`;
  $('grid').innerHTML = slice.length
    ? slice.map(card).join('')
    : `<div class="state-msg"><b>لا توجد نتائج مطابقة</b><br>جرّب تعديل الفلاتر أو إعادة التعيين</div>`;

  for (const el of $('grid').querySelectorAll('.card')) {
    const cover = el.querySelector('.cover'), ph = el.querySelector('.ph');
    if (!cover) continue;
    const url = cover.style.backgroundImage.slice(5, -2);
    const probe = new Image();
    probe.onload = () => ph && ph.remove();
    probe.onerror = () => cover.remove();
    probe.src = url;
  }
  for (const el of $('grid').querySelectorAll('.name')) fitName(el);
  renderPager(pages);
  syncChips();
  writeUrl();
}

function stars(r) {
  const full = Math.min(5, Math.round(r));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function card(m) {
  const photo = (m.ps && m.ps.length) || m.image;
  const cover = photo ? `<div class="cover" style="background-image:url('${imgPath(m, 1)}')"></div>` : '';
  const open = (m.s || '').startsWith('Ouvert');
  return `<a class="card" href="#" data-id="${m.i}" aria-label="${esc(cleanName(m.n))}">
    <div class="thumb">${cover}<div class="ph">${esc(cleanName(m.n).trim().charAt(0))}</div>
      ${m.c ? `<div class="badge">${esc(m.c)}</div>` : ''}
      <button class="heart ${favs.has(m.i) ? 'on' : ''}" data-heart="${m.i}" aria-pressed="${favs.has(m.i)}" aria-label="أضف إلى المفضلة">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 9.3 5.1c-1.8 4.4-9.3 9-9.3 9Z"/></svg>
      </button>
    </div>
    <div class="card-body">
      <div class="name">${esc(cleanName(m.n))}</div>
      <div class="meta"><span>${esc(m.ci || '')}</span><span>${esc(m.w || '')}</span></div>
      ${m.r != null
        ? `<div class="rate"><span class="star">${stars(m.r)}</span> ${m.r.toFixed(1)} <small>(${fmt(m.rv || 0)})</small></div>`
        : `<div class="no-rate">بدون تقييم</div>`}
      <div class="foot">
        <span class="phone">${m.p ? esc(m.p) : ''}</span>
        ${m.s ? `<span class="state-pill ${open ? 'open' : 'closed'}">${esc(m.s)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function renderPager(pages) {
  const $p = $('pager');
  $p.innerHTML = '';
  if (pages <= 1) return;
  const mk = (label, page, dis, cur) => {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = label; b.disabled = !!dis;
    if (cur) b.setAttribute('aria-current', 'true');
    b.onclick = () => { curPage = page; render(); };
    return b;
  };
  $p.append(
    mk('الأولى', 1, curPage === 1), mk('السابق', curPage - 1, curPage === 1),
    mk(String(curPage), curPage, false, true),
    mk(String(pages), pages, false, pages === curPage),
    mk('التالي', curPage + 1, curPage === pages), mk('الأخيرة', pages, curPage === pages)
  );
  const info = document.createElement('span');
  info.className = 'pageinfo';
  info.textContent = `صفحة ${fmt(curPage)} من ${fmt(pages)}`;
  $p.insertBefore(info, $p.children[3]);
}
function render() {
  apply();
  window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
}

/* ---------- favorites ---------- */
/* hard two-line elide: line-clamp alone leaves a hidden third line in the box,
   which paint-overlap checks (and copy/paste) see; truncate to what really fits */
function fitName(el) {
  const full = el.textContent;
  const max = el.clientHeight;
  if (!max || el.scrollHeight <= max) return;
  let lo = 0, hi = full.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    el.textContent = full.slice(0, mid).trimEnd() + '…';
    if (el.scrollHeight <= max) lo = mid; else hi = mid - 1;
  }
  el.textContent = full.slice(0, lo).trimEnd().replace(/[^\p{L}\p{N}]+$/u, '') + '…';
}

function toggleFav(id, btn) {
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  localStorage.setItem('dz_favs', JSON.stringify([...favs]));
  if (btn) { btn.classList.toggle('on', favs.has(id)); btn.setAttribute('aria-pressed', String(favs.has(id))); }
  if (favOnly) apply();
}

/* ---------- modal ---------- */
const overlay = $('overlay'), modal = $('modal');
function openMerchant(id) {
  const m = M.find(x => x.i === id);
  if (!m) return;
  const gallery = [1, 2, 3, 4].map(k => imgPath(m, k));
  const hours = (m.h || '').split(' | ').filter(Boolean);
  const map = (m.la != null && m.ln != null)
    ? `https://www.google.com/maps/search/?api=1&query=${m.la},${m.ln}` : null;

  modal.innerHTML = `
    <button class="close" aria-label="إغلاق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <div class="hero">
      <div class="cover" id="hero" style="background-image:url('${gallery[0]}')"></div>
      <div class="hero-ph">${esc(cleanName(m.n).trim().charAt(0))}</div>
    </div>
    <div class="thumbs">${gallery.map((g, k) => `<img src="${g}" data-src="${g}" class="${k === 0 ? 'active' : ''}" alt="" onerror="this.remove()">`).join('')}</div>
    <div class="modal-body">
      <h2 id="mTitle">${esc(cleanName(m.n))}</h2>
      <div class="meta"><span>${esc(m.c || '')}</span><span>${esc(m.ci || '')}</span><span>${esc(m.w || '')}</span></div>
      ${m.r != null
        ? `<div class="rate" style="margin-top:8px"><span class="star">${stars(m.r)}</span> ${m.r.toFixed(1)} <small>(${fmt(m.rv || 0)} مراجعة Google)</small></div>`
        : `<div class="no-rate" style="margin-top:8px">بدون تقييم</div>`}
      <div class="rows">
        <div class="row"><b>الهاتف</b>
          ${m.p ? `<a class="tel" href="tel:${esc(m.p)}">${esc(m.p)}</a>` : 'غير متوفر'}
          ${(m.ps || []).filter(p => p !== m.p).map(p => `<div><a class="tel" href="tel:${esc(p)}">${esc(p)}</a></div>`).join('')}
        </div>
        <div class="row"><b>العنوان</b>${esc(m.a || 'غير متوفر')}</div>
        <div class="row"><b>الحالة</b>${esc(m.s || 'غير متوفر')}</div>
        ${map ? `<div class="row"><b>الخريطة</b><a href="${map}" target="_blank" rel="noopener">فتح في خرائط Google</a></div>` : ''}
        ${m.ws ? `<div class="row"><b>الموقع</b><a href="${esc(m.ws)}" target="_blank" rel="noopener">${esc(m.ws)}</a></div>` : ''}
      </div>
      ${hours.length ? `<div class="hours"><b>أوقات العمل:</b><br>${hours.map(esc).join('<br>')}</div>` : ''}
      <div class="actions">
        ${m.p ? `<a class="btn btn--primary" href="tel:${esc(m.p)}">اتصال</a>` : ''}
        ${map ? `<a class="btn" href="${map}" target="_blank" rel="noopener">الاتجاهات</a>` : ''}
      </div>
    </div>`;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.close').onclick = closeModal;
  const probe = new Image();
  probe.onload = () => modal.querySelector('.hero-ph')?.remove();
  probe.onerror = () => $('hero')?.remove();
  probe.src = gallery[0];
  modal.querySelectorAll('.thumbs img').forEach(img => {
    img.onclick = () => {
      $('hero').style.backgroundImage = `url('${img.dataset.src}')`;
      modal.querySelectorAll('.thumbs img').forEach(x => x.classList.remove('active'));
      img.classList.add('active');
    };
  });
  modal.querySelector('.close').focus();
}
function closeModal() {
  overlay.classList.remove('show');
  document.body.style.overflow = '';
}
overlay.onclick = e => { if (e.target === overlay) closeModal(); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Tab' && overlay.classList.contains('show')) {
    const f = modal.querySelectorAll('button, a[href], input, select');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
});

/* ---------- search suggestions (combobox) ---------- */
const SUG_COUNT = 8;
const $sug = $('searchSug'), $qClear = $('qClear'), $searchBox = $('searchBox');
let sugItems = [], sugActive = -1;

function highlight(name, qTokens) {
  const hay = cleanName(name);
  const f = fold(hay);
  let out = '';
  let cut = 0, i = 0;
  const marks = [];
  for (const t of qTokens) {
    let at = f.indexOf(t);
    while (at !== -1) {
      marks.push([at, at + t.length]);
      at = f.indexOf(t, at + 1);
    }
  }
  if (!marks.length) return esc(hay);
  marks.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of marks) {
    if (merged.length && a <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
    else merged.push([a, b]);
  }
  for (const [a, b] of merged) {
    out += esc(hay.slice(cut, a)) + '<mark>' + esc(hay.slice(a, b)) + '</mark>';
    cut = b;
  }
  out += esc(hay.slice(cut));
  return out;
}

function sugThumbBg(m) {
  return `${imgPath(m, 1)}`;
}

function renderSuggestions(qTokens) {
  if (!qTokens.length || !SEARCH_INDEX) { hideSuggestions(); return; }
  const q = qTokens.join(' ');
  sugItems = [];
  for (let idx = 0; idx < SEARCH_INDEX.length && sugItems.length < SUG_COUNT; idx++) {
    const sc = searchScore(idx, qTokens);
    if (sc) sugItems.push({ sc, m: M[idx] });
  }
  sugItems.sort((a, b) => b.sc - a.sc
    || (b.m.r ?? -1) - (a.m.r ?? -1)
    || (b.m.rv ?? 0) - (a.m.rv ?? 0)
    || (a.m.n || '').localeCompare(b.m.n || '', 'ar'));
  sugItems = sugItems.slice(0, SUG_COUNT);

  if (!sugItems.length) {
    $sug.innerHTML = `<div class="sug-empty">لا اقتراحات لـ «${esc(q)}» — اضغط Enter للبحث الشامل</div>`;
    $sug.hidden = false; $q.setAttribute('aria-expanded', 'true');
    sugActive = -1;
    return;
  }
  $sug.innerHTML = sugItems.map((it, k) => {
    const m = it.m;
    const thumb = (m.ps && m.ps.length) || m.image
      ? `<span class="sug-thumb" style="background-image:url('${sugThumbBg(m)}')"></span>`
      : `<span class="sug-thumb">${esc(cleanName(m.n).trim().charAt(0))}</span>`;
    const rate = m.r != null
      ? `<span class="sug-rate"><span class="star">${stars(m.r)}</span> ${m.r.toFixed(1)}</span>` : '';
    return `<button class="sug" role="option" id="sug-${k}" aria-selected="false" data-id="${m.i}">${thumb}
      <span class="sug-body"><span class="sug-name">${highlight(m.n, qTokens)}</span>
      <span class="sug-meta">${esc(m.c || '')}${m.c && m.w ? ' · ' : ''}${esc(m.w || '')}</span></span>${rate}</button>`;
  }).join('');
  $sug.hidden = false;
  $q.setAttribute('aria-expanded', 'true');
  sugActive = -1;
}

function hideSuggestions() {
  $sug.hidden = true; $sug.innerHTML = '';
  $q.setAttribute('aria-expanded', 'false');
  sugActive = -1;
}

function moveSug(dir) {
  if ($sug.hidden || !sugItems.length) return;
  const opts = $sug.querySelectorAll('.sug');
  if (sugActive >= 0) opts[sugActive]?.setAttribute('aria-selected', 'false');
  sugActive = dir > 0
    ? (sugActive + 1 + opts.length) % opts.length
    : (sugActive - 1 + opts.length) % opts.length;
  opts[sugActive].setAttribute('aria-selected', 'true');
  opts[sugActive].scrollIntoView({ block: 'nearest' });
  $q.setAttribute('aria-activedescendant', opts[sugActive].id);
}

/* ---------- search field wiring ---------- */
function syncSearchChrome() {
  const has = $q.value.length > 0;
  $searchBox.classList.toggle('has-value', has);
  $qClear.hidden = !has;
}

$q.addEventListener('input', () => {
  syncSearchChrome();
  const qTokens = tokenize($q.value);
  if (qTokens.length >= 2 || (qTokens.length === 1 && qTokens[0].length >= 2)) renderSuggestions(qTokens);
  else hideSuggestions();
});

$q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSug(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSug(-1); }
  else if (e.key === 'Enter') {
    if (sugActive >= 0 && !$sug.hidden) {
      e.preventDefault();
      $sug.querySelectorAll('.sug')[sugActive]?.click();
    } else hideSuggestions();
  }
  else if (e.key === 'Escape') { hideSuggestions(); $q.blur(); }
});

$sug.addEventListener('click', (e) => {
  const b = e.target.closest('.sug'); if (!b) return;
  hideSuggestions();
  openMerchant(Number(b.dataset.id));
});

document.addEventListener('click', (e) => {
  if (!$searchBox.contains(e.target)) hideSuggestions();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !$searchBox.contains(document.activeElement)
    && !overlay.classList.contains('show')) {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      e.preventDefault(); $q.focus(); $q.select();
    }
  }
});

$qClear.addEventListener('click', () => {
  $q.value = ''; syncSearchChrome(); hideSuggestions(); $q.focus(); apply();
});

/* ---------- events ---------- */
let t;
$q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 220); });
[$w, $c, $r, $s].forEach(el => el.addEventListener('change', apply));

$('quickRating').addEventListener('click', e => {
  const b = e.target.closest('.cell'); if (!b) return;
  $r.value = b.dataset.r; apply();
});
$('quickOpen').onclick = e => { quickOpen = !quickOpen; e.currentTarget.setAttribute('aria-pressed', String(quickOpen)); apply(); };
$('withPhoneChip').onclick = e => { withPhoneOnly = !withPhoneOnly; e.currentTarget.setAttribute('aria-pressed', String(withPhoneOnly)); apply(); };
$('favChip').onclick = e => { favOnly = !favOnly; e.currentTarget.setAttribute('aria-pressed', String(favOnly)); apply(); };
$('favBtn').onclick = () => { favOnly = !favOnly; apply(); };
$('resetBtn').onclick = () => {
  $q.value = ''; $w.value = ''; $c.value = ''; $r.value = ''; $s.value = 'name';
  syncSearchChrome(); hideSuggestions();
  quickOpen = withPhoneOnly = favOnly = false; curPage = 1; apply();
};

$('grid').addEventListener('click', e => {
  const heart = e.target.closest('.heart');
  if (heart) { e.preventDefault(); toggleFav(Number(heart.dataset.heart), heart); return; }
  const c = e.target.closest('.card');
  if (c) { e.preventDefault(); openMerchant(Number(c.dataset.id)); }
});

/* ---------- CSV export ---------- */
$('export').onclick = () => {
  const cols = ['id', 'name', 'category', 'phone', 'rating', 'reviews', 'address', 'city', 'wilaya', 'url'];
  const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  filtered.forEach(m => lines.push([m.i, m.n, m.c, m.p, m.r, m.rv, m.a, m.ci, m.w].map(cell).join(',')));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'merchants-filtered.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`تم تصدير ${fmt(filtered.length)} نتيجة`);
};

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- theme ---------- */
const themeBtn = $('themeBtn');
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  localStorage.setItem('dz_theme', th);
}
setTheme(localStorage.getItem('dz_theme')
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'platform'));
themeBtn.onclick = () =>
  setTheme(document.documentElement.dataset.theme === 'night' ? 'platform' : 'night');

/* ---------- start ---------- */
readUrl();
apply();
