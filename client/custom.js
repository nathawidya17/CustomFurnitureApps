import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// ==========================================
// --- SECTION 1: GLOBAL CONFIG & STATE ---
// ==========================================
const container = document.getElementById('canvas-area');
const PRICE_PER_UNIT = 200000;
const LERP_SPEED = 0.1;
let scene, camera, renderer, controls, raycaster, mouse;
let mainCabinet, rackGroup, modelPrototype, modelOriginalBox;
let productType = 'rack';
let customConfig = { width: 1.2, height: 1.5, depth: 1.0 };
let currentColor = '#ffffff';

// ==========================================
// --- SECTION 2: PRODUCT MODULE - HIRO ---
// ==========================================
const hiroParts = { frame: null, laci: null, drawer: null, feet: null };
let numDrawer = 2, numLaci = 1;

async function initHiro(loader) {
    productType = 'hiro'; customConfig = { width: 0.8, height: 1.0, depth: 0.5 }; updateUIValues(80, 100, 50);
    document.getElementById('colWrapper').querySelector('label').innerHTML = `Tambah Drawer (<span id="drawerVal">${numDrawer}</span>)`;
    const inputDrawer = document.getElementById('rackCols'); inputDrawer.id = 'inputDrawer'; inputDrawer.value = numDrawer;
    document.getElementById('rowWrapper').querySelector('label').innerHTML = `Tambah Laci (<span id="laciVal">${numLaci}</span>)`;
    const inputLaci = document.getElementById('rackRows'); inputLaci.id = 'inputLaci'; inputLaci.value = numLaci;

    try {
        const [f, dw, lc, ft] = await Promise.all([
            loader.loadAsync('./models/frame-hiro-drawer.glb'), loader.loadAsync('./models/drawer-hiro-drawer.glb'),
            loader.loadAsync('./models/laci-hiro-drawer.glb'), loader.loadAsync('./models/kaki-hiro-drawer.glb')
        ]);
        hiroParts.frame = f.scene; hiroParts.drawer = dw.scene; hiroParts.laci = lc.scene; hiroParts.feet = ft.scene;    
        modelPrototype = hiroParts.frame; modelOriginalBox = new THREE.Box3().setFromObject(hiroParts.frame);
        
        updateDisplay(); focusCamera(9);
        
        document.getElementById('inputDrawer').oninput = (e) => { numDrawer = parseInt(e.target.value) || 0; document.getElementById('drawerVal').innerText = numDrawer; updateDisplay(); };
        document.getElementById('inputLaci').oninput = (e) => { numLaci = parseInt(e.target.value) || 0; document.getElementById('laciVal').innerText = numLaci; updateDisplay(); };
    } catch (e) { console.error("Hiro Load Error:", e); }
}

function buildHiro(states) {
    const feet = hiroParts.feet.clone(); applyMat(feet, true); rackGroup.add(feet);
    const feetInfo = getObjectInfo(feet); let currentY = feetInfo.maxY + 0.01; 
    const frameRaw = getObjectInfo(hiroParts.frame);
    
    for (let i = 0; i < numDrawer; i++) {
        const el = hiroParts.drawer.clone(); const info = getObjectInfo(el); el.position.y = currentY - info.minY;
        const isOpen = states.drawer[i] || false;
        el.userData = { type: 'drawer', id: i, canOpen: true, isOpen, baseZ: 0, openZ: 0.9 };
        if (isOpen) el.position.z = 0.9;
        applyMat(el, true); rackGroup.add(el); currentY += info.height + 0.01; 
    }
    for (let j = 0; j < numLaci; j++) {
        const el = hiroParts.laci.clone(); const info = getObjectInfo(el); el.position.y = currentY - info.minY;
        el.userData = { type: 'laci', id: j, canOpen: false }; 
        applyMat(el, true); rackGroup.add(el); currentY += info.height + 0.01;
    }
    
    const frame = hiroParts.frame.clone(); const targetH = Math.max(currentY - feetInfo.maxY, 0.5); 
    const scaleY = targetH / frameRaw.height; frame.scale.set(1, scaleY, 1);
    frame.position.y = feetInfo.maxY - (frameRaw.minY * scaleY);
    applyMat(frame, true); rackGroup.add(frame);
}

