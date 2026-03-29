
// ================= HELPERS =================

export function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
}

export function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

export function escapeHtml(unsafe) {
    return (unsafe || '').toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function linkify(text) {
    const escaped = escapeHtml(text);
    const urlRegex = /((https?:\/\/|www\.)[^\s]+)/g;
    return escaped.replace(urlRegex, function (url) {
        let href = url;
        if (!href.startsWith('http')) href = 'http://' + href;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${href}</a>`;
    });
}

export function makeTag(text) {
    const t = document.createElement('span');
    t.className = "bg-white/5 px-3 py-1 rounded-full text-sm text-gray-200 border border-white/10";
    t.textContent = text;
    return t;
}

export function showDashboard() {
    const dashboard = document.getElementById("dashboard");
    const publicHero = document.getElementById("publicHero");
    if (dashboard) dashboard.classList.remove("hidden");
    if (publicHero) publicHero.classList.add("hidden");
}

export function hideDashboard() {
    const dashboard = document.getElementById("dashboard");
    const publicHero = document.getElementById("publicHero");
    if (dashboard) dashboard.classList.add("hidden");
    if (publicHero) publicHero.classList.remove("hidden");
}

// ================= GLOBAL CENTERED MODAL (confirm/alert) =================
let globalModalExists = false;

export function ensureGlobalModal() {
    if (globalModalExists) return;
    globalModalExists = true;

    const html = `
  <div id="globalModalOverlay" class="fixed inset-0 bg-black/60 z-[200] hidden flex items-center justify-center">
    <div id="globalModalCard" class="bg-[#020617] text-gray-200 rounded-xl w-full max-w-md p-6 border border-white/10 shadow-xl relative">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 id="globalModalTitle" class="text-lg font-semibold"></h3>
          <p id="globalModalMessage" class="text-sm text-gray-400 mt-2"></p>
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-3" id="globalModalButtons"></div>
    </div>
  </div>
  `;
    document.body.insertBefore(el(html), document.body.firstChild);
}

export function showAlert(message, title = '') {
    ensureGlobalModal();
    return new Promise((resolve) => {
        const overlay = document.getElementById('globalModalOverlay');
        const titleEl = document.getElementById('globalModalTitle');
        const msgEl = document.getElementById('globalModalMessage');
        const btns = document.getElementById('globalModalButtons');

        titleEl.textContent = title || '';
        msgEl.textContent = message || '';
        btns.innerHTML = `<button id="globalModalOk" class="px-4 py-2 bg-primary rounded-md text-white">OK</button>`;

        overlay.classList.remove('hidden');

        const ok = document.getElementById('globalModalOk');
        function done() {
            overlay.classList.add('hidden');
            ok.removeEventListener('click', done);
            resolve();
        }
        ok.addEventListener('click', done);
    });
}

export function showConfirm(message, title = '', okText = 'Yes', cancelText = 'Cancel') {
    ensureGlobalModal();
    return new Promise((resolve) => {
        const overlay = document.getElementById('globalModalOverlay');
        const titleEl = document.getElementById('globalModalTitle');
        const msgEl = document.getElementById('globalModalMessage');
        const btns = document.getElementById('globalModalButtons');

        titleEl.textContent = title || '';
        msgEl.textContent = message || '';
        btns.innerHTML = `
      <button id="globalModalCancel" class="px-4 py-2 rounded-md border">${cancelText}</button>
      <button id="globalModalOk" class="px-4 py-2 bg-primary rounded-md text-white">${okText}</button>
    `;

        overlay.classList.remove('hidden');

        const ok = document.getElementById('globalModalOk');
        const cancel = document.getElementById('globalModalCancel');

        function cleanup() {
            overlay.classList.add('hidden');
            ok.removeEventListener('click', onOk);
            cancel.removeEventListener('click', onCancel);
        }
        function onOk() { cleanup(); resolve(true); }
        function onCancel() { cleanup(); resolve(false); }

        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
    });
}

