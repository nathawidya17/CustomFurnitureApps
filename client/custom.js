import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// --- KONFIGURASI GLOBAL ---
const container = document.getElementById('canvas-area');
const PRICE_PER_UNIT = 200000;
const LERP_SPEED = 0.1;

// --- STATE APLIKASI ---
let productType = 'rack';
let customConfig = { width: 1.2, height: 1.5, depth: 1.0 };
let rackCols = 2, rackRows = 3;
let numDrawer = 2, numLaci = 1, numCabinetRows = 3;

// --- 3D CORE VARIABLES ---
let scene, camera, renderer, controls, raycaster, mouse;
let mainCabinet, rackGroup, modelPrototype, modelOriginalBox;

// --- ASSETS CONTAINER ---
const hiroParts = { frame: null, laci: null, drawer: null, feet: null };
const cabinetParts = { frame: null, door: null };

/**
 * Inisialisasi awal aplikasi
 */
async function init() {
    setupScene();
    setupLights();
    setupEnvironment();
    
    mainCabinet = new THREE.Group();
    scene.add(mainCabinet);

    await loadProduct();
    setupEventListeners();
    
    animate();
}

/**
 * Pengaturan Scene, Kamera, dan Renderer
 */
function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);
    scene.fog = new THREE.Fog(0xf0f2f5, 20, 100);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.2, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.3;
    
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.8, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
}

/**
 * Pengaturan Pencahayaan
 */
function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    
    const spotlight = new THREE.DirectionalLight(0xffffff, 1.2);
    spotlight.position.set(5, 10, 7);
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.set(2048, 2048);
    scene.add(spotlight);
}

/**
 * Pengaturan Lantai dan Grid
 */
function setupEnvironment() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.8, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(50, 50, 0xbdc3c7, 0xdcdde1);
    grid.position.y = 0.001;
    scene.add(grid);
}

/**
 * Memuat model berdasarkan ID di URL
 */
async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const modelId = urlParams.get('id') || 'rak';
    const loader = new GLTFLoader();

    // Reset UI Layout Controls (Injecting HTML)
    const layoutContainer = document.querySelector('#rackLayoutControls .grid');
    document.getElementById('rackLayoutControls').style.display = 'block';
    
    layoutContainer.innerHTML = `
        <div id="colWrapper">
            <label class="block text-gray-600 text-sm font-medium mb-3">Kolom (<span id="rackColsValue">2</span>)</label>
            <input type="number" id="rackCols" min="1" max="10" value="2" class="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none">
        </div>
        <div id="rowWrapper">
            <label id="rowLabel" class="block text-gray-600 text-sm font-medium mb-3">Baris (<span id="rackRowsValue">3</span>)</label>
            <input type="number" id="rackRows" min="1" max="10" value="3" class="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none">
        </div>
    `;

    if (modelId === 'hiro_drawer') {
        await initHiro(loader);
    } else if (modelId === 'lemari-kabinet') {
        await initCabinet(loader);
    } else {
        await initStandard(loader, modelId);
    }
}

/**
 * Logika Inisialisasi Produk HIRO
 */
async function initHiro(loader) {
    productType = 'hiro';
    customConfig = { width: 0.8, height: 1.0, depth: 0.5 };
    updateUIValues(80, 100, 50, 2, 3);
    
    // Custom UI for Hiro
    document.getElementById('colWrapper').querySelector('label').innerHTML = `Tambah Drawer (<span id="drawerVal">${numDrawer}</span>)`;
    const inputDrawer = document.getElementById('rackCols');
    inputDrawer.id = 'inputDrawer';
    inputDrawer.value = numDrawer;

    document.getElementById('rowWrapper').querySelector('label').innerHTML = `Tambah Laci (<span id="laciVal">${numLaci}</span>)`;
    const inputLaci = document.getElementById('rackRows');
    inputLaci.id = 'inputLaci';
    inputLaci.value = numLaci;

    try {
        const [f, dw, lc, ft] = await Promise.all([
            loader.loadAsync('./models/frame-hiro-drawer.glb'),
            loader.loadAsync('./models/drawer-hiro-drawer.glb'),
            loader.loadAsync('./models/laci-hiro-drawer.glb'),
            loader.loadAsync('./models/kaki-hiro-drawer.glb')
        ]);
        
        hiroParts.frame = f.scene;
        hiroParts.drawer = dw.scene; 
        hiroParts.laci = lc.scene;
        hiroParts.feet = ft.scene;    
        
        modelPrototype = hiroParts.frame;
        modelOriginalBox = new THREE.Box3().setFromObject(hiroParts.frame);

        updateDisplay();
        focusCamera(9);

        document.getElementById('inputDrawer').oninput = (e) => { 
            numDrawer = parseInt(e.target.value) || 0; 
            document.getElementById('drawerVal').innerText = numDrawer; 
            updateDisplay(); 
        };
        document.getElementById('inputLaci').oninput = (e) => { 
            numLaci = parseInt(e.target.value) || 0; 
            document.getElementById('laciVal').innerText = numLaci; 
            updateDisplay(); 
        };
    } catch (e) { console.error("Hiro Load Error:", e); }
}

