import * as THREE from "../node_modules/three/build/three.module.js";
import { OrbitControls } from "../node_modules/three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DRenderer, CSS2DObject } from "../node_modules/three/examples/jsm/renderers/CSS2DRenderer.js";

const RACK_THICKNESS = 0.05; 
const SHELF_COLOR = 0x8b4513; // Cokelat (Wood)

// State saat ini dari rak
let customConfig = {
    width: 1.0,
    height: 1.5,
    depth: 0.5,
    shelvesCount: 0 // Jumlah rak pembagi
};

let mainCabinet;
let loadedModel = null; // reference to the GLB scene once loaded
let modelOriginalBox = null; // Box3 of the original model (pre-scale)
let targetScale = new THREE.Vector3(1,1,1);
let targetPosition = new THREE.Vector3(0,0,0);
let placeholderMesh = null;
let shelvesGroup = null;
let floorMesh = null; // floor plane (removed — no procedural floor)


// Currently selected model entry / path
let currentModelEntry = null;
let currentModelPath = null;
let isRackMode = false;
let rackSegments = 1;
let userChangedConfig = false; // becomes true once user moves sliders
let rackCols = 1; // horizontal stacking
let rackRows = 1; // vertical stacking
let rackGroup = null;
let modelPrototype = null;

// Labels
let labels = []; // CSS2DObject instances
function clearLabels() {
    labels.forEach(l => {
        if (l.parent) l.parent.remove(l);
    });
    labels = [];
}
function createLabel(text, extraClass = '') {
    const div = document.createElement('div');
    div.className = 'label';
    if (extraClass) div.classList.add(extraClass);
    div.textContent = text;
    return new CSS2DObject(div);
}
function addLabelsForModule(target, w, h, d) {
    clearLabels();

    // =====================
    // WIDTH — ATAS MODEL
    // =====================
    const widthLabel = createLabel(`Width: ${Math.round(w * 100)} cm`);
    widthLabel.position.set(0, h / 2 + 0.12, 0);
    target.add(widthLabel);
    labels.push(widthLabel);

    // =====================
    // HEIGHT — SAMPING KIRI
    // =====================
    const heightLabel = createLabel(`Height: ${Math.round(h * 100)} cm`, 'vertical');
    heightLabel.position.set(-w / 2 - 0.15, 0, 0);
    target.add(heightLabel);
    labels.push(heightLabel);

    // =====================
    // DEPTH — BAWAH MODEL
    // =====================
    const depthLabel = createLabel(`Depth: ${Math.round(d * 100)} cm`);
    depthLabel.position.set(0, -h / 2 - 0.15, 0);
    target.add(depthLabel);
    labels.push(depthLabel);
}

function addLabelsForRackGroup(group, cols, rows, w, h, d) {
    clearLabels();
    // Per-module small labelske (height and depth)
    group.children.forEach(child => {
        const centerLabel = createLabel(`${Math.round(h*100)} cm`);
        centerLabel.position.set(0, 0, d/2 + 0.04);
        child.add(centerLabel);
        labels.push(centerLabel);

        const innerLabel = createLabel(`${Math.round(d*100)} cm`);
        innerLabel.position.set(0, -h/2 + 0.06, d/2 - 0.02);
        child.add(innerLabel);
        labels.push(innerLabel);
    });

    // Total width label at top center of assembly
    const totalWidth = cols * w;
    const totalHeight = rows * h;
    const totalLabel = createLabel(`Width: ${Math.round(totalWidth*100)} cm`);
    totalLabel.position.set(0, totalHeight/2 + 0.06, 0);
    group.add(totalLabel);
    labels.push(totalLabel);
}
function refreshLabels() {
    if (rackGroup) {
        addLabelsForRackGroup(rackGroup, rackCols, rackRows, customConfig.width, customConfig.height, customConfig.depth);
    } else if (loadedModel) {
        addLabelsForModule(loadedModel, customConfig.width, customConfig.height, customConfig.depth);
    } else {
        clearLabels();
    }
} 
// Camera behavior: allow a one-time auto-fit when a model loads, then keep camera steady
let cameraAutoFitEnabled = true; // when false, adjustCameraPosition() will be a no-op unless forced
let cameraMinDistance = 4.0; // keep camera a bit farther back by default

