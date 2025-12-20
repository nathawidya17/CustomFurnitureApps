import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById('canvas-area');

// Fungsi untuk menarik nilai langsung dari elemen HTML
const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) : 0;
};

// Inisialisasi variabel (Otomatis akan mengambil 1.2, 1.5, dan 1.0 dari HTML)
let customConfig = { 
    width: getVal('width') / 100, 
    height: getVal('height') / 100, 
    depth: getVal('depth') / 100 
};
let rackCols = getVal('rackCols');
let rackRows = getVal('rackRows');

const PRICE_PER_UNIT = 200000; 
let scene, camera, renderer, controls, mainCabinet, modelPrototype, rackGroup, modelOriginalBox;
let productType = 'rack';

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(3, 2, 6);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.zoomSpeed = 2.5;
    renderer.domElement.style.touchAction = 'none';

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

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
    if (modelId.toLowerCase().includes('lemari')) {
        modelPath = './models/lemari.glb';
        productType = 'cabinet';
        const layoutEl = document.getElementById('rackLayoutControls');
        if (layoutEl) layoutEl.style.display = 'none';
    } else {
        productType = 'rack';
        const layoutEl = document.getElementById('rackLayoutControls');
        if (layoutEl) layoutEl.style.display = 'block';
    }

    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        modelOriginalBox = new THREE.Box3().setFromObject(model);
        modelPrototype = model;
        
        // Langsung jalankan updateDisplay agar model sinkron dengan slider saat pertama load
        updateDisplay();
    }, undefined, (err) => {
        console.error("Gagal memuat model:", err);
    });
}

function updateDisplay() {
    if (!modelPrototype) return;
    if (rackGroup) mainCabinet.remove(rackGroup);

    rackGroup = new THREE.Group();
    const origSize = new THREE.Vector3();
    modelOriginalBox.getSize(origSize);

    if (productType === 'rack') {
        // Logika overlap hanya aktif jika kolom/baris > 1 agar tidak terpotong saat awal
        const overlapX = (rackCols > 1) ? 0.042 : 0;
        const overlapY = (rackRows > 1) ? 0.095 : 0;
        
        const spacingW = customConfig.width - overlapX;
        const spacingH = customConfig.height - overlapY;

        for (let r = 0; r < rackRows; r++) {
            for (let c = 0; c < rackCols; c++) {
                const clone = modelPrototype.clone(true);
                clone.scale.set(
                    customConfig.width / origSize.x,
                    customConfig.height / origSize.y,
                    customConfig.depth / origSize.z
                );
                clone.position.set(c * spacingW, r * spacingH, 0);
                clone.traverse(n => { if (n.isMesh) n.receiveShadow = false; });
                rackGroup.add(clone);
            }
        }
    } else {
        const single = modelPrototype.clone(true);
        single.scale.set(
            customConfig.width / origSize.x,
            customConfig.height / origSize.y,
            customConfig.depth / origSize.z
        );
        single.position.set(0, 0, 0);
        rackGroup.add(single);
    }

    const box = new THREE.Box3().setFromObject(rackGroup);
    const center = new THREE.Vector3();
    box.getCenter(center);
    rackGroup.position.sub(center);
    
    mainCabinet.add(rackGroup);
    
    const multiplier = (productType === 'rack') ? (rackCols * rackRows) : 1;
    const price = multiplier * PRICE_PER_UNIT;
    const priceEl = document.getElementById('totalPrice');
    if (priceEl) priceEl.textContent = `Rp${price.toLocaleString('id-ID')}`;
}

function setupEventListeners() {
    const inputs = ['width', 'height', 'depth', 'rackCols', 'rackRows'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                const display = document.getElementById(id + 'Value');
                if (display) display.textContent = val;

                if (id === 'rackCols') rackCols = val;
                else if (id === 'rackRows') rackRows = val;
                else customConfig[id] = val / 100;

                updateDisplay();
            });
        }
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