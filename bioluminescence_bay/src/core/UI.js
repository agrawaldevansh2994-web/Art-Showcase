// Thin wrapper over the DOM chrome so no other module has to know element ids.

export function createUI() {
    const $ = (id) => document.getElementById(id);
    const overlay = $('overlay');
    const hud = $('hud');
    const zoneEl = $('zone-label');
    const promptEl = $('prompt');
    const toastEl = $('toast');
    const clockTime = $('clock-time');
    const clockSub = $('clock-sub');
    const flashEl = $('flash');
    const shortcuts = $('shortcuts-list');

    const ctxEl = $('ctx-card');
    let lastCtx = null;
    // H hides the feature cards (2026-10-09); remembered across visits.
    let ctxHidden = localStorage.getItem('bay.ctxHidden') === '1';
    let toastTimer = null;
    let lastPrompt = null;

    return {
        showOverlay() { overlay.classList.remove('hidden'); document.body.classList.remove('playing'); },
        hideOverlay() { overlay.classList.add('hidden'); },

        hudText(html) { hud.innerHTML = html; },

        zoneLabel(text) {
            if (text) { zoneEl.textContent = text; zoneEl.classList.add('show'); }
            else zoneEl.classList.remove('show');
        },

        /** Called every frame — bail out unless the text actually changed. */
        prompt(text) {
            if (text === lastPrompt) return;
            lastPrompt = text;
            if (text) { promptEl.textContent = text; promptEl.classList.add('show'); }
            else promptEl.classList.remove('show');
        },

        toast(text, ms = 2600) {
            toastEl.textContent = text;
            toastEl.classList.add('show');
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
        },

        clock(time, sub) {
            clockTime.textContent = time;
            clockSub.textContent = sub;
        },

        /** Feature controls card. card = { title, sub, rows: [[key, text]], stat } | null. Cheap to call every frame. */
        context(card) {
            const key = card ? JSON.stringify(card) : null;
            if (key === lastCtx) return;
            lastCtx = key;
            if (!card) { ctxEl.classList.remove('show', 'mini'); return; }
            if (ctxHidden) {
                // collapsed to a one-line pill so the stat (ride time) still shows
                ctxEl.innerHTML = `<b>${card.title}</b>${card.stat ? ` · ${card.stat}` : ''}<i>H</i>`;
                ctxEl.classList.add('show', 'mini');
                return;
            }
            ctxEl.classList.remove('mini');
            ctxEl.innerHTML = `<h4>${card.title}</h4>${card.sub ? `<p>${card.sub}</p>` : ''}<ul>${card.rows.map(([k, v]) => `<li><span>${k}</span>${v}</li>`).join('')}</ul>${card.stat ? `<div class="stat">${card.stat}</div>` : ''}<div class="hint">H hide</div>`;
            ctxEl.classList.add('show');
        },

        toggleContext() {
            ctxHidden = !ctxHidden;
            localStorage.setItem('bay.ctxHidden', ctxHidden ? '1' : '0');
            lastCtx = null;
            return ctxHidden;
        },

        toggleShortcuts() { shortcuts.classList.toggle('visible'); },

        /** White-out used for the sunrise ceremony and teleports. */
        flash(ms = 500) {
            flashEl.classList.add('on');
            setTimeout(() => flashEl.classList.remove('on'), ms);
        },
    };
}
