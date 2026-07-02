// ── 1. FUNGSI RENDER GLOBAL HEADER ──────────
function renderGlobalHeader() {
    // Mencegah duplikasi jika header sudah ada
    if (document.querySelector('header.sticky')) return; 
    
    // Cek apakah user sudah login atau belum
    const loggedIn = isUserLoggedIn();
    
    // Jika login, munculkan menu "Pesanan Saya", jika tidak, kosongkan ('')
    const menuPesanan = loggedIn ? `<a href="my-orders.html" class="hover:text-stone-900 transition-colors">Pesanan Saya</a>` : '';
    
    const headerHTML = `<header class="sticky top-0 z-50 bg-stone-100 border-b border-stone-200">
    <div class="max-w-[1400px] mx-auto px-8 md:px-12 h-16 flex items-center justify-between">
    <a href="landingpage.html" class="font-serif text-2xl font-light tracking-wide text-stone-900">Debbi <span class="text-rust">Meubel</span></a>
    <nav class="hidden md:flex items-center gap-10 text-sm text-stone-600"><a href="landingpage.html" class="hover:text-stone-900 transition-colors">Beranda</a>
    <a href="catalog.html" class="hover:text-stone-900 transition-colors">Katalog</a>${menuPesanan}</nav><a id="navAuthBtn" href="login.html" class="text-xs tracking-widest uppercase px-5 py-2.5 bg-stone-900 text-white hover:bg-rust transition-colors">Login</a></div></header>`;
    
    document.body.insertAdjacentHTML('afterbegin', headerHTML);
}

// ── 2. LOGIKA AUTENTIKASI ──────────
function getAuthToken() { return localStorage.getItem('token') || localStorage.getItem('adminToken'); }

function getAuthUser() {
    try {
        const raw = localStorage.getItem('userData') || localStorage.getItem('adminUser');
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function isUserLoggedIn() { return !!getAuthToken(); }

function globalLogout() {
    ['token', 'adminToken', 'userData', 'adminUser', 'user'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'landingpage.html';
}

function renderNavbarAuth() {
    const btn = document.getElementById('navAuthBtn');
    if (!btn) return;
    
    if (isUserLoggedIn()) {
        const user = getAuthUser();
        btn.textContent = `Logout (${user?.name ? user.name.split(' ')[0] : 'Akun'})`;
        btn.href = '#';
        btn.onclick = (e) => { e.preventDefault(); globalLogout(); };
    } else {
        btn.textContent = 'Login';
        btn.href = 'login.html';
        btn.onclick = null;
    }
}

// ── 3. JALANKAN SAAT DOM SIAP ──────────
document.addEventListener('DOMContentLoaded', () => {
    renderGlobalHeader(); // Render UI header terlebih dahulu
    renderNavbarAuth();   // Modifikasi tombol auth sesuai status
});