// ==========================================
// --- SECTION 3: PRODUCT MODULE - CABINET ---
// ==========================================
const cabinetParts = { frame: null, door: null }; let numCabinetRows = 3;

async function initCabinet(loader) {
    productType = 'lemari_kabinet'; customConfig = { width: 0.6, height: 0.6, depth: 0.4 };
    document.getElementById('colWrapper').style.display = 'none';
    document.getElementById('rowWrapper').querySelector('label').innerHTML = `Jumlah Lemari (<span id="rowVal">${numCabinetRows}</span>)`;
    const inputRow = document.getElementById('rackRows'); inputRow.value = numCabinetRows;

    try {
        const [f, p] = await Promise.all([ loader.loadAsync('./models/frame-lemari-kabinet.glb'), loader.loadAsync('./models/pintu-lemari-kabinet.glb') ]);
        cabinetParts.frame = f.scene; cabinetParts.door = p.scene;
        modelPrototype = f.scene; modelOriginalBox = new THREE.Box3().setFromObject(f.scene);
        updateDisplay(); focusCamera();
        inputRow.oninput = (e) => { numCabinetRows = parseInt(e.target.value) || 1; document.getElementById('rowVal').innerText = numCabinetRows; updateDisplay(); };
    } catch (e) { console.error("Cabinet Load Error:", e); }
}

function buildCabinet(states) {
    const size = new THREE.Vector3(); modelOriginalBox.getSize(size);
    for (let i = 0; i < numCabinetRows; i++) {
        const unit = new THREE.Group(); 
        const frame = cabinetParts.frame.clone(); 
        applyMat(frame, true); 
        unit.add(frame);
        
        const hinge = new THREE.Group(); 
        const door = cabinetParts.door.clone();
        applyMat(door, true); 
        
        // --- PERBAIKAN LOGIKA PIVOT PINTU KABINET ---
        // Cari ujung dimensi frame untuk nempatin engsel yang bener
        const fBox = new THREE.Box3().setFromObject(frame);
        const pivotX = fBox.min.x + 0.01; // Titik engsel di ujung kiri frame (masuk 1cm)
        const pivotZ = fBox.max.z - 0.01; // Titik engsel di ujung depan frame (masuk 1cm)
        
        // Posisikan grup engsel tepat di sudut frame
        hinge.position.set(pivotX, 0, pivotZ);
        
        // Trik Inverse: Tarik pintu kebalikan dari posisi engsel. 
        // Ini bikin pintu 100% pas ke frame, tapi rotasinya tetep nempel di engsel
        door.position.set(-pivotX, 0, -pivotZ); 
        
        hinge.add(door);
        
        const isOpen = states.cabinet[i] || false; 
        hinge.userData = { type: 'cabinet_door', id: i, canOpen: true, isOpen, baseRotation: 0, openRotation: -Math.PI / 1.8 }; // Dibuka ga full 180 drajat biar ga nembus frame
        if (isOpen) hinge.rotation.y = hinge.userData.openRotation;
        
        unit.add(hinge); unit.position.y = i * size.y; rackGroup.add(unit);
    }
}

// ==========================================
// --- SECTION 4: PRODUCT MODULE - STANDARD ---
// ==========================================
let rackCols = 3, rackRows = 3; 

async function initStandard(loader, modelId) {
    productType = 'rack'; let modelPath = './models/rakfix.glb';
    if (modelId === 'lemari') { modelPath = './models/lemari.glb'; productType = 'cabinet'; customConfig = { width: 1.2, height: 1.8, depth: 0.6 }; updateUIValues(120, 180, 60); }
    const colInput = document.getElementById('rackCols'), rowInput = document.getElementById('rackRows');
    if (colInput) colInput.oninput = (e) => { rackCols = parseInt(e.target.value) || 1; document.getElementById('rackColsValue').innerText = rackCols; updateDisplay(); };
    if (rowInput) rowInput.oninput = (e) => { rackRows = parseInt(e.target.value) || 1; document.getElementById('rackRowsValue').innerText = rackRows; updateDisplay(); };
    loader.load(modelPath, (gltf) => { modelPrototype = gltf.scene; modelOriginalBox = new THREE.Box3().setFromObject(modelPrototype); updateDisplay(); focusCamera(); });
}

