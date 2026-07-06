// ── 1. FUNGSI RENDER GLOBAL HEADER & BOTTOM NAV ──────────
function renderGlobalHeader() {
    if (document.querySelector('header.sticky')) return; 
    
    const loggedIn = isUserLoggedIn();
    
    let currentPath = window.location.pathname.split('/').pop().split('?')[0].split('#')[0];
    if (!currentPath) currentPath = 'landingpage.html'; 
    
    const deskClass = (path) => currentPath === path ? "text-stone-900 font-medium" : "hover:text-stone-900 transition-colors";
    const mobClass  = (path) => currentPath === path ? "text-stone-900 font-medium" : "text-stone-500 hover:text-stone-900 transition-colors";
    const strokeW   = (path) => currentPath === path ? "2.5" : "1.5";
    
    const menuPesananDesktop = loggedIn ? `<a href="my-orders.html" class="${deskClass('my-orders.html')}">Pesanan Saya</a>` : '';
    const menuPesananMobile  = loggedIn ? `
        <a href="my-orders.html" class="flex flex-col items-center justify-center w-full h-full ${mobClass('my-orders.html')}">
            <svg class="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeW('my-orders.html')}" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            <span class="text-[0.6rem] tracking-wider uppercase">Pesanan</span>
        </a>` : '';
    
    const headerHTML = `
    <header class="sticky top-0 z-50 bg-stone-100 border-b border-stone-200">
        <div class="max-w-[1400px] mx-auto px-5 md:px-12 h-16 flex items-center justify-between">
            <a href="landingpage.html" class="font-serif text-xl md:text-2xl font-light tracking-wide text-stone-900">Debbi <span class="text-rust">Meubel</span></a>
            
            <nav class="hidden md:flex items-center gap-10 text-sm text-stone-600">
                <a href="landingpage.html" class="${deskClass('landingpage.html')}">Beranda</a>
                <a href="catalog.html" class="${deskClass('catalog.html')}">Katalog</a>
                ${menuPesananDesktop}
            </nav>
            
            <a id="navAuthBtn" href="login.html" class="text-[0.65rem] md:text-xs tracking-widest uppercase px-4 py-2.5 bg-stone-900 text-white hover:bg-rust transition-colors text-center">Login</a>
        </div>
    </header>`;

    const bottomNavHTML = `
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200 flex justify-around items-center h-16">
        <a href="landingpage.html" class="flex flex-col items-center justify-center w-full h-full ${mobClass('landingpage.html')}">
            <svg class="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeW('landingpage.html')}" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            <span class="text-[0.6rem] tracking-wider uppercase">Beranda</span>
        </a>
        <a href="catalog.html" class="flex flex-col items-center justify-center w-full h-full ${mobClass('catalog.html')}">
            <svg class="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeW('catalog.html')}" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            <span class="text-[0.6rem] tracking-wider uppercase">Katalog</span>
        </a>
        ${menuPesananMobile}
    </nav>`;
    
    document.body.insertAdjacentHTML('afterbegin', headerHTML);
    document.body.insertAdjacentHTML('beforeend', bottomNavHTML);
    document.body.classList.add('pb-16', 'md:pb-0');
}

// ── 2. LOGIKA UI MODAL LOGOUT ──────────
function initLogoutModal() {
    if (document.getElementById('customLogoutModal')) return;
    const modalHTML = `
    <div id="customLogoutModal" class="hidden fixed inset-0 z-[9999] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 opacity-0 transition-opacity duration-300">
        <div id="customLogoutContent" class="bg-white w-full max-w-sm p-8 text-center transform scale-95 transition-transform duration-300 shadow-xl border border-stone-100">
            <div class="w-12 h-12 bg-stone-50 border border-stone-200 flex items-center justify-center mx-auto mb-5">
                <svg class="w-5 h-5 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
            </div>
            <h3 class="font-serif font-light text-2xl text-stone-900 mb-2">Keluar Akun</h3>
            <p class="text-sm text-stone-500 mb-8 font-sans">Apakah Anda yakin ingin keluar dari sistem?</p>
            <div class="flex gap-3">
                <button id="btnCancelLogout" class="flex-1 py-3 border border-stone-200 text-stone-600 text-[0.65rem] tracking-widest uppercase hover:bg-stone-50 transition-colors">Batal</button>
                <button id="btnConfirmLogout" class="flex-1 py-3 bg-stone-900 hover:bg-rust text-white text-[0.65rem] tracking-widest uppercase transition-colors">Logout</button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('btnCancelLogout').onclick = hideLogoutModal;
    document.getElementById('btnConfirmLogout').onclick = globalLogout;
    
    // Tutup modal kalau klik area luar modal
    document.getElementById('customLogoutModal').addEventListener('click', (e) => {
        if (e.target.id === 'customLogoutModal') hideLogoutModal();
    });
}

function showLogoutModal() {
    const modal = document.getElementById('customLogoutModal');
    const content = document.getElementById('customLogoutContent');
    modal.classList.remove('hidden');
    void modal.offsetWidth; // Trigger reflow animasi
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
}

function hideLogoutModal() {
    const modal = document.getElementById('customLogoutModal');
    const content = document.getElementById('customLogoutContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300); // Tunggu animasi selesai
}


// ── 3. LOGIKA AUTENTIKASI ──────────
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
        // Ubah dari langsung panggil globalLogout() menjadi panggil showLogoutModal()
        btn.onclick = (e) => { e.preventDefault(); showLogoutModal(); };
    } else {
        btn.textContent = 'Login';
        btn.href = 'login.html';
        btn.onclick = null;
    }
}

// ── 4. JALANKAN SAAT DOM SIAP ──────────
document.addEventListener('DOMContentLoaded', () => {
    renderGlobalHeader(); 
    initLogoutModal(); // Suntikkan HTML modal ke halaman
    renderNavbarAuth();   
});