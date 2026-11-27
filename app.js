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
  all: { title: 'Все дома', short: 'Все дома', sub: 'Без отбора' },
  tr: { title: 'Турция по фильтрам', short: 'Турция', sub: 'Виллы по твоим фильтрам' },
  trall: { title: 'Турция', short: 'Турция', sub: 'Все виллы в Турции' }
};
const CAT_KEYS = ['top', 'near', 'far', 'p1', 'p2', 'p3', 'all', 'trall'];
const isTr = h => h.country === 'tr';
/* Turkey filters: what the filter window can choose, and the defaults (nothing chosen = no limit) */
const TRF0 = { reg: [], walk: 0, beach: [], white: false, pool: 'any', grill: 'any', jac: false, cl: 0, price: 0, sort: 'cl' };
const TR_SEAS = [['Средиземное море', 'med'], ['Эгейское море', 'aeg']];
const TR_BEACH = [['sand', 'Песок'], ['mix', 'Песок и галька'], ['pebble', 'Галька']];
const TR_SORT = [['cl', 'Оценка Claude'], ['price', 'Дешевле'], ['walk', 'Ближе к морю'], ['water', 'Вода теплее']];
function trMatch(h, f) {
  f = f || S.trf;
  if (f.reg.length && !f.reg.includes(h.reg)) return false;
  if (f.walk && h.walk.min > f.walk) return false;
  if (f.beach.length && !f.beach.includes(h.btype)) return false;
  if (f.white && !h.white) return false;
  if (f.pool === 'own' && h.am.pool !== 'own') return false;
  if (f.grill === 'coal' && h.am.grill !== 'coal') return false;
  if (f.jac && h.am.jac === 'no') return false;
  if (f.cl && !(h.cl && h.cl.s >= f.cl)) return false;
  if (f.price && h.price > f.price) return false;
  return true;
}
function trSort(list, how) {
  const by = {
    cl: (a, b) => (b.cl ? b.cl.s : 0) - (a.cl ? a.cl.s : 0) || a.price - b.price,
    price: (a, b) => a.price - b.price,
    walk: (a, b) => a.walk.min - b.walk.min || a.price - b.price,
    water: (a, b) => b.water - a.water || (b.cl ? b.cl.s : 0) - (a.cl ? a.cl.s : 0)
  }[how] || (() => 0);
  return list.slice().sort((a, b) => by(a, b) || a.id - b.id);
}
const trActive = f => (f.reg.length ? 1 : 0) + (f.walk ? 1 : 0) + (f.beach.length ? 1 : 0) + (f.white ? 1 : 0) + (f.pool !== 'any' ? 1 : 0) + (f.grill !== 'any' ? 1 : 0) + (f.jac ? 1 : 0) + (f.cl ? 1 : 0) + (f.price ? 1 : 0);
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
const S = { houses: [], byId: {}, votes: [], sig: '', view: 'home', cat: 'near', rcat: store.get('krit_rcat', 'near'), rq: '',
  queue: [], cur: null, hist: [], replay: false, detail: null, photoIdx: 0, showRest: false, full: {}, sheet: null,
  trf: Object.assign({}, TRF0, store.get('krit_trf', {})), fdraft: null, trSeen: false };

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
/* Turkey: all photos of all villas sit in one file, loaded the first time a Turkish villa is opened */
let trPh = null;
const loadTrPhotos = () => trPh || (trPh = fetch('data/turkey-photos.json?v=1').then(r => r.json()).catch(() => { trPh = null; return {}; }));
function ensureFull(id) {
  if (S.full[id] || fullReq[id]) return fullReq[id] || Promise.resolve(false);
  if (S.byId[id] && isTr(S.byId[id])) {
    fullReq[id] = loadTrPhotos().then(m => { if (!m[id] || !m[id].length) return false; S.full[id] = m[id]; return true; });
    return fullReq[id];
  }
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
  if (isTr(h)) return c === 'trall' || (c === 'tr' && trMatch(h));
  if (c === 'tr' || c === 'trall') return false;
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
  if (cat === 'tr') return trSort(housesIn('tr'), S.trf.sort).map(h => h.id);
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
  if (a.grill === 'coal') have.push(['fire', 'Гриль на углях', a.grillTxt || 'как мангал']);
  else if (a.grill === 'grill') have.push(['fire', 'Гриль', a.grillTxt || 'для барбекю']);
  else if (a.grill === 'bbq') have.push(['fire', 'Барбекю', a.grillTxt || 'есть всё нужное']);
  else miss.push('гриль');
  if (isTr(h)) return { have, miss };
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
  const env = h.env || {};
  if (h.white && h.white.walk) a.push(['', 'sun-fill', 'Белый песок у дома']);
  if (/песок/.test(h.beachType) && !/галька/.test(h.beachType)) a.push(['', 'sun', 'Песчаный пляж']);
  if (h.water) a.push(['', 'thermometer', `Вода в июне около ${String(h.water).replace('.', ',')} °C`]);
  if (h.cl && h.cl.s >= 8) a.push(['', 'sparkle-fill', 'Свежий ремонт по фото']);
  if (env.k === 'Зелёное') a.push(['', 'leaf', 'Много зелени вокруг']);
  if (am.garden === 'garden') a.push(['', 'tree', 'Свой сад']);
  if (am.pool === 'own') a.push(['', 'swimming-pool', 'Свой бассейн']);
  if (am.grill === 'coal') a.push(['', 'fire', 'Гриль на углях']);
  if (am.extra.includes('подогрев бассейна')) a.push(['', 'thermometer-hot', 'Бассейн с подогревом']);
  if (am.extra.includes('частный пляж/выход к морю')) a.push(['', 'umbrella-simple', 'Свой выход к морю']);
  const air = airOf(h)[0];
  if (air && air.t <= 30) a.push(['', 'airplane-tilt', `Аэропорт в ${air.t} мин`]);
  const shop = h.shops && h.shops.length ? Math.min(...h.shops.map(s => s.d || 1e9)) : 1e9;
  if (shop <= 500) a.push(['', 'shopping-cart', `Магазин в ${Math.round(shop / 10) * 10} м`]);
  if (h.cafes && h.cafes.tav >= 5) a.push(['', 'fork-knife', `${isTr(h) ? 'Рестораны' : 'Таверны'} рядом: ${h.cafes.tav}`]);
  if (/трасс/i.test(env.t || '')) a.push(['warn', 'warning', 'Рядом трасса']);
  if (env.k === 'Мало зелени') a.push(['warn', 'mountains', 'Мало зелени вокруг']);
  if (isTr(h) && h.btype === 'pebble') a.push(['warn', 'mountains', 'Пляж галечный']);
  if (isTr(h) && h.cl && h.cl.s <= 4) a.push(['warn', 'warning', 'Старый ремонт по фото']);
  if (am.pool === 'shared') a.push(['warn', 'users', 'Бассейн общий']);
  if (am.pool === 'no') a.push(['warn', 'warning', 'Нет бассейна']);
  if (am.grill === 'no') a.push(['warn', 'fire', 'Нет гриля']);
  else if (am.grill !== 'grill' && am.grill !== 'bbq' && am.grill !== 'coal') a.push(['warn', 'fire', 'Про гриль ничего не сказано']);
  if (/камни|скал/.test(h.beachType)) a.push(['warn', 'mountains', 'Пляж каменистый']);
  if (h.seaM != null && h.seaM <= 300 && h.walk.min > 20 && !h.walk.cross) a.push(['warn', 'waves', 'Море рядом, но пляжа у дома нет']);
  if (h.cancel && h.cancel.k !== 'free') a.push(['warn', 'warning', CANCEL[h.cancel.k]]);
  if (!h.near) a.push(['warn', 'car', w.drive ? `До моря на машине ${w.drive} мин` : 'К морю на машине']);
  if (shop > 1500 && shop < 1e9) a.push(['warn', 'shopping-cart', 'Магазин далеко']);
  return a;
}
const beachName = h => h.walk.to === 'sea' ? 'моря' : h.beach ? 'пляжа ' + h.beach : 'пляжа';
/* airports by car, nearest first: Crete has two fixed ones, Turkey lists its own */
const AIR_GEN = { 'Ираклион': 'Ираклиона', 'Ханья': 'Ханьи', 'Анталья': 'Антальи', 'Газипаша': 'Газипаши', 'Даламан': 'Даламана', 'Бодрум': 'Бодрума', 'Измир': 'Измира' };
const airOf = h => h.air ? h.air : [{ n: 'Ираклион', t: h.her }, { n: 'Ханья', t: h.cha }].sort((a, b) => a.t - b.t);

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
/* home: choose the country first */
function trCover() {
  if (S.trCover) return S.trCover;
  const list = S.houses.filter(h => isTr(h) && h.plat === 'Airbnb' && h.cl && h.cl.s >= 9 && h.photos.length);
  const h = list[0] || S.houses.find(h => isTr(h) && h.photos.length);
  return (S.trCover = h ? h.photos[0] : '');
}
function renderHome() {
  const people = new Set(S.votes.map(v => v.user_id)).size;
  const cr = S.houses.filter(h => !isTr(h)), trl = S.houses.filter(isTr);
  const prog = list => {
    const n = list.length, mine = me ? list.filter(h => myVote(h.id)).length : 0;
    const txt = !me || !mine ? `${n} ${plural(n, 'дом', 'дома', 'домов')}` : mine >= n ? `${ic('check-bold', 's')}всё оценено` : `оценено ${mine} из ${n}`;
    return { txt, bar: me && mine ? `<span class="tl-bar"><i style="width:${Math.round(mine / n * 100)}%"></i></span>` : '', done: me && mine >= n };
  };
  const tile = (k, title, sub, cover, list) => {
    const x = prog(list);
    return `<button type="button" class="tl tlp wide country" data-act="country" data-k="${k}">
      ${img(cover, 'f', '', 'loading="eager"')}
      <span class="tl-b">
        <span class="tl-t">${title}</span>
        <span class="tl-s">${sub}</span>
        <span class="tl-m ${x.done ? 'ok' : ''}">${x.txt}</span>${x.bar}
      </span>
    </button>`;
  };
  $app.innerHTML = `<main class="pad">
    <div class="home-top">
      <div class="who">${me ? ava(me) + `<b>Привет, ${esc(me.name.split(' ')[0])}</b>` : ''}</div>
      <button type="button" class="pill-btn" data-act="results">${ic('trophy')}Итоги</button>
    </div>
    <header class="home-hd"><p>12-25 июня 2027, ${C.people} человек</p><h1>Куда едем?</h1></header>
    <div class="tiles">
      ${tile('crete', 'Крит', 'Греция, Средиземное море', covers().top, cr)}
      ${tile('turkey', 'Турция', 'Эгейское и Средиземное море, фильтры по региону, пляжу и ремонту', trCover(), trl)}
    </div>
    <button type="button" class="row-link" data-act="results"><span class="ic">${ic('trophy', 'l')}</span><div><b>Итоги голосования</b><small>${people ? `Голосуют ${people} ${plural(people, 'человек', 'человека', 'человек')}` : 'Пока никто не голосовал'}</small></div>${ic('caret-right')}</button>
    ${me ? '' : `<div class="note-tg">Голосовать можно только из Telegram: открой бота @${esc(C.bot)}. Здесь можно просто посмотреть дома.</div>`}
  </main>`;
}
function renderCrete() {
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
    <button type="button" class="back-l" data-act="home">${ic('caret-left-bold', 's')}Страны</button>
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

/* ---------- Turkey: list of villas and the filter window ---------- */
const clCls = s => s >= 8 ? 'hi' : s >= 6 ? 'mid' : 'lo';
const fmtW = w => String(w).replace('.', ',');
function trScoreSec(h) {
  const rows = [];
  if (h.cl) rows.push(`<div class="li"><span class="ic b">${ic('sparkle-fill')}</span><div class="t">Оценка Claude: ремонт и цена<small>${esc(cap(h.cl.t))}</small></div><span class="v clv ${clCls(h.cl.s)}">${h.cl.s}<small>/10</small></span></div>`);
  if (h.fam != null) rows.push(`<div class="li"><span class="ic b">${ic('users')}</span><div class="t">Оценка семьи<small>из таблицы</small></div><span class="v">${h.fam}</span></div>`);
  if (h.host) rows.push(`<div class="li"><span class="ic">${ic('chat-circle')}</span><div class="t">Хозяин пишет<small>${esc(h.host)}</small></div></div>`);
  return rows.length ? `<section class="sec"><h2>Ремонт и оценки</h2><div class="list">${rows.join('')}</div></section>` : '';
}
function trItem(h) {
  const t = tally(h.id), mv = myVote(h.id);
  return `<button type="button" class="trk" data-act="open" data-id="${h.id}">
    <span class="th">${img(heroOf(h), 't')}${h.cl ? `<span class="clb ${clCls(h.cl.s)}">${ic('sparkle-fill', 's')}${h.cl.s}</span>` : ''}</span>
    <span class="b">
      <b>${esc(h.name)}</b>
      <small>${esc(h.city)} · ${tm(h.walk.min)} до пляжа · ${esc(h.beachType)}</small>
      <span class="pr">${nf(h.price)} € <small>${h.am.pool === 'own' ? 'свой бассейн' : h.am.pool === 'shared' ? 'общий бассейн' : 'бассейн'} · вода ${fmtW(h.water)} °C${h.white ? ' · белый песок' : ''}</small></span>
      ${t.all || mv ? `<span class="cnt">${mv ? `<span class="tag ${VOTE[mv.vote].k}">${ic(VOTE[mv.vote].icon, 's')}ты</span>` : ''}${t.all ? `<span class="yes">${ic('heart-fill', 's')}${t.yes}</span><span class="mb">${ic('question-bold', 's')}${t.mb}</span><span class="no">${ic('x-bold', 's')}${t.no}</span>` : ''}</span>` : ''}
    </span>
  </button>`;
}
function fSummary(f) {
  const out = [];
  if (f.reg.length) out.push(f.reg.length <= 2 ? f.reg.join(', ') : `${f.reg.length} ${plural(f.reg.length, 'регион', 'региона', 'регионов')}`);
  if (f.walk) out.push(`до ${f.walk} мин до моря`);
  if (f.beach.length) out.push(f.beach.map(b => TR_BEACH.find(x => x[0] === b)[1].toLowerCase()).join(', '));
  if (f.white) out.push('белый песок');
  if (f.pool === 'own') out.push('свой бассейн');
  if (f.grill === 'coal') out.push('гриль на углях');
  if (f.jac) out.push('джакузи');
  if (f.cl) out.push(`оценка Claude ${f.cl}+`);
  if (f.price) out.push(`до ${f.price / 1000} тыс. €`);
  return out;
}
function renderTurkey() {
  const all = S.houses.filter(isTr);
  const list = trSort(housesIn('tr'), S.trf.sort);
  const left = me ? list.filter(h => !myVote(h.id)).length : list.length;
  const sum = fSummary(S.trf), act = trActive(S.trf);
  $app.innerHTML = `<main class="pad">
    <div class="home-top">
      <button type="button" class="back-l" data-act="home">${ic('caret-left-bold', 's')}Страны</button>
      <button type="button" class="pill-btn" data-act="results" data-k="trall">${ic('trophy')}Итоги</button>
    </div>
    <header class="home-hd"><p>Турция, 12-25 июня 2027, ${C.people} человек</p><h1>Виллы в Турции</h1></header>
    <button type="button" class="fbar" data-act="f-open">
      <span class="ic">${ic(act ? 'funnel-fill' : 'funnel', 'l')}</span>
      <span class="b"><b>Фильтры${act ? ` <i>${act}</i>` : ''}</b><small>${sum.length ? esc(sum.join(' · ')) : 'Регион, пляж, бассейн, гриль, оценка'}</small></span>
      <span class="n">${list.length}<small>из ${all.length}</small></span>
    </button>
    <div class="sortrow">${TR_SORT.map(([k, l]) => `<button type="button" data-act="trsort" data-k="${k}" aria-pressed="${S.trf.sort === k}">${esc(l)}</button>`).join('')}</div>
    ${list.length ? `<button type="button" class="btn pri full go" data-act="cat" data-k="tr" ${left ? '' : 'disabled'}>${ic('hand-swipe-right')}${left ? `Оценивать подряд · ${left}` : 'Все виллы по фильтру оценены'}</button>` : ''}
    <div class="rlist">${list.length ? list.map(trItem).join('') : `<div class="empty">По этим фильтрам вилл нет.<br><button type="button" class="btn" style="margin-top:12px" data-act="f-reset-all">Сбросить фильтры</button></div>`}</div>
  </main>`;
}
/* filter window: changes go to a draft, the list updates when you press «Показать» */
const $fs = () => document.getElementById('fsheet');
function fCount(f) { return S.houses.filter(h => isTr(h) && trMatch(h, f)).length; }
function renderFilters() {
  const f = S.fdraft, all = S.houses.filter(isTr);
  const without = k => Object.assign({}, f, { [k]: TRF0[k] });
  const regCount = r => all.filter(h => h.reg === r && trMatch(h, without('reg'))).length;
  const chip = (fld, v, label, n, on) => `<button type="button" class="fchip" data-act="f-set" data-f="${fld}" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}${n != null ? `<small>${n}</small>` : ''}</button>`;
  const seg = (fld, opts) => `<div class="fseg">${opts.map(([v, l]) => `<button type="button" data-act="f-set" data-f="${fld}" data-v="${v}" aria-pressed="${String(f[fld]) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  const regs = TR_SEAS.map(([title, sea]) => {
    const rs = [...new Set(all.filter(h => h.sea === sea).map(h => h.reg))].sort((a, b) => all.filter(h => h.reg === b).length - all.filter(h => h.reg === a).length);
    return `<p class="fsub">${ic('waves', 's')}${title}</p><div class="fchips">${rs.map(r => chip('reg', r, r, regCount(r), f.reg.includes(r))).join('')}</div>`;
  }).join('');
  const nWhite = all.filter(h => h.white && trMatch(h, without('white'))).length;
  const n = fCount(f);
  document.getElementById('fs-body').innerHTML = `
    <section class="fgrp"><h3>${ic('map-pin-area')}Регион</h3>${regs}</section>
    <section class="fgrp"><h3>${ic('footprints')}До моря пешком</h3>${seg('walk', [[0, 'Любое'], [5, 'до 5 мин'], [10, 'до 10 мин'], [15, 'до 15 мин']])}<p class="fhint">Во всех виллах пляж не дальше 20 минут пешком.</p></section>
    <section class="fgrp"><h3>${ic('umbrella-simple')}Пляж</h3><div class="fchips">${TR_BEACH.map(([k, l]) => chip('beach', k, l, all.filter(h => h.btype === k && trMatch(h, without('beach'))).length, f.beach.includes(k))).join('')}</div>
      <button type="button" class="ftog" data-act="f-set" data-f="white" data-v="1" aria-pressed="${f.white}"><span class="sw"></span><span><b>Только белый песок</b><small>Ылыджа в Чешме, вилл: ${nWhite}</small></span></button></section>
    <section class="fgrp"><h3>${ic('swimming-pool')}Бассейн</h3>${seg('pool', [['any', 'Любой'], ['own', 'Только свой']])}</section>
    <section class="fgrp"><h3>${ic('fire')}Гриль</h3>${seg('grill', [['any', 'Любой'], ['coal', 'На углях, как мангал']])}<p class="fhint">Гриль есть во всех виллах. «На углях» хозяин указал сам, у остальных тип не указан.</p></section>
    <section class="fgrp"><h3>${ic('sparkle-fill')}Оценка Claude: ремонт и цена</h3>${seg('cl', [[0, 'Любая'], [5, '5+'], [6, '6+'], [7, '7+'], [8, '8+'], [9, '9']])}<p class="fhint">По фото: свежий светлый ремонт, просторные спальни и красивые ванные, с учётом цены.</p></section>
    <section class="fgrp"><h3>${ic('wallet')}Цена за ${C.nights} ночей</h3>${seg('price', [[0, 'Любая'], [3000, 'до 3 тыс. €'], [4000, 'до 4 тыс. €'], [5000, 'до 5 тыс. €']])}</section>
    <section class="fgrp"><h3>${ic('bathtub')}Ещё</h3><button type="button" class="ftog" data-act="f-set" data-f="jac" data-v="1" aria-pressed="${f.jac}"><span class="sw"></span><span><b>Есть джакузи</b><small>в доме или во дворе</small></span></button></section>
    <section class="fgrp"><h3>${ic('sort-descending')}Сортировка</h3>${seg('sort', TR_SORT)}</section>`;
  const go = document.getElementById('fs-go');
  go.innerHTML = n ? `Показать ${n} ${plural(n, 'виллу', 'виллы', 'вилл')}` : 'Ничего не найдено';
  go.disabled = !n;
  document.getElementById('fs-reset').hidden = !trActive(f);
}
function openFilters() {
  S.fdraft = JSON.parse(JSON.stringify(S.trf));
  document.getElementById('fs-x').innerHTML = ic('x-bold', 'l');
  renderFilters();
  const el = $fs(); el.hidden = false; el.classList.remove('out'); document.body.style.overflow = 'hidden';
  document.getElementById('fs-body').scrollTop = 0;
  syncBack(); haptic();
}
function closeFilters() {
  const el = $fs(); if (!el || el.hidden) return;
  el.classList.add('out');
  setTimeout(() => { el.hidden = true; el.classList.remove('out'); S.fdraft = null; document.body.style.overflow = ''; syncBack(); }, 220);
}
function setFilter(fld, v) {
  const f = S.fdraft;
  if (fld === 'reg' || fld === 'beach') { const i = f[fld].indexOf(v); if (i >= 0) f[fld].splice(i, 1); else f[fld].push(v); }
  else if (fld === 'white' || fld === 'jac') f[fld] = !f[fld];
  else if (fld === 'walk' || fld === 'cl' || fld === 'price') f[fld] = +v;
  else f[fld] = v;
  const y = document.getElementById('fs-body').scrollTop; renderFilters(); document.getElementById('fs-body').scrollTop = y; haptic();
}
function applyFilters() {
  S.trf = S.fdraft; store.set('krit_trf', S.trf); closeFilters();
  if (S.view === 'turkey') { window.scrollTo(0, 0); renderTurkey(); }
}

