document.addEventListener('DOMContentLoaded', () => {
    // Load catalog on startup
    loadCatalog().then(() => { showCatalog(); });

    // Helper functions for catalog / selection
    async function loadCatalog() {
        try {
            const res = await fetch('./models/catalog.json');
            const list = await res.json();
            window._catalogList = list;
            return list;
        } catch (e) {
            console.error('Could not load catalog.json', e);
            window._catalogList = [];
            return [];
        }
    }

    function showCatalog() {
        const catEl = document.getElementById('catalog');
        const listEl = document.getElementById('catalogList');
        if (!catEl || !listEl) return;
        // populate list
        listEl.innerHTML = '';
        (window._catalogList || []).forEach(entry => {
            const card = document.createElement('div');
            card.className = 'catalog-card';

            // thumbnail
            const thumbWrap = document.createElement('div');
            thumbWrap.style.height = '72px';
            thumbWrap.style.display = 'flex';
            thumbWrap.style.alignItems = 'center';
            thumbWrap.style.justifyContent = 'center';
            thumbWrap.style.background = 'linear-gradient(180deg,#fff,#fafafa)';
            thumbWrap.style.borderRadius = '4px';
            thumbWrap.style.overflow = 'hidden';
            if (entry.thumbnail) {
                const img = document.createElement('img');
                img.src = entry.thumbnail;
                img.alt = entry.name;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'cover';
                thumbWrap.appendChild(img);
            } else {
                const placeholder = document.createElement('div');
                placeholder.style.width = '100%';
                placeholder.style.height = '100%';
                placeholder.style.background = '#f4f4f4';
                thumbWrap.appendChild(placeholder);
            }

            const title = document.createElement('h4');
            title.textContent = entry.name;
            const actions = document.createElement('div');
            actions.className = 'catalog-actions';
            const btn = document.createElement('button');
            btn.textContent = 'Pilih';
            btn.addEventListener('click', () => selectModel(entry));
            actions.appendChild(btn);

            // make card clickable as well
            card.addEventListener('click', (e) => {
                // avoid double-trigger when clicking button
                if (e.target === btn) return;
                selectModel(entry);
            });

            card.appendChild(thumbWrap);
            card.appendChild(title);
            card.appendChild(actions);
            listEl.appendChild(card);
        });
    }

    function selectModel(entry) {
        // Store the selected model in localStorage so the custom page can access it
        localStorage.setItem('selectedModel', JSON.stringify(entry));
        window.location.href = 'custom.html';
    }
});