// Raycasting / door interaction
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const doorControllers = []; // {mesh, pivot, isOpen, targetAngle, openAngle}
const doorMeshes = [];

const scene = new THREE.Scene();

// ======================
// SCENE SETUP
// ======================
// Keep a neutral white background (no textured wall)
scene.background = new THREE.Color(0xffffff);



const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(2, 2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// CSS2D Renderer for HTML labels (measurements)
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.update();

// LIGHTING
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// Debug helpers: axes + grid to help locate the model
const axesHelper = new THREE.AxesHelper(0.6);
scene.add(axesHelper);
const grid = new THREE.GridHelper(5, 10, 0xdddddd, 0xeeeeee);
grid.position.y = -1.0; // floor reference
scene.add(grid);

// ======================
// GEOMETRY GENERATION
// ======================

function createPart(w, h, d, x, y, z, color, name) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    return mesh;
}

function buildMainCabinet() {
    // Pastikan grup utama dibuat sekali
    if (!mainCabinet) {
        mainCabinet = new THREE.Group();
        scene.add(mainCabinet);
    }

    // Pastikan ada grup untuk rak agar kita bisa update tanpa menghapus model
    if (!shelvesGroup) {
        shelvesGroup = new THREE.Group();
        shelvesGroup.name = 'ShelvesGroup';
        mainCabinet.add(shelvesGroup);
    }

    // Jika belum memuat model, mulai muat sekali saja
    if (!loadedModel) {
        loadMainModel();
    } else {
        // Jika model sudah ada, update target berdasarkan ukuran baru
        updateModelTargets();
        updateShelves();
    }
}