/**
 * Logika Inisialisasi Produk KABINET
 */
async function initCabinet(loader) {
    productType = 'lemari_kabinet';
    customConfig = { width: 0.6, height: 0.6, depth: 0.4 };
    
    document.getElementById('colWrapper').style.display = 'none';
    document.getElementById('rowWrapper').querySelector('label').innerHTML = `Jumlah Lemari (<span id="rowVal">${numCabinetRows}</span>)`;
    const inputRow = document.getElementById('rackRows');
    inputRow.value = numCabinetRows;

    try {
        const [f, p] = await Promise.all([
            loader.loadAsync('./models/frame-lemari-kabinet.glb'),
            loader.loadAsync('./models/pintu-lemari-kabinet.glb')
        ]);
        
        cabinetParts.frame = f.scene;
        cabinetParts.door = p.scene;
        modelPrototype = f.scene;
        modelOriginalBox = new THREE.Box3().setFromObject(f.scene);

        updateDisplay();
        focusCamera();

        inputRow.oninput = (e) => {
            numCabinetRows = parseInt(e.target.value) || 1;
            document.getElementById('rowVal').innerText = numCabinetRows;
            updateDisplay();
        };
    } catch (e) { console.error("Cabinet Load Error:", e); }
}

/**
 * Logika Inisialisasi Produk STANDAR (Rak/Lemari Kayu)
 */
async function initStandard(loader, modelId) {
    productType = 'rack';
    let modelPath = './models/rakfix.glb';
    
    if (modelId === 'lemari') {
        modelPath = './models/lemari.glb';
        productType = 'cabinet';
        customConfig = { width: 1.2, height: 1.8, depth: 0.6 };
        updateUIValues(120, 180, 60, 1, 1);
    }

    const colInput = document.getElementById('rackCols');
    const rowInput = document.getElementById('rackRows');

    if (colInput) {
        colInput.oninput = (e) => {
            rackCols = parseInt(e.target.value) || 1;
            document.getElementById('rackColsValue').innerText = rackCols;
            updateDisplay();
        };
    }
    if (rowInput) {
        rowInput.oninput = (e) => {
            rackRows = parseInt(e.target.value) || 1;
            document.getElementById('rackRowsValue').innerText = rackRows;
            updateDisplay();
        };
    }

    loader.load(modelPath, (gltf) => {
        modelPrototype = gltf.scene;
        modelOriginalBox = new THREE.Box3().setFromObject(modelPrototype);
        updateDisplay();
        focusCamera();
    });
}

/**
 * Update visualisasi 3D di scene
 */
function updateDisplay() {
    if (!modelPrototype) return;

    // Simpan status open/close saat ini agar tidak ter-reset
    const currentStates = getInteractiveStates();

    if (rackGroup) mainCabinet.remove(rackGroup);
    rackGroup = new THREE.Group();

    if (productType === 'hiro') {
        buildHiro(currentStates);
    } else if (productType === 'lemari_kabinet') {
        buildCabinet(currentStates);
    } else {
        buildStandard();
    }

    // Auto-center rackGroup
    const finalBox = new THREE.Box3().setFromObject(rackGroup);
    const center = new THREE.Vector3();
    finalBox.getCenter(center);
    rackGroup.position.set(-center.x, -finalBox.min.y, -center.z);
    
    mainCabinet.add(rackGroup);
    updatePriceUI();
}

