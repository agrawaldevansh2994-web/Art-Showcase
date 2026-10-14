// First-visit guide: one small card, bottom-left. Not a tutorial: after one line of controls it
// HINTS at the best places (teasers, not directions) and each hint clears when the visitor gets
// there, so they find things themselves (Devansh, 2026-10-02: "hinting so they explore themselves").
// DOM only — it adds no 3D, no lights, no materials, and reads the world only through the
// `world` object it is handed. IDENTICAL copy in atlantis/src/core and space/src/core: edit both.
//
//  · Steps advance when the visitor DOES the thing (looked, swam, danced), never on a timer, so it
//    never nags someone who already knows. Each step has a `when()` so the card follows context
//    (swimming vs aboard the yacht) and a `done` rule.
//  · Tab hides it and the choice is remembered in this browser (localStorage, shared by every
//    world on the site: one decision). Tab again brings it back. ?guide=off / ?guide=on override
//    for a single visit without remembering anything.
//  · Hidden while the entry screen or the K panel is up, and after the last step.

const STORE = 'worlds-guide';           // 'off' once the visitor has dismissed it
const TOGGLE = 'Tab';
const LINGER_MS = 12000;               // a hint nobody acts on moves along after this (a teaser, not a gate)

export function createGuide({ steps, world = () => ({}) }) {
    const q = new URLSearchParams(location.search).get('guide');
    let off = false;
    try { off = localStorage.getItem(STORE) === 'off'; } catch { /* storage blocked: session-only */ }
    if (q === 'off') off = true;
    if (q === 'on') off = false;

    // ── DOM ──
    const css = document.createElement('style');
    css.textContent = `
    #guide { position: fixed; left: 18px; bottom: 74px; z-index: 9; width: 262px; padding: 12px 14px 10px;
        font: 13px/1.5 'Segoe UI', system-ui, -apple-system, sans-serif; color: rgba(236, 246, 250, 0.92);
        background: rgba(6, 18, 28, 0.62); border: 1px solid rgba(170, 225, 240, 0.22); border-radius: 6px;
        backdrop-filter: blur(4px); pointer-events: none; opacity: 0; transform: translateY(6px);
        transition: opacity 0.45s ease, transform 0.45s ease; }
    #guide.show { opacity: 1; transform: none; }
    #guide .gh { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 0.22em;
        text-transform: uppercase; color: rgba(170, 225, 240, 0.7); margin-bottom: 6px; }
    #guide .gt { min-height: 38px; transition: opacity 0.25s ease; }
    #guide .gt b { color: #fff; border: 1px solid rgba(255, 255, 255, 0.35); border-bottom-width: 2px;
        border-radius: 4px; padding: 0 5px; font-size: 11px; font-weight: 600; margin: 0 1px; white-space: nowrap; }
    #guide .gt.ok { opacity: 0.45; }
    /* A step that matters (take off, board the pod): lit border + larger text, so it can't be missed. */
    #guide.big { width: 300px; border-color: rgba(255, 214, 140, 0.75); box-shadow: 0 0 18px rgba(255, 190, 90, 0.28); }
    #guide.big .gt { font-size: 15px; font-weight: 600; }
    #guide.big .gh { color: rgba(255, 214, 140, 0.9); }
    #guide .gf { margin-top: 6px; font-size: 10.5px; color: rgba(236, 246, 250, 0.5); }
    #guide .gf b { color: rgba(236, 246, 250, 0.8); font-weight: 600; }
    @media (max-width: 900px) { #guide { display: none; } }`;
    document.head.appendChild(css);
    const el = document.createElement('div');
    el.id = 'guide';
    el.innerHTML = '<div class="gh"><span>Guide</span><span class="gn"></span></div><div class="gt"></div>' +
        `<div class="gf"><b>${TOGGLE}</b> hide the guide</div>`;
    document.body.appendChild(el);
    const gn = el.querySelector('.gn'), gt = el.querySelector('.gt'), gf = el.querySelector('.gf');

    // ── What the visitor has done ──
    const S = { look: 0, heldMs: {}, pressed: new Set() };
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement || document.body.classList.contains('playing')) S.look += Math.abs(e.movementX) + Math.abs(e.movementY);
    });
    document.addEventListener('keydown', (e) => {
        if (e.code === TOGGLE) {                       // Tab: toggle, remembered; never moves page focus
            e.preventDefault();
            if (e.repeat) return;
            off = !off;
            try { localStorage.setItem(STORE, off ? 'off' : 'on'); } catch { /* ignore */ }
            if (off) { gt.textContent = ''; flash('Guide off · Tab brings it back'); } else { current = null; }
            return;
        }
        if (!e.repeat) S.pressed.add(e.code);
    });
    const keyDown = new Set();
    document.addEventListener('keydown', (e) => keyDown.add(e.code));
    document.addEventListener('keyup', (e) => keyDown.delete(e.code));

    // ── The card ──
    const finished = new Set();
    let current = null, shownAt = 0, advanceAt = 0, msgUntil = 0, last = performance.now();
    function flash(text) {
        gn.textContent = ''; gt.innerHTML = text; gf.style.display = 'none';
        el.classList.add('show'); msgUntil = performance.now() + 2200;
    }
    const api = {
        get off() { return off; },
        /** Poll ~4x a second from a plain timer: cheap, and independent of the render loop. */
        tick() {
            const now = performance.now();
            const dt = now - last; last = now;
            for (const c of keyDown) S.heldMs[c] = (S.heldMs[c] ?? 0) + dt;
            const playing = document.body.classList.contains('playing');
            // The K panel: Atlantis's #keys, or Afterglow's #shortcuts-guide list.
            const panels = document.querySelector('#keys.show, #shortcuts-guide .list.visible');
            const blocked = off || !playing || !!panels;
            if (msgUntil) {
                if (now < msgUntil) { el.classList.add('show'); return; }
                msgUntil = 0; gf.style.display = '';
            }
            if (blocked) { el.classList.remove('show'); return; }
            const w = world();
            // Exploring is out of order: a place found before its hint came up is ticked off quietly.
            for (const s of steps) if (s !== current && !finished.has(s.id) && s.when(w) && s.done(S, w)) finished.add(s.id);
            const live = steps.filter((s) => !finished.has(s.id) && s.when(w));
            if (!live.length) { el.classList.remove('show'); return; }
            const next = live[0];
            if (current !== next) {
                if (current && now < advanceAt) return;        // let the "done" step linger a beat
                current = next;
                const total = steps.filter((s) => s.when(w) || finished.has(s.id)).length;
                const nth = steps.filter((s) => (s.when(w) || finished.has(s.id))).indexOf(next) + 1;
                gn.textContent = `${nth} / ${total}`;
                gt.className = 'gt'; gt.innerHTML = next.text;
                el.classList.toggle('big', !!next.big);
                shownAt = now;
            }
            if (now - shownAt > LINGER_MS && !gt.classList.contains('ok')) { finished.add(next.id); current = null; return; }
            el.classList.add('show');
            if (next.done(S, w) && !gt.classList.contains('ok')) {
                gt.classList.add('ok');
                advanceAt = now + 900;
                setTimeout(() => { finished.add(next.id); current = null; }, 900);
            }
        },
    };
    setInterval(api.tick, 250);
    return api;
}

/** Common "the visitor did it" rules, so each world's step list reads as a sentence. */
export const did = {
    looked: (S) => S.look > 450,
    held: (...codes) => (S) => codes.some((c) => (S.heldMs[c] ?? 0) > 1400),
    pressed: (...codes) => (S) => codes.some((c) => S.pressed.has(c)),
};