function showModelStatus(msg, isError=false) {
    let el = document.getElementById('modelStatus');
    if (!el) {
        el = document.createElement('div');
        el.id = 'modelStatus';
        Object.assign(el.style, {
            position: 'absolute',
            right: '12px',
            top: '12px',
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            borderRadius: '6px',
            fontFamily: 'sans-serif',
            zIndex: 999
        });
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = isError ? 'rgba(200,60,60,0.9)' : 'rgba(0,0,0,0.6)';
}

function loadMainModel() {
    console.log('INFO: starting loadMainModel...');
    showModelStatus('Loading model...');

    const selectedModelJSON = localStorage.getItem('selectedModel');
    let currentModelPath = './models/lemari.glb'; // default model
    if (selectedModelJSON) {
        const selectedModel = JSON.parse(selectedModelJSON);
        currentModelPath = selectedModel.file;
        isRackMode = selectedModel.type === 'rack';
        updateRackControlsVisibility();
    } else {
        console.warn('No model selected in localStorage, using default.');
    }

    const loader = new GLTFLoader();
    loader.load(
        currentModelPath,
        (gltf) => {
            const model = gltf.scene;

            // Simpan bbox asli (sebelum skala)
            model.updateMatrixWorld(true);
            modelOriginalBox = new THREE.Box3().setFromObject(model);
            console.log('DEBUG: modelOriginalBox computed', modelOriginalBox.min, modelOriginalBox.max);

            // Center model around origin for easier transforms
            const center = new THREE.Vector3();
            modelOriginalBox.getCenter(center);
            model.position.sub(center);

            // Tambahkan ke scene, tapi jangan dihilangkan saat resize
            loadedModel = model;
            loadedModel.visible = true;
            mainCabinet.add(loadedModel);

            // Keep a prototype (centered) for cloning when building stacked racks
            modelPrototype = model.clone(true);
            modelPrototype.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });

            // Build initial grid according to rackCols/rackRows (will keep original GLB shape)
            rebuildRackGrid();

            // Preserve the GLB's original shape for initial display (do not force cube transform)


            // Bounding box helper removed for a cleaner scene (was showing green/yellow outline)
            // If you need it for debugging later, re-enable by creating a Box3Helper as needed.


            // Set placeholder invisible if ada
            if (placeholderMesh) placeholderMesh.visible = false;

            // Hitung dan set target transforms sekarang
            updateModelTargets();

            // Set immediate transform to target to avoid jump on first render
            loadedModel.scale.copy(targetScale);
            loadedModel.position.copy(targetPosition);
            // Force an initial camera fit on model load
            adjustCameraPosition(true);
            // After initial fit, keep auto-fit enabled only until user customizes
            cameraAutoFitEnabled = true;
            // Apply shadow flags
            loadedModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Setup interactive doors (if any)
            try {
                setupDoorControllers();
            } catch (e) {
                console.warn('Door setup failed', e);
            }

            // Rekalkulasi rak
            updateShelves();

            console.log('✓ Model `lemari.glb` berhasil dimuat.');
            showModelStatus('Model loaded');
            adjustCameraPosition();

            // Reveal controls (now that a model is loaded)
            const controlsEl = document.getElementById('controls');
            if (controlsEl) controlsEl.style.display = 'flex';
        },
        (xhr) => {
            if (xhr.lengthComputable) {
                console.log(`Model loading: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
            }
        },
        (error) => {
            console.error('Gagal memuat lemari.glb:', error);
            showModelStatus('Gagal memuat lemari.glb', true);
            // Buat placeholder jika belum ada
            if (!placeholderMesh) {
                placeholderMesh = createPart(customConfig.width, customConfig.height, customConfig.depth, 0, 0, 0, 0xcccccc, 'PlaceholderCabinet');
                placeholderMesh.position.set(0,0,0);
                mainCabinet.add(placeholderMesh);
            }
            placeholderMesh.visible = true;
            // Set placeholder size to match desired dims immediately
            placeholderMesh.scale.set(1,1,1);
            placeholderMesh.scale.set(customConfig.width, customConfig.height, customConfig.depth);

            updateShelves();
            adjustCameraPosition();
        }
    );
}

function updateModelTargets() {
    // Special handling when rackGroup exists (multiple modules)
    if (rackGroup) {
        // Determine total assembly size based on counts and current customConfig
        const totalWidth = rackCols * customConfig.width;
        const totalHeight = rackRows * customConfig.height;
        // For assembled group we don't scale the group as a whole; each module is built at desired size
        targetScale.set(1,1,1);
        // Center the assembly and align bottom to -totalHeight/2 (so bottom rests at -totalHeight/2)
        const yCenter = -totalHeight / 2 + customConfig.height / 2;
        const zPos = customConfig.depth * 0.12;
        targetPosition.set(0, yCenter, zPos);

        // Position grid helper slightly below bottom if present
        const floorY = -totalHeight / 2;
        if (floorMesh) floorMesh.position.y = floorY - 0.001;
        if (grid) grid.position.y = (floorMesh ? floorMesh.position.y + 0.01 : floorY + 0.01);

        // No placeholder usage in multi-module mode
        if (placeholderMesh) placeholderMesh.visible = false;
        return;
    }

    // Jika tidak punya ukuran asli, gunakan ukuran custom sebagai fallback
    if (!modelOriginalBox) {
        // fallback: center origin and set target scale based on custom dims
        targetScale.set(customConfig.width, customConfig.height, customConfig.depth);
        targetPosition.set(0, -customConfig.height/2, customConfig.depth * 0.1);
        return;
    }

    const origSize = new THREE.Vector3();
    modelOriginalBox.getSize(origSize);

    const safe = (v) => (v && v > 0) ? v : 1;
    const scaleX = customConfig.width / safe(origSize.x);
    const scaleY = customConfig.height / safe(origSize.y);
    const scaleZ = customConfig.depth / safe(origSize.z);

    targetScale.set(scaleX, scaleY, scaleZ);

    // Compute bottom alignment: scaled min.y
    const scaledMinY = modelOriginalBox.min.y * scaleY;
    const desiredBottomY = -customConfig.height / 2;
    const yPos = desiredBottomY - scaledMinY; // position to bring bottom to desiredBottomY

    // Shift model slightly forward (towards camera) for nicer framing
    const zPos = customConfig.depth * 0.12;

    targetPosition.set(0, yPos, zPos);
    console.log('DEBUG: origSize', origSize.toArray(), 'scaleFactors', [scaleX, scaleY, scaleZ], 'targetScale', targetScale.toArray(), 'targetPos', targetPosition.toArray());

    // Place floor at the bottom Y so the model appears standing on it
    const floorY = -customConfig.height / 2;
    if (floorMesh) {
        floorMesh.position.y = floorY - 0.001; // tiny offset to avoid z-fighting
    }
    // align grid helper to the floor too
    if (grid) {
        grid.position.y = (floorMesh ? floorMesh.position.y + 0.01 : floorY + 0.01);
    }

    // If there's a placeholder, scale/place it smoothly too
    if (placeholderMesh) {
        placeholderMesh.scale.set(customConfig.width, customConfig.height, customConfig.depth);
        placeholderMesh.position.set(0, 0, 0);
    }
}

// Build stack/grid of rack modules from prototype and current counts
function rebuildRackGrid() {
    if (!modelPrototype) return;

    // Remove previous group if any
    if (rackGroup) {
        if (mainCabinet && mainCabinet.children.includes(rackGroup)) {
            mainCabinet.remove(rackGroup);
        }
        rackGroup = null;
    }

    // If counts are 1x1, restore a single prototype clone as the loadedModel
    if (rackCols === 1 && rackRows === 1) {
        // Remove any existing model instances (except shelvesGroup)
        if (loadedModel && mainCabinet && mainCabinet.children.includes(loadedModel)) {
            mainCabinet.remove(loadedModel);
        }
        // Create a fresh single clone from prototype and add it
        const single = modelPrototype.clone(true);
        single.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        mainCabinet.add(single);
        loadedModel = single;
        modelOriginalBox = new THREE.Box3().setFromObject(loadedModel);
        rackGroup = null;
        updateModelTargets();
        updateShelves();
        adjustCameraPosition();
        refreshLabels();
        return;
    }

    // Building a multi-module grid: remove any single model so it doesn't overlap
    if (loadedModel && mainCabinet && mainCabinet.children.includes(loadedModel)) {
        mainCabinet.remove(loadedModel);
    }

    // Build new group
    const g = new THREE.Group();
    const totalWidth = rackCols * customConfig.width;
    const totalHeight = rackRows * customConfig.height;

    for (let r = 0; r < rackRows; r++) {
        const yCenter = -totalHeight / 2 + customConfig.height / 2 + r * customConfig.height;
        for (let c = 0; c < rackCols; c++) {
            const xCenter = -totalWidth / 2 + customConfig.width / 2 + c * customConfig.width;
            const clone = modelPrototype.clone(true);
            // Scale clone to match customConfig
            if (modelOriginalBox) {
                const origSize = new THREE.Vector3(); modelOriginalBox.getSize(origSize);
                const safe = (v) => (v && v > 0) ? v : 1;
                const sX = customConfig.width / safe(origSize.x);
                const sY = customConfig.height / safe(origSize.y);
                const sZ = customConfig.depth / safe(origSize.z);
                clone.scale.set(sX, sY, sZ);
            }
            clone.position.set(xCenter, yCenter, customConfig.depth * 0.12);
            clone.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
            g.add(clone);
        }
    }

    rackGroup = g;
    mainCabinet.add(rackGroup);
    loadedModel = rackGroup; // so animate/adjustCamera uses the assembled group
    updateModelTargets();
    adjustCameraPosition();
    refreshLabels();
}

function updateShelves() {
    if (!shelvesGroup) return;

    // Clear existing shelves
    shelvesGroup.clear();

    // Create shelves with current config
    for (let i = 0; i < customConfig.shelvesCount; i++) {
        const { width, depth, height } = customConfig;
        const t = RACK_THICKNESS;
        const verticalSpace = (height - t * (customConfig.shelvesCount + 1)) / (customConfig.shelvesCount + 1);
        const yPosition = -height / 2 + t / 2 + (i + 1) * (verticalSpace + t) - t/2;

        const shelf = createPart(
            width - t,
            t,
            depth - t/2,
            0,
            yPosition,
            0,
            0x664228,
            `Shelf_${i}`
        );
        shelvesGroup.add(shelf);
    }
}

// -----------------------------
// Door interaction helpers
// -----------------------------
function setupDoorControllers() {
    if (!loadedModel || !modelOriginalBox) return;

    // Clear any existing controllers
    doorControllers.length = 0;
    doorMeshes.length = 0;

    const modelCenter = new THREE.Vector3();
    modelOriginalBox.getCenter(modelCenter);

    // Heuristics: find mesh children that look like doors (hinges) or drawers (sliders)
    loadedModel.traverse((node) => {
        if (!node.isMesh) return;
        const name = (node.name || '').toLowerCase();

        // Compute mesh box in world space
        const meshBox = new THREE.Box3().setFromObject(node);
        const meshSize = new THREE.Vector3();
        meshBox.getSize(meshSize);
        const meshCenter = new THREE.Vector3();
        meshBox.getCenter(meshCenter);

        const modelSize = new THREE.Vector3();
        modelOriginalBox.getSize(modelSize);

        // Distances to model sides (world coords)
        const distToMinX = Math.abs(meshBox.min.x - modelOriginalBox.min.x);
        const distToMaxX = Math.abs(meshBox.max.x - modelOriginalBox.max.x);
        const sideMargin = modelSize.x * 0.06; // 6% of width

        // Candidate: ROTATING DOOR (tall, thin, near side)
        const looksLikeDoorName = name.includes('door') || name.includes('pintu') || name.includes('panel') || name.includes('leaf');
        const looksLikeDoorShape = meshSize.y > modelSize.y * 0.45 && meshSize.x < modelSize.x * 0.6 && meshSize.z < modelSize.z * 0.35;

        if ((looksLikeDoorName || looksLikeDoorShape) && (distToMinX < sideMargin || distToMaxX < sideMargin)) {
            const hingeOnLeft = distToMinX < distToMaxX;
            const hingeX = hingeOnLeft ? meshBox.min.x : meshBox.max.x;
            const hingeWorld = new THREE.Vector3(hingeX, meshCenter.y, meshCenter.z);

            const pivot = new THREE.Object3D();
            pivot.name = `DoorPivot_${node.name || 'door'}`;
            // convert hingeWorld (world) to loadedModel local coords
            const hingeLocal = loadedModel.worldToLocal(hingeWorld.clone());
            pivot.position.copy(hingeLocal);
            loadedModel.add(pivot);

            // Use attach to preserve world transform when reparenting
            try {
                pivot.attach(node);
            } catch (e) {
                // fallback: manual reposition
                const meshWorldPos = node.getWorldPosition(new THREE.Vector3());
                pivot.add(node);
                node.position.copy(pivot.worldToLocal(meshWorldPos));
            }

            // Decide open angle (radians); open outward away from center (less than 90deg to avoid clipping)
            const openAngle = hingeOnLeft ? Math.PI * 0.6 : -Math.PI * 0.6;

            doorControllers.push({
                type: 'hinge',
                mesh: node,
                pivot: pivot,
                isOpen: false,
                targetAngle: 0,
                openAngle: openAngle,
            });

            doorMeshes.push(node);
            console.log('Door candidate (hinge):', node.name || '(unnamed)', 'hingeLeft?', hingeOnLeft, 'size', meshSize.toArray());
            return; // skip drawer detection
        }

        // Candidate: SLIDING DRAWER (wide, shallow, near front)
        const looksLikeDrawerShape = meshSize.x > modelSize.x * 0.3 && meshSize.y < modelSize.y * 0.6 && meshSize.z < modelSize.z * 0.5;
        const distToFront = Math.abs(meshCenter.z - loadedModel.getWorldPosition(new THREE.Vector3()).z);
        if (looksLikeDrawerShape) {
            // Determine outward direction along Z (world)
            const modelCenter = new THREE.Vector3();
            modelOriginalBox.getCenter(modelCenter);
            const outwardSign = (meshCenter.z >= modelCenter.z) ? 1 : -1;
            const outwardOffset = meshSize.z * 0.9 * outwardSign;

            // Save original local position
            const originalLocalPos = node.position.clone();

            doorControllers.push({
                type: 'drawer',
                mesh: node,
                originalLocalPos: originalLocalPos,
                isOpen: false,
                targetOffset: outwardOffset,
            });

            doorMeshes.push(node);
            console.log('Drawer candidate (slide):', node.name || '(unnamed)', 'size', meshSize.toArray(), 'outward', outwardSign);
            return;
        }

        // otherwise ignore
    });

    // Add pointer listeners to renderer dom
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
}

function onPointerMove(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(doorMeshes, true);
    if (intersects.length > 0) {
        document.body.style.cursor = 'pointer';
        // highlight first intersected mesh (simple emissive)
        const top = intersects[0].object;
        doorControllers.forEach(dc => {
            if (dc.mesh === top || dc.mesh === top.parent || dc.mesh === top.parent?.parent) {
                if (dc._hovered !== true) {
                    if (dc.mesh.material && dc.mesh.material.emissive) {
                        dc._oldEmissive = dc.mesh.material.emissive.clone();
                        dc.mesh.material.emissive.setHex(0x444444);
                    }
                    dc._hovered = true;
                }
            } else {
                if (dc._hovered) {
                    if (dc.mesh.material && dc._oldEmissive) dc.mesh.material.emissive.copy(dc._oldEmissive);
                    dc._hovered = false;
                }
            }
        });
    } else {
        document.body.style.cursor = '';
        doorControllers.forEach(dc => {
            if (dc._hovered) {
                if (dc.mesh.material && dc._oldEmissive) dc.mesh.material.emissive.copy(dc._oldEmissive);
                dc._hovered = false;
            }
        });
    }
}

function onPointerDown(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(doorMeshes, true);
    if (intersects.length === 0) return;

    const picked = intersects[0].object;
    // find controller for this mesh
    const controller = doorControllers.find(dc => dc.mesh === picked || dc.mesh === picked.parent || dc.mesh === picked.parent?.parent);
    if (!controller) return;

    controller.isOpen = !controller.isOpen;
    controller.targetAngle = controller.isOpen ? controller.openAngle : 0;
}


function placeShelf(index, totalShelves) {
    if (!mainCabinet) return;

    const { width, depth, height } = customConfig;
    const t = RACK_THICKNESS;
    
    // Hitung ruang vertikal antara rak
    const verticalSpace = (height - t * (totalShelves + 1)) / (totalShelves + 1);
    
    // Hitung posisi Y
    const yPosition = -height / 2 + t / 2 + (index + 1) * (verticalSpace + t) - t/2; 
    
    // Buat rak baru
    const shelf = createPart(
        width - t, 
        t, 
        depth - t/2, 
        0, 
        yPosition, 
        0, 
        0x664228,
        `Shelf_${index}`
    );
    
    mainCabinet.add(shelf);
}

window.addShelf = function() {
    customConfig.shelvesCount++;
    updateShelves();
    console.log(`➕ Total Rak Pembagi: ${customConfig.shelvesCount}`);
};

function adjustCameraPosition(force = false) {
    // Only auto-fit when enabled or when explicitly forced
    if (!force && !cameraAutoFitEnabled) return;

    // Prefer using the actual loaded model bounds (or placeholder if missing)
    const source = loadedModel || placeholderMesh;
    let center = new THREE.Vector3(0, 0, 0);
    let size = new THREE.Vector3(1, 1, 1);

    if (source) {
        const worldBox = new THREE.Box3().setFromObject(source);
        worldBox.getCenter(center);
        worldBox.getSize(size);
    } else {
        // fallback to config-derived center/size
        center.set(0, -customConfig.height / 2, 0);
        size.set(customConfig.width, customConfig.height, customConfig.depth);
    }

    // Set controls target to the true center of the object so it appears centered in view
    controls.target.copy(center);

    // Determine distance to fit the largest dimension using vertical fov
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180; // radians
    const distanceForFov = ((maxDim / 2) / Math.tan(fov / 2)) * 1.05; // small margin
    // Keep a slightly larger margin and respect cameraMinDistance so it's not too close
    const distance = Math.max(distanceForFov * 1.2, cameraMinDistance);

    // Place camera on +Z axis at the computed distance and exactly aligned vertically with the center
    const cameraPos = new THREE.Vector3(center.x, center.y, center.z + distance + 0.2);
    camera.position.copy(cameraPos);
    camera.lookAt(center);
    controls.update();

    console.log('DEBUG: adjustCameraPosition -> camera', camera.position.toArray(), 'target', controls.target.toArray());
} 

// ======================
// UI HANDLERS
// ======================

function updateRackControlsVisibility() {
    const el = document.getElementById('rackLayoutControls'); if (!el) return;
    el.style.display = isRackMode ? 'block' : 'none';
}

// Tambahkan pengamanan untuk memastikan DOM sudah dimuat
document.addEventListener('DOMContentLoaded', () => {
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const depthInput = document.getElementById('depth');
    const addShelfBtn = document.getElementById('addShelfBtn');

    const rackColsInput = document.getElementById('rackCols');
    const rackRowsInput = document.getElementById('rackRows');

    function updateDimensions() {
    customConfig.width = parseFloat(widthInput.value);
    customConfig.height = parseFloat(heightInput.value);
    customConfig.depth = parseFloat(depthInput.value);

    document.getElementById('widthValue').textContent = customConfig.width.toFixed(1);
    document.getElementById('heightValue').textContent = customConfig.height.toFixed(1);
    document.getElementById('depthValue').textContent = customConfig.depth.toFixed(2);

    userChangedConfig = true;
    cameraAutoFitEnabled = false;

    updateModelTargets();
    updateShelves();

    if (isRackMode && (rackCols > 1 || rackRows > 1)) {
        rebuildRackGrid();
    }

    // 🔥 PENTING: update label ukuran setiap kali custom berubah
    refreshLabels();
}


    widthInput.addEventListener('input', updateDimensions);
    heightInput.addEventListener('input', updateDimensions);
    depthInput.addEventListener('input', updateDimensions);
    addShelfBtn.addEventListener('click', window.addShelf);

    if (rackColsInput && rackRowsInput) {
        function updateRackValues() {
            rackCols = Math.max(1, parseInt(rackColsInput.value) || 1);
            rackRows = Math.max(1, parseInt(rackRowsInput.value) || 1);
            document.getElementById('rackColsValue').textContent = rackCols;
            document.getElementById('rackRowsValue').textContent = rackRows;
            userChangedConfig = true; // layout changes considered user action
            // when user manipulates layout, prevent auto-fit repositioning
            cameraAutoFitEnabled = false;
            rebuildRackGrid();
        }
        rackColsInput.addEventListener('input', updateRackValues);
        rackRowsInput.addEventListener('input', updateRackValues);
    }

    // Inisialisasi setelah UI dan DOM siap
    updateDimensions();
    buildMainCabinet();
});


// ======================
// ANIMATE LOOP
// ======================
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Smoothly lerp model/placeholder towards targets
  const lerpFactor = 0.12;
  if (loadedModel) {
    // Lerp scale
    loadedModel.scale.lerp(targetScale, lerpFactor);
    // Lerp position
    loadedModel.position.lerp(targetPosition, lerpFactor);
  } else if (placeholderMesh) {
    // Smoothly resize placeholder
    const targetScalePlaceholder = new THREE.Vector3(customConfig.width, customConfig.height, customConfig.depth);
    placeholderMesh.scale.lerp(targetScalePlaceholder, lerpFactor);
  }

  // Animate door pivots smoothly
  if (doorControllers.length) {
    doorControllers.forEach(dc => {
      if (dc.type === 'hinge') {
        const current = dc.pivot.rotation.y;
        const next = THREE.MathUtils.lerp(current, dc.targetAngle, 0.16);
        dc.pivot.rotation.y = next;
        if (Math.abs(next - dc.targetAngle) < 0.001) dc.pivot.rotation.y = dc.targetAngle;
      } else if (dc.type === 'drawer') {
        // Slide along local Z (outwards)
        const node = dc.mesh;
        const sign = Math.sign(dc.targetOffset || 1);
        const localOffset = new THREE.Vector3(0, 0, dc.isOpen ? dc.targetOffset : 0);
        // Convert localOffset (assuming along model local Z) to the node's parent's local space if needed. Simpler: lerp node.position.z
        const targetZ = dc.originalLocalPos.z + (dc.isOpen ? dc.targetOffset : 0);
        node.position.z = THREE.MathUtils.lerp(node.position.z, targetZ, 0.16);
        if (Math.abs(node.position.z - targetZ) < 0.001) node.position.z = targetZ;
      }
    });
  }

  renderer.render(scene, camera);
  // Render HTML labels on top
  labelRenderer.render(scene, camera);
}
animate();

// ======================
// RESIZE HANDLER
// ======================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});