function buildStandard() {
    const size = new THREE.Vector3(); modelOriginalBox.getSize(size);
    const sX = customConfig.width / size.x, sY = customConfig.height / size.y, sZ = customConfig.depth / size.z;
    if (productType === 'rack') {
        const offX = (rackCols > 1) ? 0.042 : 0, offY = (rackRows > 1) ? 0.095 : 0;
        for (let r = 0; r < rackRows; r++) { for (let c = 0; c < rackCols; c++) {
            const clone = modelPrototype.clone(); clone.scale.set(sX, sY, sZ);
            clone.position.set(c * (customConfig.width - offX), r * (customConfig.height - offY), 0);
            applyMat(clone, false); rackGroup.add(clone);
        }}
    } else { const single = modelPrototype.clone(); single.scale.set(sX, sY, sZ); applyMat(single, false); rackGroup.add(single); }
}

// ==========================================
// --- SECTION 5: CONTROLLER & LOGIC ROUTING ---
// ==========================================
async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search); const modelId = urlParams.get('id') || 'rak'; const loader = new GLTFLoader();
    document.getElementById('rackLayoutControls').style.display = 'block';
    document.querySelector('#rackLayoutControls .grid').innerHTML = `
        <div id="colWrapper"><label class="block text-gray-600 text-sm font-medium mb-3">Kolom (<span id="rackColsValue">${rackCols}</span>)</label><input type="number" id="rackCols" min="1" max="10" value="${rackCols}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div>
        <div id="rowWrapper"><label id="rowLabel" class="block text-gray-600 text-sm font-medium mb-3">Baris (<span id="rackRowsValue">${rackRows}</span>)</label><input type="number" id="rackRows" min="1" max="10" value="${rackRows}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div>
    `;
    if (modelId === 'hiro_drawer') await initHiro(loader); else if (modelId === 'lemari-kabinet') await initCabinet(loader); else await initStandard(loader, modelId);
}

function updateDisplay() {
    if (!modelPrototype) return; const currentStates = getInteractiveStates();
    if (rackGroup) mainCabinet.remove(rackGroup); rackGroup = new THREE.Group();
    if (productType === 'hiro') buildHiro(currentStates); else if (productType === 'lemari_kabinet') buildCabinet(currentStates); else buildStandard();
    const finalBox = new THREE.Box3().setFromObject(rackGroup); const center = new THREE.Vector3(); finalBox.getCenter(center);
    rackGroup.position.set(-center.x, Math.abs(finalBox.min.y) + 0.01, -center.z);
    mainCabinet.add(rackGroup); updatePriceUI();
}

// ==========================================
// --- SECTION 6: CORE 3D ENGINE & UTILITIES ---
// ==========================================
async function init() { setupScene(); setupLights(); setupEnvironment(); mainCabinet = new THREE.Group(); scene.add(mainCabinet); await loadProduct(); setupEventListeners(); animate(); }

function setupScene() {
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x334155); scene.fog = new THREE.Fog(0x334155, 20, 100); 
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000); camera.position.set(0, 1.2, 5);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.3;
    container.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(0, 0.8, 0);
    raycaster = new THREE.Raycaster(); mouse = new THREE.Vector2();
}

function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.9)); scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    const spotlight = new THREE.DirectionalLight(0xffffff, 1.2); spotlight.position.set(5, 10, 7); spotlight.castShadow = true; spotlight.shadow.mapSize.set(2048, 2048); scene.add(spotlight);
}

function setupEnvironment() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8, metalness: 0.1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(50, 50, 0x94a3b8, 0x475569); grid.position.y = 0.001; scene.add(grid);
}

function getObjectInfo(obj) { const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size); return { height: size.y, minY: box.min.y, maxY: box.max.y }; }

