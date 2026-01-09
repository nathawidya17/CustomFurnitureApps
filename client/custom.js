import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById('canvas-area');

// State Default
let customConfig = { width: 1.2, height: 1.5, depth: 1.0 };
let rackCols = 2;
let rackRows = 3;
let productType = 'rack';
const PRICE_PER_UNIT = 200000;

// --- STATE KHUSUS HIRO ---
let numDrawer = 2; 
let numLaci = 1;

// Mapping Parts
let hiroParts = { frame: null, laci: null, drawer: null, feet: null }; 

// Variables for Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let scene, camera, renderer, controls, mainCabinet, modelPrototype, rackGroup, modelOriginalBox;

async function init() {
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
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
    scene.add(hemiLight);
    
    const spotlight = new THREE.DirectionalLight(0xffffff, 1.2);
    spotlight.position.set(5, 10, 7);
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 2048; 
    spotlight.shadow.mapSize.height = 2048;
    scene.add(spotlight);

    // --- LANTAI & GRID ---
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0xe5e7eb, 
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(50, 50, 0xbdc3c7, 0xdcdde1);
    grid.position.y = 0.001; 
    scene.add(grid);

    mainCabinet = new THREE.Group();
    scene.add(mainCabinet);

    loadProduct();
    setupEventListeners();
    
    // Interaction Listeners
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);

    animate();
}

async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const modelId = urlParams.get('id') || 'rak';
    const loader = new GLTFLoader();

    // UI Logic
    document.getElementById('rackLayoutControls').style.display = 'block';
    const layoutContainer = document.querySelector('#rackLayoutControls .grid');
    
    layoutContainer.innerHTML = `
        <div id="colWrapper">
            <label class="block text-gray-600 text-sm font-medium mb-3">Kolom (<span id="rackColsValue">2</span>)</label>
            <input type="number" id="rackCols" min="1" max="10" value="2" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none">
        </div>
        <div id="rowWrapper">
            <label id="rowLabel" class="block text-gray-600 text-sm font-medium mb-3">Baris (<span id="rackRowsValue">3</span>)</label>
            <input type="number" id="rackRows" min="1" max="10" value="3" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none">
        </div>
    `;

    if (modelId === 'hiro_drawer') {
        productType = 'hiro';
        customConfig = { width: 0.8, height: 1.0, depth: 0.5 }; 
        updateUIValues(80, 100, 50, 2, 3);
        
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

            const box = new THREE.Box3().setFromObject(mainCabinet);
            const center = new THREE.Vector3();
            box.getCenter(center);
            
            camera.position.set(0, center.y + 1.2, 9); 
            controls.target.copy(center);
            controls.update();

            document.getElementById('inputDrawer').addEventListener('input', (e) => { 
                numDrawer = parseInt(e.target.value) || 0; 
                document.getElementById('drawerVal').innerText = numDrawer; 
                updateDisplay(); 
            });
            
            document.getElementById('inputLaci').addEventListener('input', (e) => { 
                numLaci = parseInt(e.target.value) || 0; 
                document.getElementById('laciVal').innerText = numLaci; 
                updateDisplay(); 
            });

        } catch (e) { console.error("Gagal muat Hiro:", e); }

    } else {
        // Rack Logic (Modular)
        productType = 'rack';
        let modelPath = './models/rakfix.glb';
        if (modelId.toLowerCase().includes('lemari')) {
            modelPath = './models/lemari.glb';
            productType = 'cabinet';
            customConfig = { width: 1.2, height: 1.8, depth: 0.6 };
            updateUIValues(120, 180, 60, 1, 1);
        }

        const colInput = document.getElementById('rackCols');
        const rowInput = document.getElementById('rackRows');

        if (colInput) {
            colInput.value = rackCols;
            colInput.addEventListener('input', (e) => {
                rackCols = parseInt(e.target.value) || 1;
                document.getElementById('rackColsValue').innerText = rackCols;
                updateDisplay();
            });
        }

        if (rowInput) {
            rowInput.value = rackRows;
            rowInput.addEventListener('input', (e) => {
                rackRows = parseInt(e.target.value) || 1;
                document.getElementById('rackRowsValue').innerText = rackRows;
                updateDisplay();
            });
        }

        loader.load(modelPath, (gltf) => {
            modelPrototype = gltf.scene;
            modelOriginalBox = new THREE.Box3().setFromObject(modelPrototype);
            updateDisplay();

            const box = new THREE.Box3().setFromObject(mainCabinet);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            controls.target.copy(center);
            const maxDim = Math.max(size.x, size.y);
            const fitDistance = maxDim * 2.5; 
            camera.position.set(0, center.y, fitDistance);
            controls.update();
        });
    }
}

