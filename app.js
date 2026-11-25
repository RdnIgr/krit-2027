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
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 256 256" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const tm = m => m == null ? '?' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}`;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const haptic = t => { try { if (!tg || !tg.HapticFeedback) return; if (t === 'ok') tg.HapticFeedback.notificationOccurred('success'); else if (t === 'err') tg.HapticFeedback.notificationOccurred('error'); else if (t === 'hit') tg.HapticFeedback.impactOccurred('medium'); else tg.HapticFeedback.selectionChanged(); } catch (e) { /* old client */ } };
function openLink(url) { if (tg && tg.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener'); }
let toastT;
function toast(msg, undo) {
  $toast.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" data-act="undo">Вернуть</button>` : ''}`;
  $toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { $toast.hidden = true; }, undo ? 4000 : 2400);
}

/* ---------- telegram ---------- */
function paintChrome() {
  try { if (tg) { tg.setHeaderColor && tg.setHeaderColor('#f6f7f9'); tg.setBackgroundColor && tg.setBackgroundColor('#f6f7f9'); tg.setBottomBarColor && tg.setBottomBarColor('#f6f7f9'); } } catch (e) { /* old client */ }
}
let me = null;
if (inTg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
  const u = tg.initDataUnsafe.user;
  me = { id: String(u.id), name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Без имени', username: u.username || null, photo: u.photo_url || null };
}
const hue = id => { let h = 7; String(id).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 360; }); return h; };
const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const ava = (u, cls = '') => {
  const photo = u.photo_url || u.photo, name = u.user_name || u.name, id = u.user_id || u.id;
  return `<span class="ava ${cls}" style="background:hsl(${hue(id)} 42% 46%)">${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(name))}</span>`;
};

/* ---------- vocab ---------- */
const VOTE = {
  1: { k: 'yes', label: 'Нравится', icon: 'heart-fill' },
  0: { k: 'mb', label: 'Сомневаюсь', icon: 'question-bold' },
  '-1': { k: 'no', label: 'Не нравится', icon: 'x-bold' }
};
const CATS = {
  top: { title: 'Топ', short: 'Топ', sub: 'Самые сильные дома подборки' },
  near: { title: 'У моря', short: 'У моря', sub: 'Пешком до 30 минут' },
  far: { title: 'Подальше от моря', short: 'Подальше', sub: 'К морю на машине' },
  p1: { title: 'До 4 000 €', short: 'До 4 тыс. €', big: 'до 4' },
  p2: { title: '4 000-5 000 €', short: '4-5 тыс. €', big: '4-5' },
  p3: { title: 'От 5 000 €', short: '5+ тыс. €', big: '5+' },
  all: { title: 'Все дома', short: 'Все дома', sub: 'Без отбора' }
};
const CAT_KEYS = ['top', 'near', 'far', 'p1', 'p2', 'p3', 'all'];
/* white sand counts as close when it is a drive of 45 minutes or less, without a ferry */
const WHITE_MAX = 45;
const whiteNear = h => !!(h.white && !h.white.port && h.white.t != null && h.white.t <= WHITE_MAX);
const PHOTO = {
  main: ['Главное', 'house'], ext: ['Дом и двор', 'house'], pool: ['Бассейн', 'swimming-pool'], living: ['Гостиная', 'couch'],
  kitchen: ['Кухня и столовая', 'cooking-pot'], bed: ['Спальни', 'bed'], bath: ['Ванные', 'bathtub'], env: ['Вокруг дома', 'tree'],
  jacuzzi: ['Джакузи', 'bathtub'], gym: ['Спортзал', 'barbell'], bbq: ['Барбекю', 'fire'], kids: ['Для детей', 'baby'],
  tennis: ['Теннисный стол', 'ping-pong'], other: ['Ещё фото', 'images']
};
const EXTRA = {
  'велосипеды': ['bicycle', 'Велосипеды'], 'частный пляж/выход к морю': ['umbrella-simple', 'Свой выход к морю'],
  'подогрев бассейна': ['thermometer-hot', 'Подогрев бассейна'], 'гамак': ['tree-palm', 'Гамак'], 'бильярд': ['circle', 'Бильярд'],
  'беседка/пергола': ['sun-horizon', 'Беседка'], 'сауна': ['drop', 'Сауна'], 'теннисный корт': ['ping-pong', 'Теннисный корт'],
  'мини-гольф': ['golf', 'Мини-гольф'], 'печь для пиццы': ['pizza', 'Печь для пиццы'], 'игровая приставка': ['game-controller', 'Игровая приставка']
};

/* ---------- state ---------- */
const S = { houses: [], byId: {}, votes: [], sig: '', view: 'home', cat: 'near', rcat: store.get('krit_rcat', 'near'),
  queue: [], cur: null, hist: [], replay: false, detail: null, photoIdx: 0, showRest: false, full: {}, sheet: null };