/**
 * Helper: Membangun produk Hiro
 */
function buildHiro(states) {
    const feet = hiroParts.feet.clone();
    applyMat(feet, true);
    rackGroup.add(feet);

    const feetInfo = getObjectInfo(feet);
    let currentY = feetInfo.maxY + 0.04; 

    const frameRaw = getObjectInfo(hiroParts.frame);
    
    // Drawers
    for (let i = 0; i < numDrawer; i++) {
        const el = hiroParts.drawer.clone();
        const info = getObjectInfo(el);
        el.position.y = currentY - info.minY;
        const isOpen = states.drawer[i] || false;
        el.userData = { type: 'drawer', id: i, canOpen: true, isOpen, baseZ: 0, openZ: 0.9 };
        if (isOpen) el.position.z = 0.9;
        applyMat(el, true);
        rackGroup.add(el);
        currentY += info.height + 0.05; 
    }

    // Laci
    for (let j = 0; j < numLaci; j++) {
        const el = hiroParts.laci.clone();
        const info = getObjectInfo(el);
        el.position.y = currentY - info.minY;
        const isOpen = states.laci[j] || false;
        el.userData = { type: 'laci', id: j, canOpen: true, isOpen, baseZ: 0, openZ: 0.9 };
        if (isOpen) el.position.z = 0.9;
        applyMat(el, true);
        rackGroup.add(el);
        currentY += info.height + 0.005;
    }

    // Outer Frame (scaled)
    const frame = hiroParts.frame.clone();
    const targetH = Math.max(currentY - feetInfo.maxY, 0.5); 
    const scaleY = targetH / frameRaw.height;
    frame.scale.set(1, scaleY, 1);
    frame.position.y = feetInfo.maxY - (frameRaw.minY * scaleY);
    applyMat(frame, true); 
    rackGroup.add(frame);
}

/**
 * Helper: Membangun produk Kabinet
 */
function buildCabinet(states) {
    const size = new THREE.Vector3();
    modelOriginalBox.getSize(size);

    for (let i = 0; i < numCabinetRows; i++) {
        const unit = new THREE.Group();
        const frame = cabinetParts.frame.clone();
        applyMat(frame, true);
        unit.add(frame);

        const hinge = new THREE.Group();
        const door = cabinetParts.door.clone();
        applyMat(door, true);
        door.position.x = 0.3; 
        hinge.add(door);
        hinge.position.set(-0.3, 0, customConfig.depth / 2);

        const isOpen = states.cabinet[i] || false;
        hinge.userData = { 
            type: 'cabinet_door', id: i, canOpen: true, isOpen,
            baseRotation: 0, openRotation: -Math.PI / 1.5 
        };
        if (isOpen) hinge.rotation.y = hinge.userData.openRotation;
        
        unit.add(hinge);
        unit.position.y = i * size.y;
        rackGroup.add(unit);
    }
}

/**
 * Helper: Membangun produk Standar
 */
function buildStandard() {
    const size = new THREE.Vector3();
    modelOriginalBox.getSize(size);
    const sX = customConfig.width / size.x;
    const sY = customConfig.height / size.y;
    const sZ = customConfig.depth / size.z;

    if (productType === 'rack') {
        const offX = (rackCols > 1) ? 0.042 : 0;
        const offY = (rackRows > 1) ? 0.095 : 0;
        for (let r = 0; r < rackRows; r++) {
            for (let c = 0; c < rackCols; c++) {
                const clone = modelPrototype.clone();
                clone.scale.set(sX, sY, sZ);
                clone.position.set(c * (customConfig.width - offX), r * (customConfig.height - offY), 0);
                applyMat(clone, false);
                rackGroup.add(clone);
            }
        }
    } else {
        const single = modelPrototype.clone();
        single.scale.set(sX, sY, sZ);
        applyMat(single, false);
        rackGroup.add(single);
    }
}

/**
 * Mendapatkan info dimensi object
 */
