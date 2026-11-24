(() => {
'use strict';
const C = window.KRIT_CONFIG;
const ICONS = window.ICONS || {};
const tg = window.Telegram && window.Telegram.WebApp;
const inTg = !!(tg && tg.initData);
const $app = document.getElementById('app');
const $viewer = document.getElementById('viewer');
const $track = document.getElementById('viewer-track');
const $cap = document.getElementById('viewer-cap');
const $toast = document.getElementById('toast');

/* ---------- helpers ---------- */
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const fmtMin = m => m == null ? '—' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}`;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const clean = s => (s || '').replace(/\s*\((?:в списке удобств|в описании|на фото)[^)]*\)/g, '').trim();
const parts = s => (s || '').split(';').map(x => x.trim()).filter(x => x && x !== '—');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};
const haptic = (t) => { try { if (!tg || !tg.HapticFeedback) return; if (t === 'ok') tg.HapticFeedback.notificationOccurred('success'); else if (t === 'err') tg.HapticFeedback.notificationOccurred('error'); else tg.HapticFeedback.selectionChanged(); } catch (e) { /* ignore */ } };
let toastT;
function toast(msg) { $toast.textContent = msg; $toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { $toast.hidden = true; }, 2200); }
function openLink(url) { if (tg && tg.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener'); }

/* ---------- theme ---------- */
function applyTheme() {
  const dark = tg && tg.colorScheme ? tg.colorScheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  try { if (tg) { tg.setHeaderColor && tg.setHeaderColor(bg); tg.setBackgroundColor && tg.setBackgroundColor(bg); tg.setBottomBarColor && tg.setBottomBarColor(bg); } } catch (e) { /* old client */ }
}

/* ---------- user ---------- */
let me = null;
if (inTg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
  const u = tg.initDataUnsafe.user;
  me = { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Без имени', username: u.username || null, photo: u.photo_url || null };
}
const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const hue = id => { let h = 0; String(id).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 360; }); return h; };
const ava = (u, cls = '') => {
  const style = `background:hsl(${hue(u.user_id || u.id)} 45% 48%)`;
  return `<span class="ava ${cls}" style="${style}">${u.photo_url || u.photo ? `<img src="${esc(u.photo_url || u.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(initials(u.user_name || u.name))}</span>`;
};

/* ---------- data ---------- */
const CATS = {
  main: ['Главное', 'house'], ext: ['Общий вид', 'house'], pool: ['Бассейн', 'pool'], bed: ['Спальни', 'bed-double'],
  living: ['Гостиная', 'sofa'], kitchen: ['Кухня', 'cooking-pot'], env: ['Вокруг', 'trees'], jacuzzi: ['Джакузи', 'bath'],
  gym: ['Спортзал', 'dumbbell'], bbq: ['Барбекю', 'flame'], kids: ['Детям', 'baby'], tennis: ['Теннис', 'pingpong'], other: ['Разное', 'image']
};
const VOTES = { 1: ['Нравится', 'thumbs-up', 'like'], 0: ['Сомневаюсь', 'circle-help', 'doubt'], '-1': ['Не нравится', 'thumbs-down', 'dislike'] };

const S = Object.assign({
  houses: [], byId: {}, votes: [], sig: '',
  view: 'list', cat: 'near', sort: 'rank', onlyNew: false, rcat: 'near', gcat: 'all',
  hid: null, nav: null, listScroll: 0, showRest: false, loadErr: false
}, store.get('krit_ui', {}));
const saveUi = () => store.set('krit_ui', { cat: S.cat, sort: S.sort, rcat: S.rcat, onlyNew: S.onlyNew });
const isNear = h => h.walkMin != null && h.walkMin <= C.nearMinutes;
const catOf = h => isNear(h) ? 'near' : 'far';

function psrc(p, size) {
  if (/^https?:/.test(p)) return p + (p.includes('?') ? '&' : '?') + 'im_w=' + (size === 't' ? 480 : size === 'm' ? 720 : 1200);
  return size === 't' ? p.replace(/\/([^/]+)$/, '/t$1') : p;
}
const heroOf = h => (h.photos.find(p => p[0] === 'main') || h.photos[0] || [null, ''])[1];
const img = (p, size, alt = '', extra = '') => p ? `<img src="${esc(psrc(p, size))}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${extra}>` : '';

function votesFor(hid) { return S.votes.filter(v => v.house_id === hid); }
function myVote(hid) { return me ? S.votes.find(v => v.house_id === hid && String(v.user_id) === String(me.id)) : null; }
function tallyOf(hid) {
  const vs = votesFor(hid); const t = { l: 0, d: 0, n: 0, all: vs.length, vs };
  vs.forEach(v => { if (v.vote === 1) t.l++; else if (v.vote === 0) t.d++; else t.n++; });
  t.score = t.l - t.n; return t;
}

const api = (path, opt = {}) => fetch(C.supabaseUrl + '/rest/v1/' + path, Object.assign({}, opt, {
  headers: Object.assign({ apikey: C.supabaseKey, 'Content-Type': 'application/json' }, opt.headers || {})
}));

async function loadVotes() {
  const r = await api('votes?select=house_id,user_id,user_name,username,photo_url,vote,comment,updated_at&order=updated_at.asc');
  if (!r.ok) throw new Error('votes ' + r.status);
  const data = await r.json();
  data.forEach(v => { v.user_id = String(v.user_id); });
  const sig = JSON.stringify(data);
  const changed = sig !== S.sig;
  S.votes = data; S.sig = sig;
  return changed;
}

async function castVote(hid, vote, comment) {
  if (!me) return;
  const prev = S.votes.slice();
  const mine = myVote(hid);
  if (mine) { mine.vote = vote; mine.comment = comment || null; }
  else S.votes.push({ house_id: hid, user_id: String(me.id), user_name: me.name, username: me.username, photo_url: me.photo, vote, comment: comment || null, updated_at: new Date().toISOString() });
  renderVote(); patchCounters();
  try {
    const r = await api('rpc/cast_vote', { method: 'POST', body: JSON.stringify({ p_house: hid, p_user: me.id, p_name: me.name, p_username: me.username, p_photo: me.photo, p_vote: vote, p_comment: comment || null }) });
    if (!r.ok) throw new Error(r.status);
    haptic('ok'); toast('Голос сохранён: ' + VOTES[vote][0].toLowerCase());
    loadVotes().then(ch => { if (ch) { renderVote(); patchCounters(); } }).catch(() => {});
  } catch (e) {
    S.votes = prev; renderVote(); patchCounters(); haptic('err'); toast('Не получилось сохранить. Проверьте интернет и нажмите ещё раз.');
  }
}
async function clearVote(hid) {
  if (!me) return;
  const prev = S.votes.slice();
  S.votes = S.votes.filter(v => !(v.house_id === hid && String(v.user_id) === String(me.id)));
  renderVote(); patchCounters();
  try {
    const r = await api('rpc/clear_vote', { method: 'POST', body: JSON.stringify({ p_house: hid, p_user: me.id }) });
    if (!r.ok) throw new Error(r.status);
    haptic(); toast('Голос отменён');
  } catch (e) { S.votes = prev; renderVote(); patchCounters(); toast('Не получилось отменить голос.'); }
}

/* ---------- derived house info ---------- */
function amenities(h) {
  const a = [];
  const p = h.pool || '';
  a.push(p === 'нет' ? { i: 'pool', b: 'Бассейн', s: 'нет', st: 'off' } : { i: 'pool', b: 'Бассейн', s: p === 'собственный' ? 'свой' : p === 'общий' ? 'общий' : 'есть' });
  const j = h.jacuzzi || '';
  a.push(j.startsWith('да') ? { i: 'bath', b: 'Джакузи', s: j.includes('в доме') ? 'в доме' : j.includes('территор') ? 'во дворе' : 'есть' } : { i: 'bath', b: 'Джакузи', s: 'нет', st: 'off' });
  const g = h.grill || '';
  a.push(g.includes('гриль') ? { i: 'flame', b: 'Гриль', s: 'есть' } : g.includes('принадлежн') ? { i: 'flame', b: 'Гриль', s: 'барбекю' } : { i: 'flame', b: 'Гриль', s: 'не ясно', st: 'q' });
  a.push((h.tennis || '').startsWith('да') ? { i: 'pingpong', b: 'Теннис', s: 'стол есть' } : { i: 'pingpong', b: 'Теннис', s: 'не указан', st: 'off' });
  a.push((h.gym || '').startsWith('да') ? { i: 'dumbbell', b: 'Спортзал', s: 'есть' } : { i: 'dumbbell', b: 'Спортзал', s: 'не указан', st: 'off' });
  const k = h.kids || '';
  a.push(k && k !== 'не указано' ? { i: 'baby', b: 'Детям', s: k.includes('площадк') ? 'площадка' : k.includes('игровая') ? 'игровая' : 'игрушки' } : { i: 'baby', b: 'Детям', s: 'не указано', st: 'off' });
  const gd = h.garden || '';
  a.push(gd.includes('сад') ? { i: 'trees', b: 'Сад', s: gd.includes('деревья') ? 'и деревья' : 'есть', g: 1 } : gd.includes('деревья') ? { i: 'trees', b: 'Сад', s: 'деревья', g: 1 } : { i: 'trees', b: 'Сад', s: 'не указан', st: 'q' });
  const ex = parts(h.extra).map(clean);
  const heat = ex.some(x => x.includes('подогрев'));
  a.push(heat ? { i: 'droplets', b: 'Подогрев', s: 'бассейна' } : ex.some(x => x.includes('частный пляж')) ? { i: 'umbrella', b: 'Свой выход', s: 'к морю' } : { i: 'sparkles', b: 'Ещё', s: ex.length ? ex.length + ' удобств' : 'нет', st: ex.length ? '' : 'off' });
  return { list: a, extra: ex };
}

function accents(h) {
  const a = [];
  const w = h.walkMin;
  if (w != null && w <= 5) a.push(['sea', 'umbrella', /через дорогу/.test(h.walk) ? 'Пляж через дорогу' : `Пляж в ${w} мин пешком`]);
  else if (w != null && w <= 15) a.push(['sea', 'footprints', `До пляжа ${w} мин пешком`]);
  if (/белый песок/i.test(h.beachType)) a.push(['sea', 'sun', 'Белый песок']);
  else if (/^песок$/i.test(h.beachType)) a.push(['sea', 'sun', 'Песчаный пляж']);
  const env = h.env || '';
  if (/^Зелёное/i.test(env)) a.push(['', 'leaf', 'Зелёное место' + (env.split(':')[1] ? ': ' + env.split(':')[1].split(',')[0].trim() : '')]);
  if ((h.garden || '').includes('сад')) a.push(['', 'trees', 'Свой сад']);
  if (h.pool === 'собственный') a.push(['sea', 'pool', 'Свой бассейн']);
  const ex = parts(h.extra).map(clean);
  if (ex.some(x => x.includes('подогрев'))) a.push(['sea', 'droplets', 'Подогрев бассейна']);
  if (ex.some(x => x.includes('частный пляж'))) a.push(['sea', 'umbrella', 'Свой выход к морю']);
  if ((h.jacuzzi || '').startsWith('да')) a.push(['sea', 'bath', 'Джакузи']);
  if ((h.tennis || '').startsWith('да')) a.push(['', 'pingpong', 'Настольный теннис']);
  if ((h.gym || '').startsWith('да')) a.push(['', 'dumbbell', 'Спортзал']);
  if (h.kids && h.kids !== 'не указано') a.push(['', 'baby', 'Есть всё для детей']);
  ex.filter(x => !/подогрев|частный пляж/.test(x)).forEach(x => a.push(['', 'sparkles', cap(x)]));
  const air = Math.min(h.herMin || 999, h.chaMin || 999);
  if (air <= 30) a.push(['sea', 'plane', `Аэропорт в ${air} мин`]);
  const shop = (h.shops || '').match(/—\s*([\d,]+)\s*(м|км)/);
  if (shop) { const m = shop[2] === 'км' ? parseFloat(shop[1].replace(',', '.')) * 1000 : parseFloat(shop[1]); if (m <= 600) a.push(['', 'shopping-cart', `Магазин в ${Math.round(m / 10) * 10} м`]); }
  const tav = (h.cafes || '').match(/таверн и ресторанов — (\d+)/);
  if (tav && +tav[1] >= 5) a.push(['', 'utensils-crossed', `Таверн рядом: ${tav[1]}`]);
  if (/трасс/i.test(env)) a.push(['warn', 'triangle-alert', 'Рядом трасса']);
  if (/^Мало зелени/i.test(env)) a.push(['warn', 'mountain', 'Мало зелени вокруг']);
  if (h.pool === 'общий') a.push(['warn', 'users', 'Бассейн общий']);
  if (w != null && w > 30) a.push(['warn', 'car', h.drive ? `До моря на машине ≈ ${h.drive}` : 'До моря нужна машина']);
  return a;
}

/* ---------- lists ---------- */
function sortedList(cat, sort, onlyNew) {
  let arr = S.houses.filter(h => catOf(h) === cat);
  if (onlyNew && me) arr = arr.filter(h => !myVote(h.id));
  const by = {
    rank: (a, b) => a.id - b.id,
    price: (a, b) => a.price - b.price,
    walk: (a, b) => (a.walkMin ?? 999) - (b.walkMin ?? 999),
    top: (a, b) => { const x = tallyOf(a.id), y = tallyOf(b.id); return y.score - x.score || y.l - x.l || x.n - y.n || a.id - b.id; }
  }[sort] || ((a, b) => a.id - b.id);
  return arr.sort(by);
}
function rankList(cat) {
  return S.houses.filter(h => catOf(h) === cat).map(h => ({ h, t: tallyOf(h.id) }))
    .sort((a, b) => b.t.score - a.t.score || b.t.l - a.t.l || a.t.n - b.t.n || b.t.all - a.t.all || a.h.id - b.h.id);
}

/* ---------- render: header / tabs ---------- */
function header() {
  const total = S.houses.length;
  const mine = me ? new Set(S.votes.filter(v => String(v.user_id) === String(me.id)).map(v => v.house_id)).size : 0;
  return `<header class="hdr wrap">
    <div class="hdr-row">
      <div><h1>Крит <span>2027</span></h1><p class="sub">12–25 июня · ${C.people} человек · ${C.nights} ночей · ${total} домов</p></div>
      ${me ? `<div class="me">${ava(me)}<span>${esc(me.name.split(' ')[0])}</span></div>` : ''}
    </div>
    ${me ? `<div class="progress" id="progress"><div><b>${mine} из ${total}</b><small>вы уже оценили</small></div><div class="pbar"><i style="width:${total ? Math.round(mine / total * 100) : 0}%"></i></div></div>`
    : `<div class="progress"><div>${ic('info', 'lg')}</div><div><b>Голосовать можно в Telegram</b><small>Откройте бота <a href="https://t.me/${esc(C.bot)}" class="link">@${esc(C.bot)}</a> — тут можно только смотреть.</small></div></div>`}
  </header>`;
}
function tabs(active) {
  const n = S.houses.filter(isNear).length, f = S.houses.length - n;
  const people = new Set(S.votes.map(v => v.user_id)).size;
  const b = (k, t, s) => `<button type="button" data-act="tab" data-k="${k}" aria-pressed="${active === k}">${t}<small>${s}</small></button>`;
  return `<nav class="tabs wrap"><div class="seg">
    ${b('near', 'У пляжа', `${n} · до ${C.nearMinutes} мин пешком`)}
    ${b('far', 'Дальше', `${f} · больше ${C.nearMinutes} мин`)}
    ${b('results', 'Итоги', people ? `${people} голосуют` : 'кто за что')}
  </div>${active !== 'results' ? chips() : ''}</nav>`;
}
function chips() {
  const c = (k, t, i) => `<button type="button" class="fchip" data-act="sort" data-k="${k}" aria-pressed="${S.sort === k}">${ic(i, 'sm')}${t}</button>`;
  return `<div class="chips-row">
    ${c('rank', 'Оценка семьи', 'star')}${c('price', 'Дешевле', 'euro')}${c('walk', 'Ближе к морю', 'waves')}${c('top', 'Популярные', 'trophy')}
    ${me ? `<button type="button" class="fchip" data-act="onlynew" aria-pressed="${S.onlyNew}">${ic('eye', 'sm')}Не оценённые мной</button>` : ''}
  </div>`;
}

/* ---------- render: list ---------- */
function card(h) {
  const t = tallyOf(h.id); const mv = myVote(h.id);
  const am = amenities(h).list.filter(x => !x.st).slice(0, 8);
  const pp = h.price / C.people;
  return `<button type="button" class="card fade-in" data-act="open" data-id="${h.id}">
    <div class="card-ph">${img(heroOf(h), 'm', h.name)}
      <span class="badge tl">№${h.id} · ${esc(h.plat)}</span>
      ${mv ? `<span class="badge tr v${mv.vote}">${ic(VOTES[mv.vote][1], 'sm')}${VOTES[mv.vote][0]}</span>` : ''}
      <span class="badge bl">${ic('star', 'sm')}семья ${h.fam}/10</span>
    </div>
    <div class="card-b">
      <span class="card-t">${esc(h.name)}</span>
      <span class="card-city">${esc(h.city)}</span>
      <div class="kv">
        <span>${ic('footprints')}${/через дорогу/.test(h.walk) ? 'пляж через дорогу' : fmtMin(h.walkMin) + ' до ' + (h.walkTo === 'моря' ? 'моря' : 'пляжа')}</span>
        <span>${ic('plane')}${fmtMin(Math.min(h.herMin, h.chaMin))}</span>
        <span class="price">${nf(h.price)} €<small style="color:var(--muted);font-weight:600"> · ≈${nf(pp)} €/чел</small></span>
      </div>
      <div class="amen-mini">${am.map(x => `<span class="${x.g ? 'g' : ''}" title="${esc(x.b)}">${ic(x.i)}</span>`).join('')}</div>
      <div class="tally" data-tally="${h.id}">${tallyHtml(t)}</div>
    </div>
  </button>`;
}
function tallyHtml(t) {
  if (!t.all) return `<span class="none">Пока никто не голосовал</span>`;
  return `<span class="l">${ic('thumbs-up', 'sm')}${t.l}</span><span class="d">${ic('circle-help', 'sm')}${t.d}</span><span class="n">${ic('thumbs-down', 'sm')}${t.n}</span>
    <span class="ppl">${t.vs.slice(0, 5).map(v => ava(v, 's')).join('')}</span>`;
}
function renderList() {
  const arr = sortedList(S.cat, S.sort, S.onlyNew);
  S.lastList = arr.map(h => h.id);
  const note = S.cat === 'near' ? `Дома, от которых до пляжа или моря не больше ${C.nearMinutes} минут пешком (по маршруту Google).` : `До пляжа больше ${C.nearMinutes} минут пешком — к морю, скорее всего, придётся ездить на машине.`;
  $app.innerHTML = header() + tabs(S.cat) + `<main class="wrap">
    <p class="cat-note">${note}</p>
    <div class="list">${arr.length ? arr.map(card).join('') : `<div class="empty">${S.onlyNew ? 'Вы оценили все дома в этой категории 🎉' : 'Здесь пусто'}</div>`}</div>
  </main>`;
}

/* ---------- render: house ---------- */
function renderHouse() {
  const h = S.byId[S.hid]; if (!h) { go('list'); return; }
  const nav = S.nav && S.nav.includes(h.id) ? S.nav : sortedList(catOf(h), 'rank', false).map(x => x.id);
  const pos = nav.indexOf(h.id);
  const A = amenities(h);
  const acc = accents(h);
  const pp = h.price / C.people;
  const rating = (h.rating || '').split(' (')[0];
  const rcnt = ((h.rating || '').match(/\((.+)\)/) || [])[1] || '';
  const walkB = /через дорогу/.test(h.walk) ? 'Через дорогу' : fmtMin(h.walkMin);
  const walkS = 'пешком до ' + (h.walkTo === 'моря' ? 'моря' : esc(h.beach)) + (h.walkDist ? ' · ' + esc(h.walkDist) : '') + (h.drive ? ' · на машине ' + esc(h.drive) : '');
  const near = isNear(h);
  const rows = [];
  if (h.beach) rows.push(['umbrella', '', 'Ближайший пляж', `<p>${esc(h.beach)} — ${esc(h.beachType)}</p>`]);
  if (parts(h.otherBeaches).length) rows.push(['waves', '', 'Другие пляжи рядом', `<ul>${parts(h.otherBeaches).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`]);
  if (h.whiteSand && h.whiteSand !== '—') rows.push(['sun', 'amber', 'Ближайший белый песок (на машине)', `<p>${esc(h.whiteSand)}</p>`]);
  if (parts(h.shops).length) rows.push(['shopping-cart', 'olive', 'Магазины', `<ul>${parts(h.shops).map(x => `<li>${esc(cap(x))}</li>`).join('')}</ul>`]);
  if (h.cafes && h.cafes !== '—') rows.push(['utensils-crossed', 'olive', 'Кафе и таверны', `<p>${esc(cap(h.cafes))}</p>`]);
  if (parts(h.sights).length) rows.push(['landmark', 'terra', 'Что посмотреть (на машине)', `<ul>${parts(h.sights).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`]);
  if (h.env) rows.push(['leaf', 'olive', 'Окружение (по спутнику)', `<p>${esc(h.env)}</p>`]);

  const cats = {}; h.photos.forEach(p => { cats[p[0]] = (cats[p[0]] || 0) + 1; });
  const gc = S.gcat !== 'all' && cats[S.gcat] ? S.gcat : 'all';
  const order = Object.keys(CATS).filter(k => cats[k]);

  $app.innerHTML = `<main class="wrap fade-in">
    <div class="hp-top">
      ${inTg ? `<span>${near ? 'У пляжа' : 'Дальше от пляжа'}</span>` : `<button type="button" class="back" data-act="back">${ic('chevron-left')}Назад</button>`}
      <span>${pos + 1} из ${nav.length}</span>
    </div>
    <h1 class="hp-title">${esc(h.name)}</h1>
    <div class="hp-city">${ic('map-pin', 'sm')}${esc(h.city)} <span class="pill ${near ? 'sea' : 'amber'}">${near ? 'У пляжа' : 'Дальше от пляжа'}</span><span class="pill">${esc(h.plat)} · №${h.id}</span></div>

    <section class="split">
      <div class="hero">
        <button type="button" class="hero-ph" data-act="photo" data-i="0">${img(heroOf(h), 'm', h.name, 'fetchpriority="high"')}<span class="badge bl">${ic('image', 'sm')}${h.photos.length} фото</span></button>
        <div class="hero-b">
          <div class="hero-price">${nf(h.price)} €<small>за ${C.nights} ночей, весь дом</small></div>
          <div class="hero-pp">≈ ${nf(pp)} € с человека</div>
          <div class="scores">
            <div class="score"><b>${h.fam}<span style="font-size:11px;color:var(--muted)">/10</span></b><small>семья</small></div>
            <div class="score"><b>${esc(rating || '—')}</b><small>гости${rcnt ? ' · ' + esc(rcnt.replace(' отз.', '')) : ''}</small></div>
          </div>
        </div>
      </div>
      <div class="facts">
        <div class="fact"><span class="ico">${ic('footprints')}</span><div><b>${walkB}</b><small>${walkS}</small></div></div>
        <div class="fact"><span class="ico">${ic('waves')}</span><div><b>${esc(h.seaLine || '—')}</b><small>до моря по прямой</small></div></div>
        <div class="fact"><span class="ico amber">${ic('umbrella')}</span><div><b>${esc(cap(h.beachType) || '—')}</b><small>пляж: ${esc(h.beach)}</small></div></div>
        <div class="fact"><span class="ico terra">${ic('plane')}</span><div><b>${fmtMin(h.herMin)}</b><small>аэропорт Ираклион</small></div></div>
        <div class="fact"><span class="ico terra">${ic('plane')}</span><div><b>${fmtMin(h.chaMin)}</b><small>аэропорт Ханья</small></div></div>
        ${h.env ? `<div class="fact"><span class="ico ${/^Зелёное/.test(h.env) ? 'olive' : 'amber'}">${ic(/^Зелёное/.test(h.env) ? 'leaf' : 'mountain')}</span><div><b>${esc(h.env.split(':')[0])}</b><small>${esc((h.env.split(':')[1] || '').trim())}</small></div></div>` : ''}
      </div>
    </section>

    <section class="block">
      <h3>${ic('house')}Что есть в доме</h3>
      <div class="amen">${A.list.map(x => `<div class="am ${x.st || ''} ${x.g && !x.st ? 'g' : ''}">${ic(x.i)}<b>${esc(x.b)}</b><small>${esc(x.s)}</small></div>`).join('')}</div>
      ${A.extra.length ? `<div class="note"><b>Ещё:</b> ${A.extra.map(esc).join(' · ')}</div>` : ''}
    </section>

    ${acc.length || h.famNote ? `<section class="block">
      <h3>${ic('sparkles')}Главное об этом доме</h3>
      <div class="acc">${acc.map(([c, i, t]) => `<span class="${c}">${ic(i)}${esc(t)}</span>`).join('')}</div>
      ${h.famNote ? `<div class="note"><b>Комментарий семьи:</b> ${esc(h.famNote)}</div>` : ''}
    </section>` : ''}

    <section class="block">
      <h3>${ic('map')}Море и что рядом</h3>
      ${h.mapImg ? `<button type="button" class="mapimg" data-act="map" style="width:100%">${img(h.mapImg, 'f', 'Маршрут пешком до моря')}</button>` : ''}
      <div class="btns">
        ${h.map ? `<button type="button" class="btn" data-act="map">${ic('route')}На карте</button>` : ''}
        <button type="button" class="btn pri" data-act="listing">${ic('external-link')}${esc(h.plat)}</button>
      </div>
      <div class="rows" style="margin-top:12px">${rows.map(([i, c, t, body]) => `<div class="row"><span class="ico ${c}">${ic(i)}</span><div><b>${t}</b>${body}</div></div>`).join('')}</div>
    </section>

    <section class="block" id="gallery">
      <h3>${ic('image')}Фото <span style="color:var(--muted);font-weight:700">${h.photos.length}</span></h3>
      <div class="gcats">
        <button type="button" class="fchip" data-act="gcat" data-k="all" aria-pressed="${gc === 'all'}">Все <small>${h.photos.length}</small></button>
        ${order.map(k => `<button type="button" class="fchip" data-act="gcat" data-k="${k}" aria-pressed="${gc === k}">${ic(CATS[k][1], 'sm')}${CATS[k][0]} <small>${cats[k]}</small></button>`).join('')}
      </div>
      <div class="grid" id="ggrid">${gridHtml(h, gc)}</div>
    </section>

    <section class="vote" id="vote"></section>
    <div class="nav2">
      <button type="button" class="btn" data-act="step" data-d="-1" ${pos <= 0 ? 'disabled style="opacity:.4"' : ''}>${ic('chevron-left')}Предыдущий</button>
      <button type="button" class="btn" data-act="step" data-d="1" ${pos >= nav.length - 1 ? 'disabled style="opacity:.4"' : ''}>Следующий${ic('chevron-right')}</button>
    </div>
  </main>
  <button type="button" class="fab" id="fab" data-act="tovote" hidden></button>`;
  renderVote();
  observeVote();
}
function galleryPhotos(h, gc) { return gc === 'all' ? h.photos : h.photos.filter(p => p[0] === gc); }
function gridHtml(h, gc) {
  return galleryPhotos(h, gc).map((p, i) => `<button type="button" class="${i === 0 ? 'wide' : ''}" data-act="gphoto" data-i="${i}" aria-label="${esc(CATS[p[0]] ? CATS[p[0]][0] : 'Фото')}">${img(p[1], i === 0 ? 'm' : 't', '')}</button>`).join('');
}

function renderVote() {
  const box = document.getElementById('vote'); if (!box || S.view !== 'house') return;
  const ta = box.querySelector('textarea');
  if (ta && document.activeElement === ta) { renderVoters(); updateFab(); return; }
  const h = S.byId[S.hid]; const mv = myVote(h.id); const t = tallyOf(h.id);
  const vb = (v) => `<button type="button" class="vb ${VOTES[v][2]} ${mv && mv.vote === +v ? 'on' : ''}" data-act="vote" data-v="${v}" ${me ? '' : 'disabled'}>${ic(VOTES[v][1])}<span>${VOTES[v][0]}</span></button>`;
  box.innerHTML = `<h3>Ваш голос</h3>
    <p class="vsub">${me ? (mv ? 'Голос можно поменять в любой момент.' : 'Как вам этот дом?') : 'Голосовать можно только из Telegram-бота.'}</p>
    <div class="vbtns">${vb(1)}${vb(0)}${vb(-1)}</div>
    ${me ? `<textarea class="vcom" id="vcom" maxlength="500" placeholder="Комментарий, если хотите: что понравилось или смущает">${esc(mv && mv.comment || '')}</textarea>
    <div class="vrow">
      ${mv ? `<button type="button" class="link" data-act="savecom">${ic('send', 'sm')}Сохранить комментарий</button><button type="button" class="link red" data-act="clear">${ic('undo-2', 'sm')}Отменить голос</button>` : `<span class="vnote">Комментарий сохранится вместе с голосом</span>`}
    </div>` : `<div class="vrow"><a class="link" href="https://t.me/${esc(C.bot)}">${ic('send', 'sm')}Открыть @${esc(C.bot)}</a></div>`}
    <div class="voters" id="voters"></div>`;
  renderVoters(); updateFab();
}
function renderVoters() {
  const el = document.getElementById('voters'); if (!el) return;
  const t = tallyOf(S.hid);
  const vs = t.vs.slice().sort((a, b) => b.vote - a.vote);
  el.innerHTML = `<h4>Как проголосовали · ${t.all ? `<span style="color:var(--like)">${t.l}</span> / <span style="color:var(--doubt)">${t.d}</span> / <span style="color:var(--dislike)">${t.n}</span>` : 'пока никто'}</h4>
    ${vs.map(v => `<div class="voter">${ava(v)}<div class="who"><b>${esc(v.user_name)}</b>${v.comment ? `<p>${esc(v.comment)}</p>` : ''}</div><span class="vtag v${v.vote}">${ic(VOTES[v.vote][1], 'sm')}${VOTES[v.vote][0]}</span></div>`).join('')}`;
}
let voteObs;
function observeVote() {
  if (voteObs) voteObs.disconnect();
  const box = document.getElementById('vote'); const fab = document.getElementById('fab');
  if (!box || !fab || !('IntersectionObserver' in window)) return;
  voteObs = new IntersectionObserver(es => { es.forEach(e => { fab.dataset.vis = e.isIntersecting ? '1' : ''; updateFab(); }); }, { rootMargin: '0px 0px -10% 0px' });
  voteObs.observe(box);
}
function updateFab() {
  const fab = document.getElementById('fab'); if (!fab) return;
  const mv = myVote(S.hid);
  fab.hidden = !!fab.dataset.vis;
  fab.className = 'fab' + (mv ? ' v' + mv.vote : '');
  fab.innerHTML = mv ? `${ic(VOTES[mv.vote][1])}${VOTES[mv.vote][0]}` : `${ic('thumbs-up')}Оценить`;
}
function patchCounters() {
  document.querySelectorAll('[data-tally]').forEach(el => { el.innerHTML = tallyHtml(tallyOf(+el.dataset.tally)); });
  const p = document.getElementById('progress');
  if (p && me) { const mine = new Set(S.votes.filter(v => String(v.user_id) === String(me.id)).map(v => v.house_id)).size; p.querySelector('b').textContent = `${mine} из ${S.houses.length}`; p.querySelector('.pbar i').style.width = Math.round(mine / S.houses.length * 100) + '%'; }
}

/* ---------- render: results ---------- */
function renderResults() {
  const people = {};
  S.votes.forEach(v => { (people[v.user_id] = people[v.user_id] || { u: v, n: 0 }).n++; });
  const ppl = Object.values(people).sort((a, b) => b.n - a.n);
  const list = rankList(S.rcat);
  const voted = list.filter(x => x.t.all), rest = list.filter(x => !x.t.all);
  const item = ({ h, t }, i) => {
    const w = t.all || 1;
    return `<button type="button" class="rk ${i < 3 && t.score > 0 ? 'top' : ''}" data-act="open" data-id="${h.id}" data-from="results">
      <span class="rk-n">${i < 3 && t.score > 0 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
      <span class="rk-ph">${img(heroOf(h), 't', '')}</span>
      <span style="min-width:0">
        <span class="rk-t">${esc(h.name)}</span>
        <span class="rk-m" style="display:block">${esc(h.city)} · ${/через дорогу/.test(h.walk) ? 'пляж через дорогу' : fmtMin(h.walkMin) + ' до моря'} · ${nf(h.price)} €</span>
        ${t.all ? `<span class="bar"><i class="l" style="width:${t.l / w * 100}%"></i><i class="d" style="width:${t.d / w * 100}%"></i><i class="n" style="width:${t.n / w * 100}%"></i></span>
        <span class="rk-c"><span class="l">${ic('thumbs-up', 'sm')} ${t.l}</span><span class="d">${ic('circle-help', 'sm')} ${t.d}</span><span class="n">${ic('thumbs-down', 'sm')} ${t.n}</span><span class="sc">${t.score > 0 ? '+' : ''}${t.score}</span></span>` : `<span class="rk-m" style="display:block">Голосов пока нет</span>`}
      </span>
      ${t.all ? `<span class="rk-v">${t.vs.slice().sort((a, b) => b.vote - a.vote).map(v => `<span class="vtag v${v.vote}">${esc(v.user_name.split(' ')[0])}</span>`).join('')}</span>` : ''}
    </button>`;
  };
  $app.innerHTML = header() + tabs('results') + `<main class="wrap fade-in">
    <h2 style="font-size:18px;font-weight:800;margin:8px 0 8px;letter-spacing:-.01em">Рейтинг домов</h2>
    <div class="seg" style="grid-template-columns:1fr 1fr">
      <button type="button" data-act="rcat" data-k="near" aria-pressed="${S.rcat === 'near'}">У пляжа<small>до ${C.nearMinutes} мин пешком</small></button>
      <button type="button" data-act="rcat" data-k="far" aria-pressed="${S.rcat === 'far'}">Дальше от пляжа<small>больше ${C.nearMinutes} мин</small></button>
    </div>
    ${ppl.length ? `<p class="cat-note" style="margin-top:12px">Уже голосуют: ${ppl.length}</p><div class="rsum">${ppl.map(p => `<span class="pp">${ava(p.u, 's')}${esc(p.u.user_name)} <small>${p.n}</small></span>`).join('')}</div>` : ''}
    <div class="legend"><span><i style="background:var(--like)"></i>Нравится</span><span><i style="background:var(--doubt)"></i>Сомневаюсь</span><span><i style="background:var(--dislike)"></i>Не нравится</span><span style="color:var(--muted)">Место = «нравится» минус «не нравится»</span></div>
    <div class="list" style="grid-template-columns:1fr;gap:10px;margin-top:8px">
      ${voted.length ? voted.map(item).join('') : `<div class="empty">В этой категории ещё никто не голосовал</div>`}
      ${rest.length ? (S.showRest ? rest.map((x, i) => item(x, voted.length + i)).join('') : `<button type="button" class="btn full" data-act="rest">${ic('chevron-down')}Показать дома без голосов (${rest.length})</button>`) : ''}
    </div>
  </main>`;
}

/* ---------- viewer ---------- */
let vList = [];
function openViewer(photos, start) {
  vList = photos;
  $track.innerHTML = photos.map((p, i) => `<figure>${img(p[1], 'f', CATS[p[0]] ? CATS[p[0]][0] : '', i === start ? 'loading="eager"' : '')}</figure>`).join('');
  $viewer.hidden = false; document.body.style.overflow = 'hidden';
  $viewer.querySelector('.viewer-close').innerHTML = ic('x');
  requestAnimationFrame(() => { $track.scrollLeft = start * $track.clientWidth; updCap(); });
  syncBack();
}
function updCap() { const i = Math.round($track.scrollLeft / Math.max(1, $track.clientWidth)); const p = vList[i]; if (p) $cap.textContent = `${i + 1} / ${vList.length} · ${CATS[p[0]] ? CATS[p[0]][0] : ''}`; }
function closeViewer() { $viewer.hidden = true; document.body.style.overflow = ''; $track.innerHTML = ''; syncBack(); }
$track.addEventListener('scroll', () => { window.requestAnimationFrame(updCap); }, { passive: true });

/* ---------- routing ---------- */
function route() {
  const m = location.hash.match(/^#h-(\d+)$/);
  if (m && S.byId[+m[1]]) { if (S.hid !== +m[1]) S.gcat = 'all'; S.hid = +m[1]; S.view = 'house'; }
  else if (location.hash === '#results') S.view = 'results';
  else S.view = 'list';
  render();
}
function go(view, id) {
  if (view === 'house') location.hash = 'h-' + id;
  else if (view === 'results') location.hash = 'results';
  else if (location.hash.startsWith('#h-') || location.hash === '#results') history.back();
}
function render() {
  if (!$viewer.hidden) closeViewer();
  if (S.view === 'house') { renderHouse(); window.scrollTo(0, 0); }
  else if (S.view === 'results') { renderResults(); window.scrollTo(0, 0); }
  else { renderList(); window.scrollTo(0, S.listScroll || 0); }
  syncBack();
}
function syncBack() {
  if (!tg || !tg.BackButton) return;
  if (S.view !== 'list' || !$viewer.hidden) tg.BackButton.show(); else tg.BackButton.hide();
}
function goBack() {
  if (!$viewer.hidden) { closeViewer(); return; }
  if (S.view === 'house' && S.fromResults) { S.fromResults = false; history.back(); return; }
  history.back();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  const h = S.byId[S.hid];
  switch (a) {
    case 'tab': {
      const k = el.dataset.k; haptic();
      if (k === 'results') { go('results'); return; }
      S.cat = k; S.listScroll = 0; saveUi();
      if (S.view === 'results') { history.back(); } else { renderList(); window.scrollTo(0, 0); }
      return;
    }
    case 'sort': S.sort = el.dataset.k; saveUi(); haptic(); renderList(); return;
    case 'onlynew': S.onlyNew = !S.onlyNew; saveUi(); haptic(); renderList(); return;
    case 'open': {
      const id = +el.dataset.id;
      if (S.view === 'list') { S.listScroll = window.scrollY; S.nav = S.lastList; }
      else if (S.view === 'results') { S.nav = rankList(S.rcat).map(x => x.h.id); }
      go('house', id); return;
    }
    case 'back': goBack(); return;
    case 'step': {
      const nav = S.nav && S.nav.includes(S.hid) ? S.nav : sortedList(catOf(h), 'rank', false).map(x => x.id);
      const nid = nav[nav.indexOf(S.hid) + (+el.dataset.d)]; if (nid) { haptic(); location.replace('#h-' + nid); }
      return;
    }
    case 'gcat': S.gcat = el.dataset.k; haptic();
      document.querySelectorAll('[data-act="gcat"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === S.gcat));
      document.getElementById('ggrid').innerHTML = gridHtml(h, S.gcat); return;
    case 'photo': openViewer(h.photos, 0); return;
    case 'gphoto': openViewer(galleryPhotos(h, S.gcat), +el.dataset.i); return;
    case 'viewer-close': closeViewer(); return;
    case 'map': if (h.map) openLink(h.map); return;
    case 'listing': openLink(h.link); return;
    case 'tovote': document.getElementById('vote').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    case 'vote': {
      if (!me) return; haptic();
      const v = +el.dataset.v; const com = (document.getElementById('vcom') || {}).value || '';
      castVote(S.hid, v, com.trim()); return;
    }
    case 'savecom': { const mv = myVote(S.hid); if (!mv) return; castVote(S.hid, mv.vote, (document.getElementById('vcom').value || '').trim()); return; }
    case 'clear': clearVote(S.hid); return;
    case 'rcat': S.rcat = el.dataset.k; S.showRest = false; saveUi(); haptic(); renderResults(); return;
    case 'rest': S.showRest = true; renderResults(); return;
  }
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

async function refresh() {
  try {
    const changed = await loadVotes();
    if (!changed) return;
    if (S.view === 'house') { renderVote(); }
    else if (S.view === 'results') { const y = window.scrollY; renderResults(); window.scrollTo(0, y); }
    else patchCounters();
  } catch (e) { /* offline: keep old data */ }
}

/* ---------- boot ---------- */
async function boot() {
  if (tg) {
    try { tg.ready(); tg.expand(); if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) { /* ignore */ }
    tg.onEvent && tg.onEvent('themeChanged', applyTheme);
    tg.BackButton && tg.BackButton.onClick(goBack);
  }
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!tg || !tg.colorScheme) applyTheme(); });
  try {
    const r = await fetch('data/houses.json?v=1');
    S.houses = await r.json();
    S.houses.forEach(h => { S.byId[h.id] = h; });
  } catch (e) {
    $app.innerHTML = `<div class="empty">Не удалось загрузить список домов. Закройте и откройте приложение ещё раз.</div>`; return;
  }
  try { await loadVotes(); } catch (e) { toast('Голоса пока не загрузились — попробую ещё раз'); }
  route();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15000);
}
boot();
})();