// photo entry: [cat, url, thumb, label, mid]; local paths, Airbnb and Booking urls are handled differently
function psrc(e, size) {
  const p = typeof e === 'string' ? e : e[1];
  if (/muscache\.com/.test(p)) return p + (p.includes('?') ? '&' : '?') + 'im_w=' + (size === 't' ? 480 : size === 'm' ? 960 : 1200);
  if (/^https?:/.test(p)) { if (typeof e !== 'string') { if (size === 't' && e[2]) return e[2]; if (size === 'm' && e[4]) return e[4]; } return p; }
  return size === 't' ? p.replace(/\/([^/]+)$/, '/t$1') : p;
}
const photosOf = h => S.full[h.id] || h.photos;
const plabel = p => p[3] || (PHOTO[p[0]] ? PHOTO[p[0]][0] : 'Фото');
const fullReq = {};
function ensureFull(id) {
  if (S.full[id] || fullReq[id]) return fullReq[id] || Promise.resolve(false);
  fullReq[id] = api(`photos?house_id=eq.${id}&select=cat,label,url,mid,thumb&order=ord`).then(r => r.ok ? r.json() : []).then(rows => {
    if (!rows.length) return false;
    S.full[id] = rows.map(r => [PHOTO[r.cat] ? r.cat : 'other', r.url, r.thumb || '', r.label || '', r.mid || '']);
    return true;
  }).catch(() => false);
  return fullReq[id];
}
function photosArrived(id) {
  const showing = (S.view === 'deck' && S.cur === id) || (S.view === 'detail' && S.detail === id);
  if (!showing) return;
  const h = S.byId[id], ph = photosOf(h);
  const tr = document.getElementById('phtrack');
  if (tr && tr.scrollLeft < 4) { tr.innerHTML = slidesHtml(h, ph); document.getElementById('phcount').textContent = `1 из ${ph.length}`; }
  const g = document.getElementById('gallery'); if (g) g.outerHTML = gallerySection(h, ph);
  const tb = document.getElementById('togal-n'); if (tb) tb.textContent = ph.length;
  if (S.sheet === id) renderSheet();
}
const img = (p, size, alt = '', extra = '') => p ? `<img src="${esc(psrc(p, size))}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" ${extra}>` : '';
const heroOf = h => h.photos.find(p => p[0] === 'main') || h.photos[0];
const inCat = (h, c) => {
  if (c === 'all') return true;
  if (c === 'top') return !!h.top;
  if (!h.pick) return false;
  if (c === 'near') return !!h.near;
  if (c === 'far') return !h.near;
  if (c === 'p1') return h.price < 4000;
  if (c === 'p2') return h.price >= 4000 && h.price < 5000;
  if (c === 'p3') return h.price >= 5000;
  return false;
};
const housesIn = cat => S.houses.filter(h => inCat(h, cat));
const leftIn = cat => me ? housesIn(cat).filter(h => !myVote(h.id)).length : housesIn(cat).length;

const votesFor = id => S.votes.filter(v => v.house_id === id);
const myVote = id => me ? S.votes.find(v => v.house_id === id && v.user_id === me.id) : null;
const myCount = cat => me ? housesIn(cat).filter(h => myVote(h.id)).length : 0;
function tally(id) {
  const vs = votesFor(id); const t = { yes: 0, mb: 0, no: 0, all: vs.length, vs };
  vs.forEach(v => { t[VOTE[v.vote].k]++; });
  t.score = t.yes - t.no; return t;
}

/* ---------- api ---------- */
const api = (path, opt = {}) => fetch(C.supabaseUrl + '/rest/v1/' + path, Object.assign({}, opt, {
  headers: Object.assign({ apikey: C.supabaseKey, 'Content-Type': 'application/json' }, opt.headers || {})
}));
async function loadVotes() {
  const r = await api('votes?select=house_id,user_id,user_name,username,photo_url,vote,comment,updated_at&order=updated_at.asc');
  if (!r.ok) throw new Error('votes ' + r.status);
  const data = await r.json(); data.forEach(v => { v.user_id = String(v.user_id); });
  const sig = JSON.stringify(data); const changed = sig !== S.sig; S.votes = data; S.sig = sig; return changed;
}
async function sendVote(id, vote, comment) {
  const prev = S.votes.slice(); const mine = myVote(id);
  if (mine) { mine.vote = vote; mine.comment = comment || null; }
  else S.votes.push({ house_id: id, user_id: me.id, user_name: me.name, username: me.username, photo_url: me.photo, vote, comment: comment || null });
  try {
    const r = await api('rpc/cast_vote', { method: 'POST', body: JSON.stringify({ p_house: id, p_user: me.id, p_name: me.name, p_username: me.username, p_photo: me.photo, p_vote: vote, p_comment: comment || null }) });
    if (!r.ok) throw new Error(r.status);
    return true;
  } catch (e) { S.votes = prev; haptic('err'); toast('Не сохранилось. Проверь интернет и попробуй ещё раз'); return false; }
}
async function dropVote(id) {
  const prev = S.votes.slice(); S.votes = S.votes.filter(v => !(v.house_id === id && v.user_id === me.id));
  try { const r = await api('rpc/clear_vote', { method: 'POST', body: JSON.stringify({ p_house: id, p_user: me.id }) }); if (!r.ok) throw new Error(r.status); }
  catch (e) { S.votes = prev; }
}