function getObjectInfo(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    return { height: size.y, minY: box.min.y, maxY: box.max.y };
}

function updateDisplay() {
    if (!modelPrototype) return;

    // --- STEP 1: SAVE STATE SEBELUM MENGHAPUS OBJECT ---
    // Kita simpan status "isOpen" dari laci yang lama
    let drawerStates = {}; // Simpan status berdasarkan index
    let laciStates = {};

    if (rackGroup) {
        rackGroup.children.forEach(child => {
            // Cek apakah ini drawer/laci dan apakah terbuka
            if (child.userData && child.userData.isOpen) {
                if (child.userData.type === 'drawer') {
                    drawerStates[child.userData.id] = true;
                } else if (child.userData.type === 'laci') {
                    laciStates[child.userData.id] = true;
                }
            }
        });
        mainCabinet.remove(rackGroup);
    }

    rackGroup = new THREE.Group();

    if (productType === 'hiro') {
        const feetClone = hiroParts.feet.clone();
        applyMat(feetClone, true);
        rackGroup.add(feetClone);

        const feetInfo = getObjectInfo(feetClone);
        const baseThickness = 0.04; 
        let currentY = feetInfo.maxY + baseThickness; 
        
        const separator = hiroParts.frame.clone();
        const frameBoxRaw = getObjectInfo(hiroParts.frame);
        const sepScale = 0.02 / frameBoxRaw.height; 
        separator.scale.set(1, sepScale, 1);

        // --- A. DRAWERS (KERANJANG) ---
        for (let i = 0; i < numDrawer; i++) {
            const element = hiroParts.drawer.clone();
            const elInfo = getObjectInfo(element);
            
            element.position.y = currentY - elInfo.minY;
            applyMat(element, true);
            
            // Cek apakah sebelumnya terbuka di index ini?
            const wasOpen = drawerStates[i] || false;

            // UPDATE: Jarak buka jadi 0.9 (Lebih jauh)
            const openDist = 0.9;

            element.userData = { 
                type: 'drawer',    // Identitas
                id: i,             // Index urutan
                canOpen: true,     
                isOpen: wasOpen,   // Apply status lama
                baseZ: 0,          
                openZ: openDist
            };

            // Jika statusnya terbuka, langsung posisikan di depan (biar rapih/tidak nge-slide ulang)
            if (wasOpen) {
                element.position.z = openDist;
            }
            
            rackGroup.add(element);
            currentY += elInfo.height + 0.05; 
        }

        // --- B. LACI (BOX) ---
        for (let j = 0; j < numLaci; j++) {
            const lid = separator.clone();
            lid.position.y = currentY - (frameBoxRaw.minY * sepScale);
            applyMat(lid, true);
            rackGroup.add(lid);
            
            currentY += 0.02; 

            const element = hiroParts.laci.clone();
            const elInfo = getObjectInfo(element);
            
            element.position.y = currentY - elInfo.minY;
            applyMat(element, true);

            // Cek status lama
            const wasOpen = laciStates[j] || false;
            const openDist = 0.9;

            element.userData = { 
                type: 'laci',
                id: j,
                canOpen: true, 
                isOpen: wasOpen, 
                baseZ: 0, 
                openZ: openDist
            };

            if (wasOpen) {
                element.position.z = openDist;
            }

            rackGroup.add(element);
            currentY += elInfo.height + 0.005;
        }

        const frameClone = hiroParts.frame.clone();
        const frameInfo = getObjectInfo(hiroParts.frame);
        
        const contentHeight = currentY - feetInfo.maxY;
        const targetHeight = Math.max(contentHeight, 0.5); 
        
        const scaleY = targetHeight / frameInfo.height;
        frameClone.scale.set(1, scaleY, 1);
        frameClone.position.y = feetInfo.maxY - (frameInfo.minY * scaleY);

        applyMat(frameClone, true); 
        rackGroup.add(frameClone);

    } else {
        // --- LOGIC RAK MODULAR (Non-Interactive Opening) ---
        const frameSize = new THREE.Vector3();
        modelOriginalBox.getSize(frameSize);
        const scaleX = customConfig.width / frameSize.x;
        const scaleY = customConfig.height / frameSize.y;
        const scaleZ = customConfig.depth / frameSize.z;

        if (productType === 'rack') {
            const overlapX = (rackCols > 1) ? 0.042 : 0;
            const overlapY = (rackRows > 1) ? 0.095 : 0;
            for (let r = 0; r < rackRows; r++) {
                for (let c = 0; c < rackCols; c++) {
                    const clone = modelPrototype.clone(true);
                    clone.scale.set(scaleX, scaleY, scaleZ);
                    clone.position.set(c * (customConfig.width - overlapX), r * (customConfig.height - overlapY), 0);
                    applyMat(clone, false);
                    rackGroup.add(clone);
                }
            }
        } else {
            const single = modelPrototype.clone(true);
            single.scale.set(scaleX, scaleY, scaleZ);
            applyMat(single, false);
            rackGroup.add(single);
        }
    }

    const finalBox = new THREE.Box3().setFromObject(rackGroup);
    const center = new THREE.Vector3();
    finalBox.getCenter(center);
    rackGroup.position.set(-center.x, -finalBox.min.y, -center.z);
    
    mainCabinet.add(rackGroup);
    
    const count = (productType === 'hiro') ? (numDrawer + numLaci) : (rackCols * rackRows);
    const finalPrice = (productType === 'cabinet' ? 1 : (count || 1)) * PRICE_PER_UNIT;
    document.getElementById('totalPrice').textContent = `Rp${finalPrice.toLocaleString('id-ID')}`;
}