function getInteractiveStates() {
    const states = { drawer: {}, laci: {}, cabinet: {} }; if (!rackGroup) return states;
    rackGroup.traverse(n => { if (n.userData && n.userData.isOpen) {
        if (n.userData.type === 'drawer') states.drawer[n.userData.id] = true;
        else if (n.userData.type === 'laci') states.laci[n.userData.id] = true;
        else if (n.userData.type === 'cabinet_door') states.cabinet[n.userData.id] = true;
    }}); return states;
}

function setupEventListeners() {
    ['width', 'height', 'depth'].forEach(id => { const el = document.getElementById(id); if(el) el.oninput = (e) => { customConfig[id] = parseFloat(e.target.value) / 100; document.getElementById(id + 'Value').textContent = e.target.value; updateDisplay(); }; });
    window.addEventListener('pointermove', (event) => {
        const rect = renderer.domElement.getBoundingClientRect(); mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObjects(rackGroup?.children || [], true);
        let isHover = false;
        if (intersects.length > 0) { let t = intersects[0].object; while(t.parent && t.parent !== rackGroup) { if(t.userData?.canOpen) { isHover = true; break; } t = t.parent; } }
        container.style.cursor = isHover ? 'pointer' : 'default';
    });
    window.addEventListener('pointerdown', () => {
        if(!rackGroup) return; raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObjects(rackGroup.children, true);
        if (intersects.length > 0) { let t = intersects[0].object; while(t && t !== rackGroup) { if (t.userData?.canOpen) { t.userData.isOpen = !t.userData.isOpen; break; } t = t.parent; } }
    });
}

function applyMat(obj, isHiro) {
    obj.traverse(n => { 
        if (n.isMesh) { 
            n.castShadow = n.receiveShadow = true; 
            if (n.material) { 
                n.material = n.material.clone(); 
                n.material.side = THREE.DoubleSide; n.material.transparent = false; n.material.opacity = 1.0;
                const r = n.material.color.r, g = n.material.color.g, b = n.material.color.b;
                const isGrey = (Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05 && r < 0.85); 
                const isKnobName = (n.name + " " + n.material.name).toLowerCase().match(/handle|knob|gagang|kenop|abu|grey|bulat/);
                if (!isGrey && !isKnobName) { n.material.color.set(currentColor); }
                if (isHiro) { n.material.roughness = 0.5; n.material.metalness = 0.1; } 
                n.material.needsUpdate = true; 
            } 
        } 
    });
}

window.appChangeColor = (color) => { currentColor = color; if (rackGroup) applyMat(rackGroup, productType === 'hiro' || productType === 'lemari_kabinet'); };

function updatePriceUI() { const count = (productType === 'hiro') ? (numDrawer + numLaci) : (productType === 'lemari_kabinet') ? numCabinetRows : (rackCols * rackRows); const finalPrice = (productType === 'cabinet' ? 1 : (count || 1)) * PRICE_PER_UNIT; document.getElementById('totalPrice').textContent = `Rp${finalPrice.toLocaleString('id-ID')}`; }
function updateUIValues(w, h, d) { document.getElementById('widthValue').innerText = Math.round(w); document.getElementById('heightValue').innerText = Math.round(h); document.getElementById('depthValue').innerText = Math.round(d); document.getElementById('width').value = w; document.getElementById('height').value = h; document.getElementById('depth').value = d; }
function focusCamera(dist) { const box = new THREE.Box3().setFromObject(mainCabinet); const center = new THREE.Vector3(); const size = new THREE.Vector3(); box.getCenter(center); box.getSize(size); controls.target.copy(center); camera.position.set(0, center.y, dist || Math.max(size.x, size.y) * 2.5); controls.update(); }

function animate() { 
    requestAnimationFrame(animate); 
    if (rackGroup) rackGroup.traverse(c => {
        if (c.userData?.canOpen) {
            if (c.userData.type === 'cabinet_door') c.rotation.y = THREE.MathUtils.lerp(c.rotation.y, c.userData.isOpen ? c.userData.openRotation : c.userData.baseRotation, LERP_SPEED);
            else c.position.z = THREE.MathUtils.lerp(c.position.z, c.userData.isOpen ? c.userData.openZ : c.userData.baseZ, LERP_SPEED);
        }
    });
    controls.update(); renderer.render(scene, camera); 
}

init();