/* ---------- deck order: random per person and category, stable between visits ---------- */
function seeded(seedStr) { let h = 2166136261; for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
function orderFor(cat) {
  const ids = housesIn(cat).map(h => h.id);
  const rnd = seeded((me ? me.id : store.get('krit_guest', (() => { const g = String(Math.random()).slice(2); store.set('krit_guest', g); return g; })())) + ':' + cat);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}
function startDeck(cat, replay) {
  S.cat = cat; S.replay = !!replay; S.hist = [];
  const ord = orderFor(cat);
  S.queue = replay ? ord : ord.filter(id => !myVote(id));
  S.cur = S.queue.shift() || null; S.photoIdx = 0;
}

/* ---------- derived house facts ---------- */
function amenities(h) {
  const a = h.am, have = [], miss = [];
  if (a.pool === 'own') have.push(['swimming-pool', 'Свой бассейн', 'только для вас']);
  else if (a.pool === 'shared') have.push(['swimming-pool', 'Общий бассейн', 'с соседями']);
  else if (a.pool === 'yes') have.push(['swimming-pool', 'Бассейн', 'тип не указан']);
  else miss.push('бассейн');
  if (a.jac === 'house') have.push(['bathtub', 'Джакузи', 'в доме']);
  else if (a.jac === 'yard') have.push(['bathtub', 'Джакузи', 'во дворе']);
  else if (a.jac === 'yes') have.push(['bathtub', 'Джакузи', 'есть']);
  else miss.push('джакузи');
  if (a.grill === 'grill') have.push(['fire', 'Гриль', 'для барбекю']);
  else if (a.grill === 'bbq') have.push(['fire', 'Барбекю', 'есть всё нужное']);
  else miss.push('гриль');
  if (a.tennis) have.push(['ping-pong', 'Теннисный стол', 'настольный теннис']); else miss.push('теннисный стол');
  if (a.gym) have.push(['barbell', 'Спортзал', 'тренажёры в доме']); else miss.push('спортзал');
  if (a.kids.length) {
    const k = a.kids.join(' ');
    have.push(['baby', k.includes('площадк') ? 'Детская площадка' : k.includes('игровая') ? 'Игровая комната' : 'Для детей', k.includes('игрушки') ? 'игрушки и игры' : 'есть']);
  } else miss.push('всё для детей');
  if (a.garden === 'garden') have.push(['tree', 'Сад', 'зелень на участке']);
  else if (a.garden === 'trees') have.push(['tree', 'Деревья', 'оливы или фрукты']);
  else miss.push('сад');
  a.extra.forEach(x => { const e = EXTRA[x]; if (e) have.push([e[0], e[1], 'есть']); });
  return { have, miss };
}
function accents(h) {
  const a = [], w = h.walk, am = h.am;
  if (w.cross) a.push(['', 'umbrella-simple', 'Пляж через дорогу']);
  else if (w.min <= 5) a.push(['', 'umbrella-simple', `Пляж в ${w.min} мин пешком`]);
  if (/песок/.test(h.beachType) && !/галька/.test(h.beachType)) a.push(['', 'sun', 'Песчаный пляж']);
  if (h.env.k === 'Зелёное') a.push(['', 'leaf', 'Много зелени вокруг']);
  if (am.garden === 'garden') a.push(['', 'tree', 'Свой сад']);
  if (am.pool === 'own') a.push(['', 'swimming-pool', 'Свой бассейн']);
  if (am.extra.includes('подогрев бассейна')) a.push(['', 'thermometer-hot', 'Бассейн с подогревом']);
  if (am.extra.includes('частный пляж/выход к морю')) a.push(['', 'umbrella-simple', 'Свой выход к морю']);
  const air = Math.min(h.her, h.cha);
  if (air <= 30) a.push(['', 'airplane-tilt', `Аэропорт в ${air} мин`]);
  const shop = Math.min(...h.shops.map(s => s.d || 1e9));
  if (shop <= 500) a.push(['', 'shopping-cart', `Магазин в ${Math.round(shop / 10) * 10} м`]);
  if (h.cafes.tav >= 5) a.push(['', 'fork-knife', `Таверны рядом: ${h.cafes.tav}`]);
  if (/трасс/i.test(h.env.t)) a.push(['warn', 'warning', 'Рядом трасса']);
  if (h.env.k === 'Мало зелени') a.push(['warn', 'mountains', 'Мало зелени вокруг']);
  if (am.pool === 'shared') a.push(['warn', 'users', 'Бассейн общий']);
  if (am.pool === 'no') a.push(['warn', 'warning', 'Нет бассейна']);
  if (am.grill === 'no') a.push(['warn', 'fire', 'Нет гриля']);
  else if (am.grill !== 'grill' && am.grill !== 'bbq') a.push(['warn', 'fire', 'Про гриль ничего не сказано']);
  if (/камни|скал/.test(h.beachType)) a.push(['warn', 'mountains', 'Пляж каменистый']);
  if (!h.near) a.push(['warn', 'car', w.drive ? `До моря на машине ${w.drive} мин` : 'К морю на машине']);
  if (shop > 1500 && shop < 1e9) a.push(['warn', 'shopping-cart', 'Магазин далеко']);
  return a;
}
const beachName = h => h.walk.to === 'sea' ? 'моря' : 'пляжа ' + h.beach;

/* ---------- render: home ---------- */
function coverHouse(cat, used) {
  const list = housesIn(cat).filter(h => h.plat === 'Booking' && !used.includes(h.id));
  const withPool = list.filter(h => h.photos.some(x => x[0] === 'pool'));
  if (cat === 'top') return withPool.find(h => h.env.k === 'Зелёное') || withPool[0] || list[0];
  if (cat === 'near') return withPool.find(h => h.walk.min <= 5) || withPool[0] || list[0];
  if (cat === 'far') return withPool.find(h => h.env.k === 'Зелёное') || withPool[0] || list[0];
  return withPool.find(h => !h.pick) || withPool.find(h => h.env.k === 'Средне') || withPool[0] || list[0];
}
function covers() {
  if (S.covers) return S.covers;
  const used = [], out = {};
  ['top', 'near', 'far'].forEach(k => { const h = coverHouse(k, used); if (h) used.push(h.id); out[k] = h ? (h.photos.find(x => x[0] === 'pool') || h.photos[0]) : ''; });
  return (S.covers = out);
}
function renderHome() {
  const people = new Set(S.votes.map(v => v.user_id)).size;
  const st = k => {
    const n = housesIn(k).length, mine = myCount(k);
    const txt = !me || !mine ? `${n} ${plural(n, 'дом', 'дома', 'домов')}` : mine >= n ? `${ic('check-bold', 's')}готово` : `ещё ${n - mine} из ${n}`;
    return { n, txt, bar: me && mine ? `<span class="tl-bar"><i style="width:${Math.round(mine / n * 100)}%"></i></span>` : '', done: me && mine >= n };
  };
  const photo = (k, extra) => {
    const x = st(k);
    return `<button type="button" class="tl tlp ${extra}" data-act="cat" data-k="${k}">
      ${img(covers()[k], k === 'top' ? 'f' : 'm', '', 'loading="eager"')}
      <span class="tl-b">
        <span class="tl-t">${k === 'top' ? ic('crown-fill') : ''}${CATS[k].title}</span>
        <span class="tl-s">${CATS[k].sub}</span>
        <span class="tl-m ${x.done ? 'ok' : ''}">${x.txt}</span>${x.bar}
      </span>
    </button>`;
  };
  const price = k => {
    const x = st(k);
    return `<button type="button" class="tl pr" data-act="cat" data-k="${k}">
      <span class="tl-big">${CATS[k].big}</span><span class="tl-u">тыс. €</span>
      <span class="tl-m ${x.done ? 'ok' : ''}">${x.txt}</span>${x.bar}
    </button>`;
  };
  const allT = (() => {
    const x = st('all');
    return `<button type="button" class="tl row" data-act="cat" data-k="all">
      <span class="tl-ic">${ic('squares-four', 'l')}</span>
      <span class="tl-b"><b>${CATS.all.title}</b><small class="${x.done ? 'ok' : ''}">${CATS.all.sub}, ${x.txt}</small>${x.bar}</span>
      ${ic('caret-right')}
    </button>`;
  })();
  $app.innerHTML = `<main class="pad">
    <div class="home-top">
      <div class="who">${me ? ava(me) + `<b>Привет, ${esc(me.name.split(' ')[0])}</b>` : ''}</div>
      <button type="button" class="pill-btn" data-act="results">${ic('trophy')}Итоги</button>
    </div>
    <header class="home-hd"><p>Крит, 12-25 июня 2027, ${C.people} человек</p><h1>Выбери категорию</h1></header>
    <div class="tiles">
      ${photo('top', 'wide')}
      ${photo('near', '')}${photo('far', '')}
      <p class="tl-lbl">${ic('wallet', 's')}По цене за ${C.nights} ночей на всех</p>
      <div class="prices">${price('p1')}${price('p2')}${price('p3')}</div>
      ${allT}
    </div>
    <div class="how">
      <div><span class="no">${ic('x-bold', 'l')}</span>Не нравится</div>
      <div><span class="mb">${ic('question-bold', 'l')}</span>Сомневаюсь</div>
      <div><span class="yes">${ic('heart-fill', 'l')}</span>Нравится</div>
    </div>
    <p class="how-t">Оценку ставишь кнопкой вверху карточки. Фото листаются свайпом.</p>
    <button type="button" class="row-link" data-act="results"><span class="ic">${ic('trophy', 'l')}</span><div><b>Итоги голосования</b><small>${people ? `Голосуют ${people} ${plural(people, 'человек', 'человека', 'человек')}` : 'Пока никто не голосовал'}</small></div>${ic('caret-right')}</button>
    ${me ? '' : `<div class="note-tg">Голосовать можно только из Telegram: открой бота @${esc(C.bot)}. Здесь можно просто посмотреть дома.</div>`}
  </main>`;
}

/* ---------- render: house (deck card or detail) ---------- */
function voteBar(h, mode) {
  const mv = myVote(h.id);
  const b = v => `<button type="button" class="vb ${VOTE[v].k} ${mv && mv.vote === +v ? 'on' : ''}" data-act="vote" data-v="${v}" ${me ? '' : 'disabled'}>${ic(VOTE[v].icon)}${VOTE[v].label}</button>`;
  let meta;
  if (mode === 'deck') {
    const total = housesIn(S.cat).length, done = myCount(S.cat);
    meta = `<div class="vmeta">${S.hist.length ? `<button type="button" class="mini ico" data-act="undo" aria-label="Вернуться к прошлому дому">${ic('arrow-counter-clockwise-bold', 's')}</button>` : ''}<span class="cnt-t">${done} из ${total}</span><span class="sp"></span>${tools(h)}</div><div class="prog"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
  } else {
    meta = `<div class="vmeta"><span class="cnt-t">${mv ? 'Твоя оценка: ' + VOTE[mv.vote].label.toLowerCase() : 'Ещё не оценён'}</span><span class="sp"></span>${tools(h)}</div>`;
  }
  return `<div class="vbar pad" id="vbar"><div class="vbtns">${b(-1)}${b(0)}${b(1)}</div>${meta}</div>`;
}
const tools = h => `<button type="button" class="mini" data-act="sheet">${ic('images', 's')}Фото <b id="togal-n">${photosOf(h).length}</b></button><button type="button" class="mini pri" data-act="listing">${ic('arrow-square-out', 's')}${esc(h.plat)}</button>`;
const slidesHtml = (h, photos) => photos.map((p, i) => `<button type="button" class="ph-slide" data-act="sheet" aria-label="Открыть все фото">${img(p, 'm', plabel(p), i < 2 ? 'loading="eager"' : '')}</button>`).join('');
function galleryGroups(photos) {
  const groups = {}; photos.forEach((p, i) => { (groups[p[0]] = groups[p[0]] || []).push(i); });
  return Object.keys(PHOTO).filter(k => groups[k]).map(k => [k, groups[k]]);
}
function galleryGrid(photos, idxs) {
  return `<div class="gg">${idxs.map((idx, j) => { const wide = j === 0 && idxs.length % 2 === 1; return `<button type="button" class="${wide ? 'wide' : ''}" data-act="gphoto" data-i="${idx}">${img(photos[idx], wide ? 'f' : 't', plabel(photos[idx]))}</button>`; }).join('')}</div>`;
}
function gallerySection(h, photos) {
  return `<section class="sec gal" id="gallery"><h2>Все фото <span style="color:var(--muted);font-weight:600">${photos.length}</span></h2>
    ${galleryGroups(photos).map(([k, idxs]) => `<h3>${ic(PHOTO[k][1])}${PHOTO[k][0]} <small>${idxs.length}</small></h3>${galleryGrid(photos, idxs)}`).join('')}
  </section>`;
}
function houseHtml(h, mode) {
  const A = amenities(h), acc = accents(h);
  const pp = h.price / C.people;
  const air = h.her <= h.cha ? ['Ираклион', h.her] : ['Ханья', h.cha];
  const photos = photosOf(h);
  const rt = h.rating;
  const t = tally(h.id);

  const shopRows = h.shops.map(s => `<div class="li"><span class="ic">${ic(s.t.includes('рынок') ? 'storefront' : 'shopping-cart')}</span><div class="t">${esc(cap(s.t))}${s.n ? `<small>${esc(s.n)}</small>` : ''}</div><span class="v">${esc(s.ds)}</span></div>`).join('');
  const cafeRow = h.cafes.tav != null ? `<div class="li"><span class="ic">${ic('fork-knife')}</span><div class="t">Таверны и рестораны<small>в радиусе 1 км</small></div><span class="v">${h.cafes.tav}</span></div>
    <div class="li"><span class="ic">${ic('coffee')}</span><div class="t">Кафе и бары<small>в радиусе 1 км</small></div><span class="v">${h.cafes.caf}</span></div>
    ${h.cafes.near ? `<div class="li"><span class="ic">${ic('map-pin')}</span><div class="t">Ближайшее кафе или таверна</div><span class="v">${esc(h.cafes.near)}</span></div>` : ''}` : '';

  return `
  <div class="pad">
    <div class="ph">
      <div class="ph-track" id="phtrack">${slidesHtml(h, photos)}</div>
      <span class="ph-count" id="phcount">1 из ${photos.length}</span>
      ${whiteNear(h) ? `<span class="ph-white"><span class="em">${ic('sun-fill', 's')}</span><span><b>Белый песок</b><small>${esc(h.white.n)}, ${tm(h.white.t)} на машине</small></span></span>` : ''}
    </div>

    <div class="ttl">
      <h1>${esc(h.name)}</h1>
      <div class="loc">${ic('map-pin', 's')}${esc(h.city)}</div>
      ${rt ? `<div class="rate">${ic('star-fill', 's')}<span><b>${esc(rt.v)}</b> из ${rt.of}, ${rt.n} ${plural(rt.n, 'отзыв', 'отзыва', 'отзывов')} на ${esc(h.plat)}</span></div>` : `<div class="rate">${ic('star', 's')}<span>Отзывов на ${esc(h.plat)} пока нет</span></div>`}
    </div>

    <div class="big">
      <div class="tile"><span class="k">${ic('footprints', 's')}${h.walk.cross ? 'Пляж' : 'Пешком'}</span>
        <span class="v">${h.walk.cross ? 'через дорогу' : tm(h.walk.min)}</span>
        <span class="d">${h.walk.cross ? 'от дома до пляжа ' + esc(h.beach) : 'до ' + esc(beachName(h)) + (h.walk.dist ? ', ' + esc(h.walk.dist) : '')}</span></div>
      <div class="tile price"><span class="k">${ic('house', 's')}За ${C.nights} ночей</span>
        <span class="v">${nf(h.price)}\u00a0€</span>
        <span class="d"><b>${nf(pp)}\u00a0€</b> с человека</span></div>
      <div class="tile"><span class="k">${ic('airplane-tilt', 's')}Аэропорт</span>
        <span class="v">${tm(air[1])}</span>
        <span class="d">до ${air[0] === 'Ираклион' ? 'Ираклиона' : 'Ханьи'} на машине</span></div>
      <div class="tile"><span class="k">${ic('waves', 's')}Пляж</span>
        <span class="v w">${esc(cap(h.beachType))}</span>
        <span class="d">море по прямой ${esc(h.sea)}</span></div>
    </div>

    ${mode === 'detail' ? `<section class="sec"><h2>Как проголосовали</h2>${t.all ? `<div class="voters">${t.vs.slice().sort((a, b) => b.vote - a.vote).map(v => `<div class="vr">${ava(v)}<div class="w"><b>${esc(v.user_name)}</b>${v.comment ? `<p>${esc(v.comment)}</p>` : ''}</div><span class="tag ${VOTE[v.vote].k}">${ic(VOTE[v.vote].icon, 's')}${VOTE[v.vote].label}</span></div>`).join('')}</div>` : `<div class="empty">Пока никто не голосовал за этот дом</div>`}</section>` : ''}

    <section class="sec"><h2>Что есть в доме</h2>
      <div class="amen">${A.have.map(([i, b, s]) => `<div class="am"><span class="ic">${ic(i, 'l')}</span><div><b>${esc(b)}</b><small>${esc(s)}</small></div></div>`).join('')}</div>
      ${A.miss.length ? `<p class="miss"><b>Нет или не указано:</b> ${A.miss.join(', ')}</p>` : ''}
    </section>

    ${acc.length ? `<section class="sec"><h2>Коротко о доме</h2><div class="chips">${acc.map(([c, i, tx]) => `<span class="chip ${c}">${ic(i)}${esc(tx)}</span>`).join('')}</div></section>` : ''}

    <section class="sec"><h2>Море и дорога</h2>
      <div class="list">
        <div class="li"><span class="ic b">${ic('footprints')}</span><div class="t">Пешком до ${esc(beachName(h))}<small>по маршруту Google</small></div><span class="v">${h.walk.cross ? 'через дорогу' : tm(h.walk.min)}</span></div>
        ${h.walk.drive ? `<div class="li"><span class="ic b">${ic('car')}</span><div class="t">На машине до моря</div><span class="v">${tm(h.walk.drive)}</span></div>` : ''}
        <div class="li"><span class="ic b">${ic('waves')}</span><div class="t">До моря по прямой</div><span class="v">${esc(h.sea)}</span></div>
        <div class="li"><span class="ic b">${ic('airplane-tilt')}</span><div class="t">Аэропорт Ираклион<small>на машине</small></div><span class="v">${tm(h.her)}</span></div>
        <div class="li"><span class="ic b">${ic('airplane-tilt')}</span><div class="t">Аэропорт Ханья<small>на машине</small></div><span class="v">${tm(h.cha)}</span></div>
        ${h.white ? `<div class="li"><span class="ic b">${ic('sun')}</span><div class="t">Белый песок: ${esc(h.white.n)}<small>${esc(h.white.note)}</small></div><span class="v">${tm(h.white.t)}${h.white.port ? ' до порта' : ''}</span></div>` : ''}
      </div>
      ${h.beaches.length ? `<div class="sub">Другие пляжи рядом</div><div class="list">${h.beaches.map(b => `<div class="li"><span class="ic">${ic('umbrella-simple')}</span><div class="t">${esc(b.n)}<small>${esc(b.type)}</small></div><span class="v">${tm(b.walk)} пешком</span></div>`).join('')}</div>` : ''}
    </section>

    <section class="sec"><h2>Магазины и таверны</h2><div class="list">${shopRows}${cafeRow}</div></section>

    ${h.sights.length ? `<section class="sec"><h2>Что посмотреть</h2><div class="list">${h.sights.map(s => `<div class="li"><span class="ic">${ic('binoculars')}</span><div class="t">${esc(s.n)}</div><span class="v">${tm(s.t)}</span></div>`).join('')}</div></section>` : ''}

    ${h.env.k ? `<section class="sec"><h2>Что вокруг дома</h2><div class="envbox"><span class="ic ${h.env.k === 'Зелёное' ? '' : 'warn'}">${ic(h.env.k === 'Зелёное' ? 'leaf' : 'mountains', 'l')}</span><div><b>${h.env.k === 'Зелёное' ? 'Зелёное место' : h.env.k === 'Средне' ? 'Зелени средне' : 'Мало зелени'}</b><p>${esc(cap(h.env.t))}</p></div></div></section>` : ''}

    <section class="sec"><h2>Маршрут до моря</h2>
      ${h.mapImg ? `<button type="button" class="mapimg" data-act="map">${img(h.mapImg, 'f', 'Пешеходный маршрут от дома до моря')}</button>` : ''}
      <div class="btns">
        <button type="button" class="btn" data-act="map">${ic('map-trifold')}Карта</button>
        <button type="button" class="btn pri" data-act="listing">${ic('arrow-square-out')}${esc(h.plat)}</button>
      </div>
    </section>

    ${gallerySection(h, photos)}

    ${me ? `<section class="sec com"><label for="com">Комментарий к дому</label>
      <textarea id="com" maxlength="500" placeholder="Например: классный сад, но кухня маленькая">${esc((myVote(h.id) || {}).comment || '')}</textarea>
      ${mode === 'detail' && myVote(h.id) ? `<div class="btns"><button type="button" class="btn" data-act="savecom">${ic('check')}Сохранить</button><button type="button" class="btn" data-act="clear">${ic('x')}Убрать оценку</button></div>` : `<p>Комментарий сохранится вместе с оценкой, когда нажмёшь кнопку наверху.</p>`}
    </section>` : ''}
  </div>`;
}
function renderDeck(anim) {
  if (!S.cur) { renderDone(); return; }
  const h = S.byId[S.cur];
  $app.innerHTML = voteBar(h, 'deck') + `<article class="card ${anim ? 'enter' : ''}" id="card" data-id="${h.id}">${houseHtml(h, 'deck')}</article>`;
  bindCard(); preloadNext();
  const id = h.id; ensureFull(id).then(ok => { if (ok) photosArrived(id); });
  if (S.queue[0]) ensureFull(S.queue[0]);
}
function renderDetail() {
  const h = S.byId[S.detail]; if (!h) { history.back(); return; }
  $app.innerHTML = voteBar(h, 'detail') + `<article class="card" id="card">${houseHtml(h, 'detail')}</article>`;
  bindCard();
  const id = h.id; ensureFull(id).then(ok => { if (ok) photosArrived(id); });
}
function renderDone() {
  const total = housesIn(S.cat).length;
  const left = leftIn('all');
  $app.innerHTML = `<main class="pad done">
    <span class="ic">${ic('check-circle-fill', 'xl')}</span>
    <h1>Все ${total} ${plural(total, 'дом', 'дома', 'домов')} в категории «${CATS[S.cat].title}» оценены</h1>
    <p>${left ? `Ещё не оценено ${left} ${plural(left, 'дом', 'дома', 'домов')} в других категориях. Посмотри итоги или выбери другую категорию.` : 'Ты оценил все дома. Посмотри, что выбрали остальные.'}</p>
    <div class="btns">
      <button type="button" class="btn pri" data-act="results" data-k="${S.cat}">${ic('trophy')}Итоги</button>
      ${left ? `<button type="button" class="btn" data-act="home">${ic('squares-four')}Другие категории</button>` : ''}
      <button type="button" class="btn" data-act="replay">${ic('arrows-clockwise')}Пересмотреть мои оценки</button>
    </div>
  </main>`;
}
function preloadNext() { const n = S.queue[0]; if (!n) return; const h = S.byId[n]; const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = psrc(photosOf(h)[0], 'm'); }

/* ---------- render: results ---------- */
function renderResults() {
  const ppl = {}; S.votes.forEach(v => { (ppl[v.user_id] = ppl[v.user_id] || { u: v, n: 0 }).n++; });
  const people = Object.values(ppl).sort((a, b) => b.n - a.n);
  const list = housesIn(CATS[S.rcat] ? S.rcat : 'near').map(h => ({ h, t: tally(h.id) }))
    .sort((a, b) => b.t.score - a.t.score || b.t.yes - a.t.yes || a.t.no - b.t.no || b.t.all - a.t.all || a.h.id - b.h.id);
  const voted = list.filter(x => x.t.all), rest = list.filter(x => !x.t.all);
  const item = ({ h, t }, i) => `<button type="button" class="rk" data-act="open" data-id="${h.id}">
      <span class="n ${i < 3 && t.score > 0 ? 'top' : ''}">${i === 0 && t.score > 0 ? ic('crown-fill', 'l') : i + 1}</span>
      <span class="th">${img(heroOf(h), 't')}</span>
      <span class="b"><b>${esc(h.name)}</b><small>${h.walk.cross ? 'пляж через дорогу' : tm(h.walk.min) + (h.walk.to === 'sea' ? ' до моря' : ' до пляжа')}, ${nf(h.price)}\u00a0€</small>
        ${t.all ? `<span class="cnt"><span class="yes">${ic('heart-fill', 's')}${t.yes}</span><span class="mb">${ic('question-bold', 's')}${t.mb}</span><span class="no">${ic('x-bold', 's')}${t.no}</span><span class="sc">${t.score > 0 ? '+' : ''}${t.score}</span></span>` : `<small>Голосов пока нет</small>`}
      </span>
      ${t.all ? `<span class="vs">${t.vs.slice().sort((a, b) => b.vote - a.vote).map(v => `<span class="tag ${VOTE[v.vote].k}">${ic(VOTE[v.vote].icon, 's')}${esc(v.user_name.split(' ')[0])}</span>`).join('')}</span>` : ''}
    </button>`;
  $app.innerHTML = `<main class="pad">
    <header class="rh"><h1>Итоги</h1><p>Место дома: сколько «нравится» минус сколько «не нравится».</p></header>
    <div class="rchips">
      ${CAT_KEYS.map(k => `<button type="button" data-act="rcat" data-k="${k}" aria-pressed="${S.rcat === k}">${k === 'top' ? ic('crown-fill', 's') : ''}${CATS[k].short}</button>`).join('')}
    </div>
    ${people.length ? `<div class="ppl">${people.map(p => `<span>${ava(p.u, 's')}${esc(p.u.user_name)} <small>${p.n}</small></span>`).join('')}</div>` : ''}
    <div class="rlist">
      ${voted.length ? voted.map(item).join('') : `<div class="empty">В этой категории ещё никто не голосовал</div>`}
    </div>
    ${rest.length ? (S.showRest ? `<div class="rlist">${rest.map((x, i) => item(x, voted.length + i)).join('')}</div>` : `<button type="button" class="btn full more" style="width:100%" data-act="rest">Дома без голосов: ${rest.length}</button>`) : ''}
  </main>`;
}

/* ---------- photo carousel: native swipe, voting only by buttons ---------- */
function bindCard() {
  const tr = document.getElementById('phtrack'), cnt = document.getElementById('phcount'); if (!tr || !cnt) return;
  const n = tr.children.length; let last = -1;
  tr.addEventListener('scroll', () => requestAnimationFrame(() => {
    const i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
    if (i !== last) { last = i; cnt.textContent = `${i + 1} из ${n}`; if (i > 0) haptic(); }
  }), { passive: true });
}

async function cast(v) {
  if (!me) { toast('Голосовать можно только из Telegram'); return; }
  const id = S.view === 'deck' ? S.cur : S.detail; if (!id) return;
  const com = ((document.getElementById('com') || {}).value || '').trim();
  haptic('hit');
  if (S.view === 'deck') {
    const card = document.getElementById('card');
    const W = window.innerWidth;
    if (card) {
      card.style.transition = 'transform .3s cubic-bezier(.4,0,.6,1), opacity .3s';
      card.style.transform = v === 0 ? 'translateY(40px) scale(.96)' : `translateX(${v > 0 ? 1.3 * W : -1.3 * W}px) rotate(${v > 0 ? 12 : -12}deg)`;
      card.style.opacity = '0';
    }
    const ok = sendVote(id, v, com);
    S.hist.push(id);
    setTimeout(() => {
      S.cur = S.queue.shift() || null; S.photoIdx = 0;
      window.scrollTo(0, 0); renderDeck(true);
    }, 280);
    if (await ok) toast(VOTE[v].label, true); else { S.hist.pop(); S.queue.unshift(S.cur); S.cur = id; renderDeck(true); }
  } else {
    if (await sendVote(id, v, com)) { haptic('ok'); toast('Оценка сохранена'); const y = window.scrollY; renderDetail(); window.scrollTo(0, y); }
  }
}
function undo() {
  if (S.view !== 'deck' || !S.hist.length) return;
  const id = S.hist.pop(); if (S.cur) S.queue.unshift(S.cur);
  S.cur = id; S.photoIdx = 0; $toast.hidden = true; window.scrollTo(0, 0); renderDeck(true);
}

/* ---------- viewer: full-screen photo gallery ---------- */
let vList = [], vFull = false;
const $sheet = document.getElementById('sheet');
function wantFull(on) {
  try {
    if (on && !vFull && tg && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && tg.requestFullscreen && !tg.isFullscreen) { tg.requestFullscreen(); vFull = true; }
    if (!on && vFull && $viewer.hidden && $sheet.hidden && tg && tg.exitFullscreen) { tg.exitFullscreen(); vFull = false; }
  } catch (e) { vFull = false; }
}
function renderSheet() {
  const h = S.byId[S.sheet]; if (!h) return; const ph = photosOf(h); const gs = galleryGroups(ph);
  document.getElementById('sheet-title').textContent = `${ph.length} ${plural(ph.length, 'фото', 'фото', 'фото')}`;
  document.getElementById('sheet-sub').textContent = h.name;
  document.getElementById('sheet-cats').innerHTML = gs.map(([k, idxs]) => `<button type="button" class="chip-s" data-act="sheet-jump" data-k="${k}">${ic(PHOTO[k][1], 's')}${PHOTO[k][0]} <small>${idxs.length}</small></button>`).join('');
  document.getElementById('sheet-body').innerHTML = gs.map(([k, idxs]) => `<section class="sgrp" id="sg-${k}"><h3>${PHOTO[k][0]} <small>${idxs.length}</small></h3>${galleryGrid(ph, idxs)}</section>`).join('');
}
function openSheet(h) {
  S.sheet = h.id; renderSheet();
  document.getElementById('sheet-x').innerHTML = ic('x-bold', 'l');
  $sheet.hidden = false; $sheet.classList.remove('out'); document.body.style.overflow = 'hidden';
  document.getElementById('sheet-body').scrollTop = 0;
  wantFull(true); syncBack(); haptic();
  ensureFull(h.id).then(ok => { if (ok && S.sheet === h.id) { renderSheet(); photosArrived(h.id); } });
}
function closeSheet() {
  if ($sheet.hidden) return;
  $sheet.classList.add('out');
  setTimeout(() => { $sheet.hidden = true; $sheet.classList.remove('out'); S.sheet = null; if ($viewer.hidden) document.body.style.overflow = ''; wantFull(false); syncBack(); }, 220);
}
function openViewer(h, start) {
  vList = photosOf(h);
  $track.innerHTML = vList.map((p, i) => `<figure>${img(p, 'f', plabel(p), Math.abs(i - start) < 2 ? 'loading="eager"' : '')}</figure>`).join('');
  document.getElementById('viewer-x').innerHTML = ic('x-bold', 'l');
  document.getElementById('vprev').innerHTML = ic('caret-left-bold', 'l');
  document.getElementById('vnext').innerHTML = ic('caret-right-bold', 'l');
  $viewer.hidden = false; document.body.style.overflow = 'hidden';
  wantFull(true);
  requestAnimationFrame(() => { $track.scrollLeft = start * $track.clientWidth; updCap(); });
  syncBack(); haptic();
}
function updCap() {
  const i = Math.round($track.scrollLeft / Math.max(1, $track.clientWidth)); const p = vList[i]; if (!p) return;
  $cap.textContent = `${plabel(p)} · ${i + 1} из ${vList.length}`;
  document.getElementById('vprev').disabled = i === 0;
  document.getElementById('vnext').disabled = i === vList.length - 1;
}
function stepViewer(d) { const w = $track.clientWidth; const i = Math.round($track.scrollLeft / Math.max(1, w)) + d; if (i < 0 || i >= vList.length) return; $track.scrollTo({ left: i * w, behavior: 'smooth' }); }
function closeViewer() {
  $viewer.hidden = true; $track.innerHTML = '';
  if ($sheet.hidden) document.body.style.overflow = '';
  wantFull(false); syncBack();
}
document.addEventListener('keydown', e => {
  if ($viewer.hidden) { if (e.key === 'Escape' && !$sheet.hidden) closeSheet(); return; }
  if (e.key === 'ArrowRight') stepViewer(1); else if (e.key === 'ArrowLeft') stepViewer(-1); else if (e.key === 'Escape') closeViewer();
});
$track.addEventListener('scroll', () => requestAnimationFrame(updCap), { passive: true });

/* ---------- routing ---------- */
function route() {
  if (!$viewer.hidden) closeViewer();
  if (!$sheet.hidden) { $sheet.hidden = true; S.sheet = null; document.body.style.overflow = ''; wantFull(false); }
  const hsh = location.hash;
  let m;
  if ((m = hsh.match(/^#deck-([a-z0-9]+)$/)) && CATS[m[1]]) {
    if (S.view !== 'deck' || S.cat !== m[1]) startDeck(m[1], false);
    S.view = 'deck'; window.scrollTo(0, 0); renderDeck(true);
  } else if (hsh === '#results') { const back = S.view === 'detail' && S.ret; S.view = 'results'; window.scrollTo(0, 0); renderResults(); if (back) restoreRow(S.ret); S.ret = null; }
  else if ((m = hsh.match(/^#h-(\d+)$/)) && S.byId[+m[1]]) { S.view = 'detail'; S.detail = +m[1]; S.photoIdx = 0; window.scrollTo(0, 0); renderDetail(); }
  else { S.view = 'home'; window.scrollTo(0, 0); renderHome(); }
  syncBack();
}
/* back from a house to the list: same place, and the row flashes grey for a moment */
function restoreRow(r) {
  const row = $app.querySelector(`.rk[data-id="${r.id}"]`);
  if (!row) { window.scrollTo(0, r.y); return; }
  const top = Math.min(Math.max(r.top, 70), window.innerHeight - row.offsetHeight - 20);
  window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - top);
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  row.addEventListener('animationend', () => row.classList.remove('flash'), { once: true });
}
function syncBack() {
  if (!tg || !tg.BackButton) return;
  if (S.view !== 'home' || !$viewer.hidden || !$sheet.hidden) tg.BackButton.show(); else tg.BackButton.hide();
}
function goBack() { if (!$viewer.hidden) { closeViewer(); return; } if (!$sheet.hidden) { closeSheet(); return; } if (S.view === 'home') return; history.back(); }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  const h = S.byId[S.sheet || (S.view === 'deck' ? S.cur : S.detail)];
  switch (a) {
    case 'cat': haptic(); if (el.dataset.replace) location.replace('#deck-' + el.dataset.k); else location.hash = 'deck-' + el.dataset.k; return;
    case 'results': haptic(); if (el.dataset.k) { S.rcat = el.dataset.k; S.showRest = false; store.set('krit_rcat', S.rcat); } location.hash = 'results'; return;
    case 'home': haptic(); if (history.length > 1) history.back(); else location.replace('#'); return;
    case 'replay': startDeck(S.cat, true); window.scrollTo(0, 0); renderDeck(true); return;
    case 'vote': cast(+el.dataset.v); return;
    case 'undo': undo(); return;
    case 'clear': if (S.detail) dropVote(S.detail).then(() => { toast('Оценка убрана'); renderDetail(); }); return;
    case 'savecom': if (S.detail && myVote(S.detail)) cast(myVote(S.detail).vote); return;
    case 'sheet': if (h) openSheet(h); return;
    case 'sheet-close': closeSheet(); return;
    case 'sheet-jump': { const s = document.getElementById('sg-' + el.dataset.k), b = document.getElementById('sheet-body'); if (s && b) b.scrollTo({ top: s.offsetTop - 8, behavior: 'smooth' }); haptic(); return; }
    case 'gphoto': openViewer(h, +el.dataset.i); return;
    case 'viewer-close': closeViewer(); return;
    case 'vprev': stepViewer(-1); return;
    case 'vnext': stepViewer(1); return;
    case 'map': if (h && h.map) openLink(h.map); return;
    case 'listing': if (h) openLink(h.link); return;
    case 'open': S.ret = S.view === 'results' ? { id: +el.dataset.id, top: el.getBoundingClientRect().top, y: window.scrollY } : null; location.hash = 'h-' + el.dataset.id; return;
    case 'rcat': S.rcat = el.dataset.k; S.showRest = false; store.set('krit_rcat', S.rcat); haptic(); renderResults(); return;
    case 'rest': S.showRest = true; renderResults(); return;
  }
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
let vbarObs;
function watchBar() {
  if (vbarObs) return;
  const sentinel = document.createElement('div'); sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px'; document.body.prepend(sentinel);
  vbarObs = new IntersectionObserver(([en]) => { const b = document.getElementById('vbar'); if (b) b.classList.toggle('scrolled', !en.isIntersecting); });
  vbarObs.observe(sentinel);
}
async function refresh() {
  try {
    if (!(await loadVotes())) return;
    if (S.view === 'results') { const y = window.scrollY; renderResults(); window.scrollTo(0, y); }
    else if (S.view === 'home') renderHome();
  } catch (e) { /* offline: keep old data */ }
}

/* ---------- boot ---------- */
async function boot() {
  try { history.scrollRestoration = 'manual'; } catch (e) { /* not supported */ }
  if (tg) {
    try { tg.ready(); tg.expand(); if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) { /* old client */ }
    tg.BackButton && tg.BackButton.onClick(goBack);
  }
  paintChrome(); watchBar();
  try { const r = await fetch('data/houses.json?v=4'); S.houses = await r.json(); S.houses.forEach(h => { S.byId[h.id] = h; }); }
  catch (e) { $app.innerHTML = `<div class="pad done"><h1>Не загрузился список домов</h1><p>Закрой приложение и открой ещё раз.</p></div>`; return; }
  try { await loadVotes(); } catch (e) { toast('Оценки пока не загрузились, попробую ещё раз'); }
  if (/^#(deck-|h-|results)/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  route();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000);
}
boot();
})();