/* ---------- render: house (deck card or detail) ---------- */
function voteBar(h, mode) {
  const mv = myVote(h.id);
  const b = v => `<button type="button" class="vb ${VOTE[v].k} ${mv && mv.vote === +v ? 'on' : ''}" data-act="vote" data-v="${v}" ${me ? '' : 'disabled'}>${ic(VOTE[v].icon)}${VOTE[v].label}</button>`;
  let meta;
  if (mode === 'deck') {
    const total = housesIn(S.cat).length, done = myCount(S.cat);
    const pct = Math.round(done / total * 100), from = S.lastPct != null && S.lastCat === S.cat ? S.lastPct : pct;
    S.lastPct = pct; S.lastCat = S.cat;
    meta = `<div class="vmeta">${S.hist.length ? `<button type="button" class="mini ico" data-act="undo" aria-label="Вернуться к прошлому дому">${ic('arrow-counter-clockwise-bold', 's')}</button>` : ''}<span class="cnt-t ${from !== pct ? 'bump' : ''}">${done} из ${total}</span><span class="sp"></span>${tools(h)}</div><div class="prog"><i id="progbar" style="width:${from}%" data-to="${pct}"></i></div>`;
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
  const airs = airOf(h), air = airs[0] || { n: '', t: null };
  const photos = photosOf(h);
  const rt = h.rating;
  const t = tally(h.id);
  const tr = isTr(h);

  const shopRows = (h.shops || []).map(s => `<div class="li"><span class="ic">${ic(s.t.includes('рынок') ? 'storefront' : 'shopping-cart')}</span><div class="t">${esc(cap(s.t))}${s.n ? `<small>${esc(s.n)}</small>` : ''}</div><span class="v">${esc(s.ds)}</span></div>`).join('');
  const cafeRow = h.cafes && h.cafes.tav != null ? `<div class="li"><span class="ic">${ic('fork-knife')}</span><div class="t">${tr ? 'Рестораны' : 'Таверны и рестораны'}<small>в радиусе 1 км</small></div><span class="v">${h.cafes.tav}</span></div>
    <div class="li"><span class="ic">${ic('coffee')}</span><div class="t">Кафе и бары<small>в радиусе 1 км</small></div><span class="v">${h.cafes.caf}</span></div>
    ${h.cafes.near ? `<div class="li"><span class="ic">${ic('map-pin')}</span><div class="t">Ближайшее кафе или таверна</div><span class="v">${esc(h.cafes.near)}</span></div>` : ''}` : '';

  return `
  <div class="pad">
    <div class="ph">
      <div class="ph-track" id="phtrack">${slidesHtml(h, photos)}</div>
      <span class="ph-count" id="phcount">1 из ${photos.length}</span>
      ${whiteNear(h) ? `<span class="ph-white"><span class="em">${ic('sun-fill', 's')}</span><span><b>Белый песок</b><small>${esc(h.white.n)}, ${tm(h.white.t)} ${h.white.walk ? 'пешком' : 'на машине'}</small></span></span>` : ''}
      ${tr && h.cl ? `<span class="ph-cl s${h.cl.s >= 8 ? 'hi' : h.cl.s >= 6 ? 'mid' : 'lo'}">${ic('sparkle-fill', 's')}<b>${h.cl.s}</b><small>/10</small></span>` : ''}
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
      <div class="tile price ${h.cancel && h.cancel.k !== 'free' ? 'warn' : ''}"><span class="k">${ic('house', 's')}За ${C.nights} ночей</span>
        <span class="v">${nf(h.price)}\u00a0€</span>
        ${cancelLine(h)}</div>
      <div class="tile"><span class="k">${ic('airplane-tilt', 's')}Аэропорт</span>
        <span class="v">${tm(air.t)}</span>
        <span class="d">до ${esc(AIR_GEN[air.n] || air.n)} на машине</span></div>
      <div class="tile"><span class="k">${ic('waves', 's')}Пляж</span>
        <span class="v w">${esc(cap(h.beachType))}</span>
        <span class="d">${tr ? `вода около ${String(h.water).replace('.', ',')} °C` : 'море по прямой ' + esc(h.sea)}</span></div>
    </div>

    ${mode === 'detail' ? `<section class="sec"><h2>Как проголосовали</h2>${t.all ? `<div class="voters">${t.vs.slice().sort((a, b) => b.vote - a.vote).map(v => `<div class="vr">${ava(v)}<div class="w"><b>${esc(v.user_name)}</b>${v.comment ? `<p>${esc(v.comment)}</p>` : ''}</div><span class="tag ${VOTE[v.vote].k}">${ic(VOTE[v.vote].icon, 's')}${VOTE[v.vote].label}</span></div>`).join('')}</div>` : `<div class="empty">Пока никто не голосовал за этот дом</div>`}</section>` : ''}

    ${tr ? trScoreSec(h) : ''}

    <section class="sec"><h2>Что есть в доме</h2>
      <div class="amen">${A.have.map(([i, b, s]) => `<div class="am"><span class="ic">${ic(i, 'l')}</span><div><b>${esc(b)}</b><small>${esc(s)}</small></div></div>`).join('')}</div>
      ${A.miss.length ? `<p class="miss"><b>Нет или не указано:</b> ${A.miss.join(', ')}</p>` : ''}
    </section>

    ${acc.length ? `<section class="sec"><h2>Коротко о доме</h2><div class="chips">${acc.map(([c, i, tx]) => `<span class="chip ${c}">${ic(i)}${esc(tx)}</span>`).join('')}</div></section>` : ''}

    <section class="sec"><h2>Море и дорога</h2>
      <div class="list">
        <div class="li"><span class="ic b">${ic('footprints')}</span><div class="t">Пешком до ${esc(beachName(h))}<small>пешеходный маршрут по карте</small></div><span class="v">${h.walk.cross ? 'через дорогу' : tm(h.walk.min)}</span></div>
        ${h.walk.drive ? `<div class="li"><span class="ic b">${ic('car')}</span><div class="t">На машине до моря</div><span class="v">${tm(h.walk.drive)}</span></div>` : ''}
        ${h.sea && !tr ? `<div class="li"><span class="ic b">${ic('waves')}</span><div class="t">До моря по прямой</div><span class="v">${esc(h.sea)}</span></div>` : ''}
        ${tr ? `<div class="li"><span class="ic b">${ic('waves')}</span><div class="t">${esc(h.seaName)}<small>температура воды 12-25 июня</small></div><span class="v">${String(h.water).replace('.', ',')} °C</span></div>` : ''}
        ${airs.map(a => `<div class="li"><span class="ic b">${ic('airplane-tilt')}</span><div class="t">Аэропорт ${esc(a.n)}<small>на машине</small></div><span class="v">${tm(a.t)}</span></div>`).join('')}
        ${h.white ? `<div class="li"><span class="ic b">${ic('sun')}</span><div class="t">Белый песок: ${esc(h.white.n)}<small>${esc(h.white.note)}</small></div><span class="v">${tm(h.white.t)}${h.white.walk ? ' пешком' : h.white.port ? ' до порта' : ''}</span></div>` : ''}
      </div>
      ${h.beachEst ? `<p class="miss">Тип пляжа в картах не указан, он определён по району. Лучше проверить на фото.</p>` : ''}
      ${(h.beaches || []).length ? `<div class="sub">Другие пляжи рядом</div><div class="list">${h.beaches.map(b => `<div class="li"><span class="ic">${ic('umbrella-simple')}</span><div class="t">${esc(b.n)}<small>${esc(b.type)}</small></div><span class="v">${tm(b.walk)} пешком</span></div>`).join('')}</div>` : ''}
    </section>

    ${shopRows || cafeRow ? `<section class="sec"><h2>${tr ? 'Магазины и рестораны' : 'Магазины и таверны'}</h2><div class="list">${shopRows}${cafeRow}</div>${tr ? '<p class="miss">Расстояния по прямой, по данным OpenStreetMap.</p>' : ''}</section>` : ''}

    ${(h.sights || []).length ? `<section class="sec"><h2>Что посмотреть</h2><div class="list">${h.sights.map(s => `<div class="li"><span class="ic">${ic('binoculars')}</span><div class="t">${esc(s.n)}</div><span class="v">${tm(s.t)}</span></div>`).join('')}</div></section>` : ''}

    ${h.env && h.env.k ? `<section class="sec"><h2>Что вокруг дома</h2><div class="envbox"><span class="ic ${h.env.k === 'Зелёное' ? '' : 'warn'}">${ic(h.env.k === 'Зелёное' ? 'leaf' : 'mountains', 'l')}</span><div><b>${h.env.k === 'Зелёное' ? 'Зелёное место' : h.env.k === 'Средне' ? 'Зелени средне' : 'Мало зелени'}</b><p>${esc(cap(h.env.t))}</p></div></div></section>` : ''}

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
  const dir = typeof anim === 'string' ? ' from-' + anim : '';
  $app.innerHTML = voteBar(h, 'deck') + `<article class="card ${anim ? 'enter' + dir : ''}" id="card" data-id="${h.id}">${houseHtml(h, 'deck')}</article>`;
  bindCard(); preloadNext();
  const pb = document.getElementById('progbar');
  if (pb) requestAnimationFrame(() => requestAnimationFrame(() => { pb.style.width = pb.dataset.to + '%'; }));
  const id = h.id; ensureFull(id).then(ok => { if (ok) photosArrived(id); });
  if (S.queue[0]) ensureFull(S.queue[0]);
}
function renderDetail() {
  const h = S.byId[S.detail]; if (!h) { history.back(); return; }
  const zoom = S.zoomIn; S.zoomIn = false;
  $app.innerHTML = voteBar(h, 'detail') + `<article class="card ${zoom ? 'zoom-in' : ''}" id="card">${houseHtml(h, 'detail')}</article>`;
  bindCard();
  const id = h.id; ensureFull(id).then(ok => { if (ok) photosArrived(id); });
}
function renderDone() {
  const total = housesIn(S.cat).length;
  const trc = S.cat === 'tr';
  const left = leftIn(trc ? 'trall' : 'all');
  $app.innerHTML = `<main class="pad done">
    <span class="ic">${ic('check-circle-fill', 'xl')}</span>
    <h1>${trc ? `Все ${total} ${plural(total, 'вилла', 'виллы', 'вилл')} по твоим фильтрам оценены` : `Все ${total} ${plural(total, 'дом', 'дома', 'домов')} в категории «${CATS[S.cat].title}» оценены`}</h1>
    <p>${trc ? (left ? `В Турции ещё не оценено ${left} ${plural(left, 'вилла', 'виллы', 'вилл')}. Поменяй фильтры, чтобы увидеть другие.` : 'Ты оценил все виллы в Турции.') : left ? `Ещё не оценено ${left} ${plural(left, 'дом', 'дома', 'домов')} в других категориях. Посмотри итоги или выбери другую категорию.` : 'Ты оценил все дома. Посмотри, что выбрали остальные.'}</p>
    <div class="btns">
      <button type="button" class="btn pri" data-act="results" data-k="${trc ? 'trall' : S.cat}">${ic('trophy')}Итоги</button>
      ${left || trc ? `<button type="button" class="btn" data-act="home">${ic(trc ? 'funnel' : 'squares-four')}${trc ? 'К списку вилл' : 'Другие категории'}</button>` : ''}
      <button type="button" class="btn" data-act="replay">${ic('arrows-clockwise')}Пересмотреть мои оценки</button>
    </div>
  </main>`;
}
function preloadNext() { const n = S.queue[0]; if (!n) return; const h = S.byId[n]; const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = psrc(photosOf(h)[0], 'm'); }

/* ---------- render: results ---------- */
/* search by name or place: Russian letters are transliterated, so "вилла" finds "Villa" and "ханья" finds "Chania" */
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'iu', я: 'ia' };
const plainText = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
const skel = s => plainText(s).replace(/[а-я]/g, c => TRANSLIT[c] ?? c)
  .replace(/ph/g, 'f').replace(/th/g, 't').replace(/[cq]/g, 'k').replace(/x/g, 'ks').replace(/kh/g, 'h').replace(/[yj]/g, 'i').replace(/w/g, 'v')
  .replace(/[^a-z0-9]+/g, ' ').replace(/([a-z])\1+/g, '$1').trim();
function matchesQuery(h, q) {
  const hay = `${h.name} ${h.city} ${h.beach || ''}`;
  if (plainText(hay).includes(plainText(q).trim())) return true;
  /* fuzzy match only on words of 2+ letters, so a single stray letter does not light up half the list */
  const sk = skel(hay), words = skel(q).split(' ').filter(w => w.length >= 2);
  return words.length > 0 && words.every(w => sk.includes(w));
}
const byScore = (a, b) => b.t.score - a.t.score || b.t.yes - a.t.yes || a.t.no - b.t.no || b.t.all - a.t.all || a.h.id - b.h.id;
function resultItem({ h, t }, i) {
  return `<button type="button" class="rk" data-act="open" data-id="${h.id}">
      <span class="n ${i < 3 && t.score > 0 ? 'top' : ''}">${i === 0 && t.score > 0 ? ic('crown-fill', 'l') : i + 1}</span>
      <span class="th">${img(heroOf(h), 't')}</span>
      <span class="b"><b>${esc(h.name)}</b><small>${h.walk.cross ? 'пляж через дорогу' : tm(h.walk.min) + (h.walk.to === 'sea' ? ' до моря' : ' до пляжа')}, ${nf(h.price)}\u00a0€</small>
        ${t.all ? `<span class="cnt"><span class="yes">${ic('heart-fill', 's')}${t.yes}</span><span class="mb">${ic('question-bold', 's')}${t.mb}</span><span class="no">${ic('x-bold', 's')}${t.no}</span><span class="sc">${t.score > 0 ? '+' : ''}${t.score}</span></span>` : `<small>Голосов пока нет</small>`}
      </span>
      ${t.all ? `<span class="vs">${t.vs.slice().sort((a, b) => b.vote - a.vote).map(v => `<span class="tag ${VOTE[v.vote].k}">${ic(VOTE[v.vote].icon, 's')}${esc(v.user_name.split(' ')[0])}</span>`).join('')}</span>` : ''}
    </button>`;
}
/* the list under the search box: a category ranking, or search hits across all houses with their overall place */
function resultsBody() {
  const q = (S.rq || '').trim();
  if (q) {
    const all = S.houses.map(h => ({ h, t: tally(h.id) })).sort(byScore);
    const hits = all.map((x, i) => [x, i]).filter(([x]) => matchesQuery(x.h, q));
    if (!hits.length) return `<div class="empty rnone">${ic('magnifying-glass', 'l')}<b>Ничего не нашлось</b><span>По запросу «${esc(q)}» домов нет. Проверь название или попробуй часть слова.</span></div>`;
    return `<p class="rnote">Найдено ${hits.length} ${plural(hits.length, 'дом', 'дома', 'домов')} среди всех ${S.houses.length}. Номер слева: место дома в общем рейтинге.</p>
      <div class="rlist">${hits.map(([x, i]) => resultItem(x, i)).join('')}</div>`;
  }
  const list = housesIn(CATS[S.rcat] ? S.rcat : 'near').map(h => ({ h, t: tally(h.id) })).sort(byScore);
  const voted = list.filter(x => x.t.all), rest = list.filter(x => !x.t.all);
  return `<div class="rlist">
      ${voted.length ? voted.map(resultItem).join('') : `<div class="empty">В этой категории ещё никто не голосовал</div>`}
    </div>
    ${rest.length ? (S.showRest ? `<div class="rlist">${rest.map((x, i) => resultItem(x, voted.length + i)).join('')}</div>` : `<button type="button" class="btn full more" style="width:100%" data-act="rest">Дома без голосов: ${rest.length}</button>`) : ''}`;
}
function renderResults() {
  const ppl = {}; S.votes.forEach(v => { (ppl[v.user_id] = ppl[v.user_id] || { u: v, n: 0 }).n++; });
  const people = Object.values(ppl).sort((a, b) => b.n - a.n);
  const q = S.rq || '';
  $app.innerHTML = `<main class="pad">
    <header class="rh"><h1>Итоги</h1><p>Место дома: сколько «нравится» минус сколько «не нравится».</p></header>
    <label class="rsearch">${ic('magnifying-glass')}<input id="rq" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Найти дом по названию или месту" aria-label="Поиск дома по названию или месту" value="${esc(q)}"><button type="button" class="rclr" data-act="rqclear" aria-label="Очистить поиск" ${q ? '' : 'hidden'}>${ic('x-bold', 's')}</button></label>
    <div class="rchips ${q.trim() ? 'off' : ''}">
      ${CAT_KEYS.map(k => `<button type="button" data-act="rcat" data-k="${k}" aria-pressed="${!q.trim() && S.rcat === k}">${k === 'top' ? ic('crown-fill', 's') : ''}${CATS[k].short}</button>`).join('')}
    </div>
    ${people.length ? `<div class="ppl">${people.map(p => `<span>${ava(p.u, 's')}${esc(p.u.user_name)} <small>${p.n}</small></span>`).join('')}</div>` : ''}
    <div id="rres">${resultsBody()}</div>
  </main>`;
}
function onSearch(v) {
  S.rq = v;
  const box = document.getElementById('rres'); if (box) box.innerHTML = resultsBody();
  const clr = $app.querySelector('.rclr'); if (clr) clr.hidden = !v;
  const chips = $app.querySelector('.rchips');
  if (chips) { chips.classList.toggle('off', !!v.trim()); chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(!v.trim() && S.rcat === b.dataset.k))); }
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

/* vote feedback: the pressed button pops, a stamp shows over the card, then the next house slides in */
function markChoice(v) {
  const box = document.querySelector('.vbtns'); if (!box) return;
  box.classList.add('chosen');
  box.querySelectorAll('.vb').forEach(b => { const on = +b.dataset.v === v; b.classList.toggle('on', on); b.classList.remove('pop'); if (on) { void b.offsetWidth; b.classList.add('pop'); } });
}
function stamp(v) {
  const k = VOTE[v].k;
  const el = document.createElement('div');
  el.className = 'stamp ' + k;
  el.innerHTML = `<span class="disc">${ic(VOTE[v].icon)}</span><b>${VOTE[v].label}</b>`;
  document.body.appendChild(el);
  if (v === 1) {
    for (let n = 0; n < 9; n++) {
      const a = (n / 9) * Math.PI * 2 + Math.random() * 0.5, r = 90 + Math.random() * 60;
      const sp = document.createElement('span');
      sp.className = 'spark';
      sp.style.setProperty('--dx', Math.round(Math.cos(a) * r) + 'px');
      sp.style.setProperty('--dy', Math.round(Math.sin(a) * r) + 'px');
      sp.style.setProperty('--s', (0.6 + Math.random() * 0.6).toFixed(2));
      sp.style.animationDelay = Math.round(80 + Math.random() * 90) + 'ms';
      sp.innerHTML = ic('heart-fill');
      document.body.appendChild(sp);
      setTimeout(() => sp.remove(), 1100);
    }
  }
  setTimeout(() => el.remove(), 1000);
}
async function cast(v) {
  if (!me) { toast('Голосовать можно только из Telegram'); return; }
  if (S.busy) return;
  const id = S.view === 'deck' ? S.cur : S.detail; if (!id) return;
  const com = ((document.getElementById('com') || {}).value || '').trim();
  haptic('hit');
  markChoice(v); stamp(v);
  if (S.view === 'deck') {
    S.busy = true;
    const card = document.getElementById('card');
    const W = window.innerWidth;
    const ok = sendVote(id, v, com);
    S.hist.push(id);
    setTimeout(() => {
      if (!card) return;
      card.style.transition = 'transform .32s cubic-bezier(.5,0,.75,0), opacity .32s';
      card.style.transform = v === 0 ? 'translateY(60px) scale(.94)' : `translateX(${v > 0 ? 1.3 * W : -1.3 * W}px) rotate(${v > 0 ? 14 : -14}deg)`;
      card.style.opacity = '0';
    }, 320);
    setTimeout(() => {
      S.busy = false;
      S.cur = S.queue.shift() || null; S.photoIdx = 0;
      window.scrollTo(0, 0); renderDeck(v === 0 ? 'up' : v > 0 ? 'left' : 'right');
    }, 640);
    if (await ok) toast(VOTE[v].label, true); else { S.hist.pop(); S.queue.unshift(S.cur); S.cur = id; renderDeck(true); }
  } else {
    if (await sendVote(id, v, com)) {
      haptic('ok'); toast('Оценка сохранена');
      const y = window.scrollY; renderDetail(); window.scrollTo(0, y);
      const b = document.querySelector(`.vb[data-v="${v}"]`); if (b) { void b.offsetWidth; b.classList.add('pop'); }
    } else { const y = window.scrollY; renderDetail(); window.scrollTo(0, y); }
  }
}
function undo() {
  if (S.view !== 'deck' || !S.hist.length || S.busy) return;
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
  if ($viewer.hidden) { if (e.key === 'Escape' && !$sheet.hidden) closeSheet(); else if (e.key === 'Escape' && $fs() && !$fs().hidden) closeFilters(); return; }
  if (e.key === 'ArrowRight') stepViewer(1); else if (e.key === 'ArrowLeft') stepViewer(-1); else if (e.key === 'Escape') closeViewer();
});
$track.addEventListener('scroll', () => requestAnimationFrame(updCap), { passive: true });
/* search in the results: filter as you type, Enter just hides the keyboard */
document.addEventListener('input', e => { if (e.target && e.target.id === 'rq') onSearch(e.target.value); });
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'rq' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

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
  else if (hsh === '#crete') { S.view = 'crete'; window.scrollTo(0, 0); renderCrete(); }
  else if (hsh === '#turkey') {
    const back = S.view === 'detail' && S.retTr != null;
    S.view = 'turkey'; renderTurkey();
    if (back) { const row = $app.querySelector(`.trk[data-id="${S.retTr.id}"]`); window.scrollTo(0, row ? row.getBoundingClientRect().top + window.scrollY - S.retTr.top : S.retTr.y); }
    else window.scrollTo(0, 0);
    S.retTr = null;
    if (S.trAuto) { S.trAuto = false; openFilters(); }
  }
  else { S.view = 'home'; window.scrollTo(0, 0); renderHome(); }
  if (S.view !== 'turkey' && $fs() && !$fs().hidden) { $fs().hidden = true; S.fdraft = null; document.body.style.overflow = ''; }
  syncBack();
}
/* opening a house from the list and coming back: the photo grows into the page and shrinks back */
const canVT = () => !!document.startViewTransition && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function vt(update, after) {
  const done = () => { try { after && after(); } catch (e) { /* ignore */ } };
  if (!canVT()) { update(); done(); return; }
  try { const t = document.startViewTransition(update); t.finished.then(done, done); }
  catch (e) { update(); done(); }
}
function heroName() { const ph = document.querySelector('#card .ph'); if (ph) ph.style.viewTransitionName = 'hero'; }
function clearHero() { document.querySelectorAll('[style*="view-transition-name"]').forEach(e => { e.style.viewTransitionName = ''; }); }
/* back from a house to the list: same place, the photo settles back into its row */
function restoreRow(r) {
  const row = $app.querySelector(`.rk[data-id="${r.id}"]`);
  if (!row) { window.scrollTo(0, r.y); return null; }
  const top = Math.min(Math.max(r.top, 70), window.innerHeight - row.offsetHeight - 20);
  window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - top);
  if (S.vtBack) { const th = row.querySelector('.th'); if (th) th.style.viewTransitionName = 'hero'; }
  return row;
}
/* Booking cancellation terms, checked for 7 adults, 12-25 June 2027 */
const CANCEL = {
  partial: 'Возврат при отмене только частичный',
  nonref: 'При отмене деньги не вернут',
  na: 'Сейчас на Booking нет мест на эти даты',
  small: 'Сейчас на Booking нет варианта на 7 гостей'
};
function cancelLine(h) {
  if (!h.cancel) return '';
  if (h.cancel.k === 'free') return `<span class="cx ok">${ic('check-bold', 's')}Бесплатная отмена до ${esc(h.cancel.d)}</span>`;
  return `<span class="cx no">${ic('warning', 's')}${CANCEL[h.cancel.k] || ''}</span>`;
}
function syncBack() {
  if (!tg || !tg.BackButton) return;
  if (S.view !== 'home' || !$viewer.hidden || !$sheet.hidden || ($fs() && !$fs().hidden)) tg.BackButton.show(); else tg.BackButton.hide();
}
function goBack() { if (!$viewer.hidden) { closeViewer(); return; } if (!$sheet.hidden) { closeSheet(); return; } if ($fs() && !$fs().hidden) { closeFilters(); return; } if (S.view === 'home') return; if (history.length > 1) history.back(); else location.replace('#'); }

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
    case 'open': {
      const id = +el.dataset.id;
      if (S.view === 'turkey') S.retTr = { id, top: el.getBoundingClientRect().top, y: window.scrollY };
      if (S.view !== 'results') { haptic(); location.hash = 'h-' + id; return; }
      S.ret = { id, top: el.getBoundingClientRect().top, y: window.scrollY };
      el.classList.add('opening'); haptic();
      if (canVT()) {
        const th = el.querySelector('.th'); if (th) th.style.viewTransitionName = 'hero';
        vt(() => { history.pushState(null, '', '#h-' + id); route(); heroName(); }, clearHero);
      } else { S.zoomIn = true; setTimeout(() => { location.hash = 'h-' + id; }, 140); }
      return;
    }
    case 'country': haptic(); if (el.dataset.k === 'turkey') S.trAuto = true; location.hash = el.dataset.k; return;
    case 'f-open': openFilters(); return;
    case 'f-close': closeFilters(); return;
    case 'f-set': setFilter(el.dataset.f, el.dataset.v); return;
    case 'f-reset': S.fdraft = JSON.parse(JSON.stringify(Object.assign({}, TRF0, { sort: S.fdraft.sort }))); renderFilters(); haptic(); return;
    case 'f-reset-all': S.trf = Object.assign({}, TRF0, { sort: S.trf.sort }); store.set('krit_trf', S.trf); renderTurkey(); return;
    case 'f-apply': haptic('ok'); applyFilters(); return;
    case 'trsort': S.trf.sort = el.dataset.k; store.set('krit_trf', S.trf); haptic(); renderTurkey(); return;
    case 'rcat': S.rcat = el.dataset.k; S.rq = ''; S.showRest = false; store.set('krit_rcat', S.rcat); haptic(); renderResults(); return;
    case 'rest': S.showRest = true; { const box = document.getElementById('rres'); if (box) box.innerHTML = resultsBody(); else renderResults(); } return;
    case 'rqclear': { onSearch(''); const inp = document.getElementById('rq'); if (inp) { inp.value = ''; inp.focus(); } haptic(); } return;
  }
});
window.addEventListener('hashchange', () => {
  if (S.view === 'detail' && location.hash === '#results' && S.ret && canVT() && $viewer.hidden && $sheet.hidden) {
    window.scrollTo(0, 0); heroName(); S.vtBack = true;
    vt(() => { route(); }, () => { S.vtBack = false; clearHero(); });
    return;
  }
  route();
});
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
    if (S.view === 'results') {
      const y = window.scrollY, box = document.getElementById('rres');
      /* keep the keyboard open while someone is typing in the search box */
      if (box && document.activeElement && document.activeElement.id === 'rq') box.innerHTML = resultsBody(); else renderResults();
      window.scrollTo(0, y);
    }
    else if (S.view === 'turkey') { const y = window.scrollY; renderTurkey(); window.scrollTo(0, y); }
    else if (S.view === 'crete') renderCrete();
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
  try {
    const [cr, trl] = await Promise.all([
      fetch('data/houses.json?v=8').then(r => r.json()),
      fetch('data/turkey.json?v=1').then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    trl.forEach(h => { h.country = 'tr'; });
    S.houses = cr.concat(trl); S.houses.forEach(h => { S.byId[h.id] = h; });
  }
  catch (e) { $app.innerHTML = `<div class="pad done"><h1>Не загрузился список домов</h1><p>Закрой приложение и открой ещё раз.</p></div>`; return; }
  try { await loadVotes(); } catch (e) { toast('Оценки пока не загрузились, попробую ещё раз'); }
  if (/^#(deck-|h-|results|crete|turkey)/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  route();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000);
}
boot();
})();
