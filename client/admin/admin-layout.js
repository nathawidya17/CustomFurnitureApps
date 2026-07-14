const API = 'https://debbimeubel.up.railway.app/api';

let allOrders   = [];
let allProducts = [];

function getToken() { return localStorage.getItem('adminToken') || localStorage.getItem('token'); }
function getUser()  { try { return JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem('user') || '{}'); } catch(e) { return {}; } }

function checkAuth() {
    const token = getToken();
    const user  = getUser();
    if (!token || user.role !== 'ADMIN') {
        document.getElementById('authGate').classList.remove('hidden');
        return false;
    }
    document.getElementById('appLayout').classList.remove('hidden');
    document.getElementById('appLayout').classList.add('flex');
    const name = user.name || 'Admin';
    document.getElementById('adminName').textContent    = name;
    document.getElementById('adminEmail').textContent   = user.email || '—';
    document.getElementById('adminInitial').textContent = name.charAt(0).toUpperCase();
    const greet = document.getElementById('greetName');
    if (greet) greet.textContent = name.split(' ')[0];
    return true;
}

function logout() {
    ['adminToken','adminUser','token','user'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'login.html';
}

function formatIDR(n) {
    return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(n);
}
function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}
function formatDateTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('id-ID', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const STATUS_LABEL = {
    PENDING:'Pending', WAITING_APPROVAL:'Menunggu Persetujuan',
    APPROVED:'Disetujui', REJECTED:'Ditolak',
    IN_PRODUCTION:'Dalam Produksi', DONE:'Selesai',
};
const STATUS_CLASS = {
    PENDING:'badge-pending', WAITING_APPROVAL:'badge-waiting',
    APPROVED:'badge-approved', REJECTED:'badge-rejected',
    IN_PRODUCTION:'badge-in_production', DONE:'badge-done',
};
function badge(status) {
    return `<span class="badge ${STATUS_CLASS[status]||''}">${STATUS_LABEL[status]||status}</span>`;
}

// Sidebar active highlight
function setNavActive(page) {
    ['dashboard','orders','products'].forEach(p => {
        const el = document.getElementById(`nav-${p}`);
        if (!el) return;
        el.classList.toggle('active', p === page);
        el.classList.toggle('text-stone-600', p !== page);
        el.classList.toggle('hover:bg-stone-50', p !== page);
    });
}

// Shared CSS string — injected in each page's <style>
const SHARED_CSS = `
body { -webkit-font-smoothing: antialiased; }
#sidebar { width: 240px; flex-shrink: 0; }
.badge { display:inline-flex;align-items:center;gap:4px;padding:2px 10px;font-size:0.65rem;letter-spacing:0.08em;text-transform:uppercase;font-weight:500; }
.badge-pending         { background:#fef9ed;color:#b45309;border:1px solid #fde68a; }
.badge-waiting         { background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe; }
.badge-approved        { background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0; }
.badge-rejected        { background:#fef2f2;color:#b91c1c;border:1px solid #fecaca; }
.badge-in_production   { background:#faf5ff;color:#7e22ce;border:1px solid #e9d5ff; }
.badge-done            { background:#f0fdf4;color:#166534;border:1px solid #86efac; }
tbody tr { transition:background 0.1s; }
tbody tr:hover { background:#f8f7f5; }
.nav-item.active { background:#1a1a18;color:#fff; }
.nav-item { transition:background 0.15s,color 0.15s; }
.stat-card { border:1px solid #e5e3df;padding:20px 24px;background:#fff; }
::-webkit-scrollbar { width:4px;height:4px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:#d0ceca; }
@keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
.fade-up { animation:fadeUp 0.4s ease both; }
input:focus,textarea:focus,select:focus { outline:none;border-color:#1a1a18; }
`;