// --- INTERAKSI MOUSE ---

function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    if (rackGroup) {
        const intersects = raycaster.intersectObjects(rackGroup.children, true);
        let found = false;
        if (intersects.length > 0) {
            let target = intersects[0].object;
            while(target.parent && target.parent !== rackGroup) target = target.parent;
            if (target.userData && target.userData.canOpen) found = true;
        }
        container.style.cursor = found ? 'pointer' : 'default';
    }
}

function onPointerDown(event) {
    if(!rackGroup) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(rackGroup.children, true);

    if (intersects.length > 0) {
        let target = intersects[0].object;
        while(target.parent && target.parent !== rackGroup) target = target.parent;

        if (target.userData && target.userData.canOpen) {
            target.userData.isOpen = !target.userData.isOpen;
        }
    }
}

function applyMat(obj, isHiro) {
    obj.traverse(n => {
        if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
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

function updateUIValues(w, h, d, cols, rows) {
    document.getElementById('widthValue').innerText = Math.round(w);
    document.getElementById('heightValue').innerText = Math.round(h);
    document.getElementById('depthValue').innerText = Math.round(d);
    document.getElementById('width').value = w;
    document.getElementById('height').value = h;
    document.getElementById('depth').value = d;
}

function setupEventListeners() {
    ['width', 'height', 'depth'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', (e) => {
                customConfig[id] = parseFloat(e.target.value) / 100;
                document.getElementById(id + 'Value').textContent = e.target.value;
                updateDisplay();
            });
        }
    });
}

function animate() { 
    requestAnimationFrame(animate); 
    
    if (rackGroup) {
        rackGroup.children.forEach(child => {
            if (child.userData && child.userData.canOpen) {
                const targetZ = child.userData.isOpen 
                    ? child.userData.baseZ + child.userData.openZ 
                    : child.userData.baseZ;                       
                
                // Animasi halus setiap frame
                child.position.z = THREE.MathUtils.lerp(child.position.z, targetZ, 0.1);
            }
        });
    }

    controls.update(); 
    renderer.render(scene, camera); 
}

init();