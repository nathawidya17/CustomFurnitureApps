import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById('canvas-area');

// Inisialisasi variabel global
let customConfig = { width: 1.2, height: 1.5, depth: 1.0 };
let rackCols = 2;
let rackRows = 3;
let productType = 'rack';
const PRICE_PER_UNIT = 200000;

let scene, camera, renderer, controls, mainCabinet, modelPrototype, rackGroup, modelOriginalBox;

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); 
    scene.fog = new THREE.Fog(0xf1f5f9, 10, 25);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(4, 3, 8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.2; 
    controls.zoomSpeed = 5.0; 
    controls.maxPolarAngle = Math.PI / 2.1; 
    renderer.domElement.style.touchAction = 'none';

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const spotlight = new THREE.DirectionalLight(0xffffff, 1.2);
    spotlight.position.set(5, 10, 7);
    spotlight.castShadow = true;
    scene.add(spotlight);

    // --- LANTAI TEBAL (Agar tidak tembus) ---
    const groundGeo = new THREE.BoxGeometry(100, 1, 100); // Lantai setebal 1 meter
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    // Posisi Y di -2.0 karena tebal 1m, jadi permukaan atasnya tetap di -1.5
    ground.position.y = -2.0; 
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid tetap di permukaan lantai
    const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee);
    grid.position.y = -1.495; 
    scene.add(grid);

    mainCabinet = new THREE.Group();
    scene.add(mainCabinet);

    loadProduct();
    setupEventListeners();
    animate();
}

function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const modelId = urlParams.get('id') || 'rak';

    let modelPath = './models/rak.glb';
    
    // BEDAKAN DEFAULT LEMARI DAN RAK
    if (modelId.toLowerCase().includes('lemari')) {
        modelPath = './models/lemari.glb';
        productType = 'cabinet';
        customConfig = { width: 1.2, height: 1.8, depth: 0.6 }; // Default Lemari
        updateUIValues(120, 180, 60, 1, 1);
        document.getElementById('rackLayoutControls').style.display = 'none';
    } else {
        modelPath = './models/rak.glb';
        productType = 'rack';
        customConfig = { width: 1.2, height: 1.5, depth: 1.0 }; // Default Rak
        updateUIValues(120, 150, 100, 2, 3);
        document.getElementById('rackLayoutControls').style.display = 'block';
    }

    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        modelOriginalBox = new THREE.Box3().setFromObject(model);
        modelPrototype = model;
        updateDisplay();
    }, undefined, (err) => console.error("Gagal muat:", err));
}

function updateUIValues(w, h, d, cols, rows) {
    // Sinkronkan Slider & Angka di HTML
    const set = (id, val) => {
        const el = document.getElementById(id);
        const txt = document.getElementById(id + 'Value');
        if(el) el.value = val;
        if(txt) txt.textContent = val;
    };
    set('width', w); set('height', h); set('depth', d);
    set('rackCols', cols); set('rackRows', rows);
    rackCols = cols; rackRows = rows;
}

function updateDisplay() {
    if (!modelPrototype) return;
    if (rackGroup) mainCabinet.remove(rackGroup);

    rackGroup = new THREE.Group();
    const origSize = new THREE.Vector3();
    modelOriginalBox.getSize(origSize);

    if (productType === 'rack') {
        const overlapX = (rackCols > 1) ? 0.042 : 0;
        const overlapY = (rackRows > 1) ? 0.095 : 0;
        const spacingW = customConfig.width - overlapX;
        const spacingH = customConfig.height - overlapY;

        for (let r = 0; r < rackRows; r++) {
            for (let c = 0; c < rackCols; c++) {
                const clone = modelPrototype.clone(true);
                clone.scale.set(customConfig.width/origSize.x, customConfig.height/origSize.y, customConfig.depth/origSize.z);
                clone.position.set(c * spacingW, r * spacingH, 0);
                clone.traverse(n => { 
                    if (n.isMesh) { 
                        n.castShadow = true; 
                        n.receiveShadow = true; 
                    } 
                });
                rackGroup.add(clone);
            }
        }
    } else {
        const single = modelPrototype.clone(true);
        single.scale.set(customConfig.width/origSize.x, customConfig.height/origSize.y, customConfig.depth/origSize.z);
        single.position.set(0, 0, 0);
        single.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        rackGroup.add(single);
    }

    // --- PERBAIKAN POSISI AGAR LEBIH KE ATAS ---
    const box = new THREE.Box3().setFromObject(rackGroup);
    const center = new THREE.Vector3();
    box.getCenter(center);

    rackGroup.position.x = -center.x; 
    rackGroup.position.z = -center.z;
    
    // gridLevel adalah permukaan lantai Anda (-1.5)
    // Ditambahkan offset 0.02 agar rak benar-benar "duduk" di atas grid tanpa tembus
    const gridLevel = -1.5;
    const offsetKeAtas = 0.02; 
    rackGroup.position.y = -box.min.y + gridLevel + offsetKeAtas; 
    
    mainCabinet.add(rackGroup);
    
    // Update target kamera agar fokus ke tengah rak
    const currentHeight = box.max.y - box.min.y;
    controls.target.set(0, (currentHeight / 2) + gridLevel, 0);

    const multiplier = (productType === 'rack') ? (rackCols * rackRows) : 1;
    document.getElementById('totalPrice').textContent = `Rp${(multiplier * PRICE_PER_UNIT).toLocaleString('id-ID')}`;
}

function setupEventListeners() {
    ['width', 'height', 'depth', 'rackCols', 'rackRows'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById(id + 'Value').textContent = val;
            if (id === 'rackCols') rackCols = val;
            else if (id === 'rackRows') rackRows = val;
            else customConfig[id] = val / 100;
            updateDisplay();
        });
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

init();