function getObjectInfo(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    return { height: size.y, minY: box.min.y, maxY: box.max.y };
}

/**
 * Mengambil status interaktif objek (apakah laci/pintu sedang terbuka)
 */
function getInteractiveStates() {
    const states = { drawer: {}, laci: {}, cabinet: {} };
    if (!rackGroup) return states;

    rackGroup.traverse(n => {
        if (n.userData && n.userData.isOpen) {
            if (n.userData.type === 'drawer') states.drawer[n.userData.id] = true;
            else if (n.userData.type === 'laci') states.laci[n.userData.id] = true;
            else if (n.userData.type === 'cabinet_door') states.cabinet[n.userData.id] = true;
        }
    });
    return states;
}

/**
 * Setup Event Listeners (UI & Interaction)
 */
function setupEventListeners() {
    // Slider Dimensi
    ['width', 'height', 'depth'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.oninput = (e) => {
                customConfig[id] = parseFloat(e.target.value) / 100;
                document.getElementById(id + 'Value').textContent = e.target.value;
                updateDisplay();
            };
        }
    });

    // Mouse Interaction
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
}

function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(rackGroup?.children || [], true);
    
    let isHover = false;
    if (intersects.length > 0) {
        let target = intersects[0].object;
        while(target.parent && target.parent !== rackGroup) {
            if(target.userData?.canOpen) { isHover = true; break; }
            target = target.parent;
        }
    }
    container.style.cursor = isHover ? 'pointer' : 'default';
}

function onPointerDown() {
    if(!rackGroup) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(rackGroup.children, true);

    if (intersects.length > 0) {
        let target = intersects[0].object;
        while(target && target !== rackGroup) {
            if (target.userData?.canOpen) {
                target.userData.isOpen = !target.userData.isOpen;
                break;
            }
            target = target.parent;
        }
    }
}

/**
 * Utility: Material & Shadow Application
 */
function applyMat(obj, isHiro) {
    obj.traverse(n => {
        if (n.isMesh) {
            n.castShadow = n.receiveShadow = true;
            if (isHiro && n.material) {
                n.material.roughness = 0.5;
                n.material.metalness = 0.1; 
                n.material.needsUpdate = true;
            } else if (n.material) {
                n.material.color.set(0xffffff);
            }
        }
    });
}

function updatePriceUI() {
    const count = (productType === 'hiro') ? (numDrawer + numLaci) : 
                  (productType === 'lemari_kabinet') ? numCabinetRows : (rackCols * rackRows);
    const finalPrice = (productType === 'cabinet' ? 1 : (count || 1)) * PRICE_PER_UNIT;
    document.getElementById('totalPrice').textContent = `Rp${finalPrice.toLocaleString('id-ID')}`;
}

function updateUIValues(w, h, d) {
    document.getElementById('widthValue').innerText = Math.round(w);
    document.getElementById('heightValue').innerText = Math.round(h);
    document.getElementById('depthValue').innerText = Math.round(d);
    document.getElementById('width').value = w;
    document.getElementById('height').value = h;
    document.getElementById('depth').value = d;
}

function focusCamera(dist) {
    const box = new THREE.Box3().setFromObject(mainCabinet);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    controls.target.copy(center);
    const fitDistance = dist || Math.max(size.x, size.y) * 2.5;
    camera.position.set(0, center.y, fitDistance);
    controls.update();
}

/**
 * Animation Loop
 */
function animate() { 
    requestAnimationFrame(animate); 
    
    if (rackGroup) {
        rackGroup.traverse(child => {
            if (child.userData?.canOpen) {
                if (child.userData.type === 'cabinet_door') {
                    const target = child.userData.isOpen ? child.userData.openRotation : child.userData.baseRotation;
                    child.rotation.y = THREE.MathUtils.lerp(child.rotation.y, target, LERP_SPEED);
                } else {
                    const target = child.userData.isOpen ? child.userData.openZ : child.userData.baseZ;
                    child.position.z = THREE.MathUtils.lerp(child.position.z, target, LERP_SPEED);
                }
            }
        });
    }

    controls.update(); 
    renderer.render(scene, camera); 
}

init();