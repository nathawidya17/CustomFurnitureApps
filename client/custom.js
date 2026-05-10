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
let currentTexture = null; // null = pakai warna solid
let textureLoader = new THREE.TextureLoader();

let rackCols = 3, rackRows = 3; 
let numDrawer = 2, numLaci = 1;
let cabinetDoorTypes = Array(10).fill('left'); 

let lemariConfig = {
    leftRak: 1,
    rodPosition: 'atas', // Pilihan: 'tidak_ada', 'atas', 'tengah', 'atas_tengah'
    rightRakTop: 1,
    rightRakBottom: 1
};

// ==========================================
// --- SECTION 2: PRODUCT MODULE - HIRO ---
// ==========================================
const hiroParts = { frame: null, laci: null, drawer: null, feet: null };
const hiroRak2Parts = { 
    frameAtas: null, 
    frameBawah: null, 
    rak: null, 
    kaki: null, 
    drawer: null 
};
let numRak2Drawer = 2, numRak2Laci = 2;

async function initHiro(loader) {
    productType = 'hiro'; customConfig = { width: 0.8, height: 1.0, depth: 0.5 }; updateUIValues(80, 100, 50);
    try {
        const [f, dw, lc, ft] = await Promise.all([
            loader.loadAsync('./models/frame-hiro-drawer.glb'), loader.loadAsync('./models/drawer-hiro-drawer.glb'),
            loader.loadAsync('./models/laci-hiro-drawer.glb'), loader.loadAsync('./models/kaki-hiro-drawer.glb')
        ]);
        hiroParts.frame = f.scene; hiroParts.drawer = dw.scene; hiroParts.laci = lc.scene; hiroParts.feet = ft.scene;    
        modelPrototype = hiroParts.frame; modelOriginalBox = new THREE.Box3().setFromObject(hiroParts.frame);
        
        document.getElementById('inputDrawer').oninput = (e) => { numDrawer = parseInt(e.target.value) || 0; document.getElementById('drawerVal').innerText = numDrawer; updateDisplay(); };
        document.getElementById('inputLaci').oninput = (e) => { numLaci = parseInt(e.target.value) || 0; document.getElementById('laciVal').innerText = numLaci; updateDisplay(); };
        
        updateDisplay(); focusCamera(9);
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
async function initHiroRak2(loader) {
    productType = 'hiro_rak2drawer'; 
    customConfig = { width: 0.8, height: 1.2, depth: 0.5 }; 
    updateUIValues(80, 120, 50);
    try {
        const [fAtas, fBawah, rk, kk, dr] = await Promise.all([
            loader.loadAsync('./models/frameatashirorak2drawer.glb'),
            loader.loadAsync('./models/framebawahhirorak2drawer.glb'),
            loader.loadAsync('./models/rakhirorak2drawer.glb'),
            loader.loadAsync('./models/kakihirorak2drawer.glb'),
            loader.loadAsync('./models/drawerhirorak2drawer.glb'),
        ]);
        hiroRak2Parts.frameAtas  = fAtas.scene; 
        hiroRak2Parts.frameBawah = fBawah.scene; 
        hiroRak2Parts.rak        = rk.scene; 
        hiroRak2Parts.kaki       = kk.scene; 
        hiroRak2Parts.drawer     = dr.scene;
        modelPrototype   = fAtas.scene; 
        modelOriginalBox = new THREE.Box3().setFromObject(fAtas.scene);

        document.getElementById('inputDrawer').oninput = (e) => { 
            numRak2Drawer = Math.max(2, parseInt(e.target.value) || 2);
            document.getElementById('inputDrawer').value = numRak2Drawer;
            document.getElementById('drawerVal').innerText = numRak2Drawer; 
            updateDisplay(); 
        };
        document.getElementById('inputLaci').oninput = (e) => { 
            numRak2Laci = Math.max(1, parseInt(e.target.value) || 1);
            document.getElementById('inputLaci').value = numRak2Laci;
            document.getElementById('laciVal').innerText = numRak2Laci; 
            updateDisplay(); 
        };

        updateDisplay(); focusCamera(9);
    } catch (e) { console.error("HiroRak2 Load Error:", e); }
}

function buildHiroRak2(states) {
    const GAP = 0.016;    // gap antar drawer
    const RAK_GAP = 2; // gap antar laci dan frame bawah ke laci pertama

    // --- 1. KAKI ---
    const kaki = hiroRak2Parts.kaki.clone(); 
    applyMat(kaki, true); 
    rackGroup.add(kaki);
    const kakiInfo = getObjectInfo(kaki); 
    let currentY = kakiInfo.maxY + 0.005;

    // --- 2. FRAME BAWAH + DRAWER ---
    const frameBawahRaw = getObjectInfo(hiroRak2Parts.frameBawah);
    const drawerRaw     = getObjectInfo(hiroRak2Parts.drawer);

    const totalDrawerH = (drawerRaw.height * numRak2Drawer) + (GAP * (numRak2Drawer - 1));
    const scaleYBawah  = totalDrawerH / frameBawahRaw.height;

    const frameBawah = hiroRak2Parts.frameBawah.clone();
    frameBawah.scale.set(1, scaleYBawah, 1);
    frameBawah.position.y = currentY - (frameBawahRaw.minY * scaleYBawah);
    applyMat(frameBawah, true); 
    rackGroup.add(frameBawah);

    let drawerY = currentY;
    for (let i = 0; i < numRak2Drawer; i++) {
        const dr = hiroRak2Parts.drawer.clone(); 
        const info = getObjectInfo(dr);
        dr.position.y = drawerY - info.minY;
        const isOpen = states.drawer[`d_${i}`] || false;
        dr.userData = { type: 'drawer', id: `d_${i}`, canOpen: true, isOpen, baseZ: 0, openZ: 0.4 };
        if (isOpen) dr.position.z = 0.4;
        applyMat(dr, true); 
        rackGroup.add(dr);
        drawerY += info.height + GAP;
    }

    currentY += totalDrawerH + GAP;

    // --- 3. FRAME ATAS + LACI ---
    const frameAtasRaw = getObjectInfo(hiroRak2Parts.frameAtas);
    const rakRaw       = getObjectInfo(hiroRak2Parts.rak);

    // totalLaciH: setiap laci punya RAK_GAP di bawahnya + RAK_GAP terakhir di atas
    const totalLaciH = (rakRaw.height * numRak2Laci) + (RAK_GAP * (numRak2Laci + 1));
    const scaleYAtas = totalLaciH / frameAtasRaw.height;

    // Frame atas dimulai dari currentY
    const frameAtas = hiroRak2Parts.frameAtas.clone();
    frameAtas.scale.set(1, scaleYAtas, 1);
    frameAtas.position.y = currentY - (frameAtasRaw.minY * scaleYAtas);
    applyMat(frameAtas, true); 
    rackGroup.add(frameAtas);

    // Laci pertama mulai dari currentY + RAK_GAP (jarak dari frame bawah)
    let laciY = currentY + RAK_GAP;
    for (let j = 0; j < numRak2Laci; j++) {
        const rk = hiroRak2Parts.rak.clone(); 
        const info = getObjectInfo(rk);
        rk.position.y = laciY - info.minY;
        rk.userData = { type: 'laci', id: `l_${j}`, canOpen: false };
        applyMat(rk, true); 
        rackGroup.add(rk);
        laciY += info.height + RAK_GAP;
    }
}

// ==========================================
// --- SECTION 3: PRODUCT MODULE - CABINET ---
// ==========================================
const cabinetParts = { frame: null, doorLeft: null, doorRight: null, drawer: null };

async function initCabinet(loader) {
    productType = 'lemari_kabinet'; customConfig = { width: 0.6, height: 0.6, depth: 0.4 };
    rackCols = 2; rackRows = 3; 
    
    try {
        const [f, pL, pR, dr] = await Promise.all([ 
            loader.loadAsync('./models/frame-lemari-kabinet.glb'), 
            loader.loadAsync('./models/pintu-lemari-kabinet.glb'),
            loader.loadAsync('./models/pintu-lemari-kabinet-tarikkanan.glb'),
            loader.loadAsync('./models/pintu-lemari-kabinet-dorong.glb')
        ]);
        
        cabinetParts.frame = f.scene; cabinetParts.doorLeft = pL.scene; cabinetParts.doorRight = pR.scene; cabinetParts.drawer = dr.scene;
        modelPrototype = f.scene; modelOriginalBox = new THREE.Box3().setFromObject(f.scene);
        
        document.getElementById('rackCols').oninput = (e) => { rackCols = parseInt(e.target.value) || 1; document.getElementById('rackColsValue').innerText = rackCols; renderDoorControls(); updateDisplay(); };
        document.getElementById('rackRows').oninput = (e) => { rackRows = parseInt(e.target.value) || 1; document.getElementById('rackRowsValue').innerText = rackRows; updateDisplay(); };

        renderDoorControls(); updateDisplay(); focusCamera();
    } catch (e) { console.error("Cabinet Load Error:", e); }
}

function buildCabinet(states) {
    const size = new THREE.Vector3(); modelOriginalBox.getSize(size);
    const wallThick = 0.015; // Ketebalan dinding frame (1.5cm)
    
    // Offset supaya pas ditumpuk / dijejer frame-nya nggak jadi double tebal
    const overlapX = size.x - wallThick;
    const overlapY = size.y - wallThick;

    for (let r = 0; r < rackRows; r++) {
        for (let c = 0; c < rackCols; c++) {
            const unit = new THREE.Group(); const frame = cabinetParts.frame.clone(); applyMat(frame, true); unit.add(frame);
            const hinge = new THREE.Group(); const unitId = `${r}_${c}`; 
            const isOpen = states.cabinet[unitId] || false; const doorType = cabinetDoorTypes[c] || 'left'; 

            const fBox = new THREE.Box3().setFromObject(frame);
            const pivotZ = fBox.max.z;

            // Target ukuran pintu (lebar frame dikurangi kayu, ditambah sedikit overlap biar ga bolong)
            const targetW = size.x - 0.02; 
            const targetH = size.y - 0.02;
            const innerCenterY = (fBox.max.y + fBox.min.y) / 2;

            // WRAPPER ANTI OFFSIDE & ANTI BOLONG
            if (doorType === 'left') {
                const door = cabinetParts.doorLeft.clone(); applyMat(door, true);
                door.position.set(0, 0, 0); const dBox = new THREE.Box3().setFromObject(door); 
                const dW = dBox.max.x - dBox.min.x; const dH = dBox.max.y - dBox.min.y;
                
                // Pintu ditaruh di center wrapper
                door.position.set(-((dBox.max.x + dBox.min.x) / 2), -((dBox.max.y + dBox.min.y) / 2), -dBox.max.z);
                const doorWrapper = new THREE.Group(); doorWrapper.add(door);
                
                // Melarkan pintu dari titik tengah (center) agar rapat menutup lubang
                doorWrapper.scale.set(targetW / dW, targetH / dH, 1);
                
                // Engsel tetep di posisi asli, wrapper digeser ke kanan menutupi lubang
                const pivotX = fBox.min.x + wallThick; 
                hinge.position.set(pivotX, 0, pivotZ); 
                doorWrapper.position.set((targetW / 2) - 0.005, innerCenterY, 0); 
                
                hinge.userData = { type: 'cabinet_door', id: unitId, canOpen: true, isOpen, baseRotation: 0, openRotation: -Math.PI / 1.8 };
                if (isOpen) hinge.rotation.y = hinge.userData.openRotation; hinge.add(doorWrapper);
            } 
            else if (doorType === 'right') {
                const door = cabinetParts.doorRight.clone(); applyMat(door, true);
                door.position.set(0, 0, 0); const dBox = new THREE.Box3().setFromObject(door); 
                const dW = dBox.max.x - dBox.min.x; const dH = dBox.max.y - dBox.min.y;
                
                // Pintu ditaruh di center wrapper
                door.position.set(-((dBox.max.x + dBox.min.x) / 2), -((dBox.max.y + dBox.min.y) / 2), -dBox.max.z);
                const doorWrapper = new THREE.Group(); doorWrapper.add(door);
                
                // Melarkan pintu dari titik tengah (center) agar rapat menutup lubang
                doorWrapper.scale.set(targetW / dW, targetH / dH, 1);
                
                // Engsel tetep di posisi asli, wrapper digeser ke kiri menutupi lubang
                const pivotX = fBox.max.x - wallThick; 
                hinge.position.set(pivotX, 0, pivotZ); 
                doorWrapper.position.set(-(targetW / 2) + 0.005, innerCenterY, 0); 
                
                hinge.userData = { type: 'cabinet_door', id: unitId, canOpen: true, isOpen, baseRotation: 0, openRotation: Math.PI / 1.8 }; 
                if (isOpen) hinge.rotation.y = hinge.userData.openRotation; hinge.add(doorWrapper);
            } 
            else if (doorType === 'drawer') {
                const door = cabinetParts.drawer.clone(); applyMat(door, true);
                door.position.set(0, 0, 0); const dBox = new THREE.Box3().setFromObject(door);
                const dW = dBox.max.x - dBox.min.x; const dH = dBox.max.y - dBox.min.y;

                // Laci ditaruh di center wrapper
                door.position.set(-((dBox.max.x + dBox.min.x) / 2), -((dBox.max.y + dBox.min.y) / 2), -dBox.max.z);
                const doorWrapper = new THREE.Group(); doorWrapper.add(door);
                
                // Melarkan laci dari titik tengah
                doorWrapper.scale.set(targetW / dW, targetH / dH, 1);
                
                const centerX = (fBox.min.x + fBox.max.x) / 2; 
                hinge.position.set(centerX, 0, pivotZ); 
                doorWrapper.position.set(0, innerCenterY, 0); 
                
                hinge.userData = { type: 'cabinet_drawer', id: unitId, canOpen: true, isOpen, baseZ: pivotZ + 0.1, openZ: pivotZ + 2 };
                if (isOpen) hinge.position.z = hinge.userData.openZ; hinge.add(doorWrapper);
            }
            unit.add(hinge); 
            
            // FUNGSI ANTI-DOUBLE FRAME
            unit.position.set(c * overlapX, r * overlapY, 0); 
            rackGroup.add(unit);
        }
    }
}
// ==========================================
// --- SECTION 4: PRODUCT MODULE - LEMARI (WARDROBE) ---
// ==========================================
const lemariParts = { frame: null, doorLeft: null, doorRightTop: null, doorRightBottom: null, rak: null, rakKananAtas: null, rod: null };

async function initLemari(loader) {
    productType = 'lemari'; customConfig = { width: 1.2, height: 1.8, depth: 0.6 }; 
    try {
        const [f, dL, dRT, dRB, rk, rkTop, rd] = await Promise.all([ 
            loader.loadAsync('./models/framelemari2pintu.glb'), 
            loader.loadAsync('./models/pintulemari2kiri.glb'),
            loader.loadAsync('./models/pintulemari2kananatas.glb'),
            loader.loadAsync('./models/pintulemari2kananbawah.glb'),
            loader.loadAsync('./models/raklemari2pintu.glb'),
            loader.loadAsync('./models/rakkananataslemari2pintu.glb').catch(() => null),
            loader.loadAsync('./models/gantunganbajulemari2pintu.glb')
        ]);
        
        if (!f) return; 
        
        lemariParts.frame = f.scene; 
        lemariParts.doorLeft = dL.scene; 
        lemariParts.doorRightTop = dRT.scene;
        lemariParts.doorRightBottom = dRB.scene; 
        lemariParts.rak = rk.scene; 
        lemariParts.rakKananAtas = rkTop ? rkTop.scene : rk.scene;
        lemariParts.rod = rd.scene;
        modelPrototype = f.scene; modelOriginalBox = new THREE.Box3().setFromObject(f.scene);
        
        updateDisplay(); focusCamera();
    } catch (e) { console.error("Lemari Load Error. Pastikan file rak & gantungan ada!", e); }
}

function buildLemari(states) {
    if (!lemariParts.frame) return;
    const unit = new THREE.Group(); 
    const frame = lemariParts.frame.clone(); 
    applyMat(frame, true); unit.add(frame);
    
    const fBox = new THREE.Box3().setFromObject(frame);     
    const wCenter = new THREE.Vector3(); fBox.getCenter(wCenter);
    const intMinY = fBox.min.y + 0.1; 
    const intMaxY = fBox.max.y - 0.1; 
    const totalH = intMaxY - intMinY;

    // --- POSISI PINTU BEBAS GAGANG (FIX 100% BUKA NORMAL KE LUAR) ---
    const attachDoor = (doorModel, isLeft, idStr) => {
    const door = doorModel.clone(); applyMat(door, true);
    door.position.set(0, 0, 0); 
    
    const dBox = new THREE.Box3().setFromObject(door);
    const hinge = new THREE.Group();
    
    // Titik Pivot X: Pinggir kiri atau kanan (tanpa offset tambahan)
    const pivotX = isLeft ? dBox.min.x : dBox.max.x;
    
    const pivotZ = dBox.min.z + 0.018; 
    
    let offsetZ = 0.015; 
    
    if (idStr === 'lemari_kanan_atas') {
        offsetZ += 0.1;
    }
    
    // Sudut buka: kanan_atas pakai 85° biar tepat di dalam frame
    let openAngle = Math.PI / 1.8;
    if (idStr === 'lemari_kanan_atas') {
        openAngle = (Math.PI / 2); // ~85 derajat, sedikit kurang dari 90°
    }
    
    hinge.position.set(pivotX, 0, pivotZ + offsetZ); 
    door.position.set(-pivotX, 0, -pivotZ); 
    
    hinge.userData = { 
        type: 'cabinet_door', 
        id: idStr, 
        canOpen: true, 
        isOpen: states.cabinet[idStr] || false, 
        baseRotation: 0, 
        openRotation: isLeft ? -openAngle : openAngle
    };
    
    if (hinge.userData.isOpen) hinge.rotation.y = hinge.userData.openRotation;
    
    hinge.add(door); 
    unit.add(hinge);
};

    attachDoor(lemariParts.doorLeft, true, 'lemari_kiri');            
    attachDoor(lemariParts.doorRightTop, false, 'lemari_kanan_atas');  
    attachDoor(lemariParts.doorRightBottom, false, 'lemari_kanan_bawah'); 

    // --- PATOKAN TENGAH MURNI DARI PINTU KANAN BAWAH ---
    lemariParts.doorRightBottom.position.set(0,0,0);
    const drbBox = new THREE.Box3().setFromObject(lemariParts.doorRightBottom);
    const splitY = drbBox.max.y + 0.02; 

    // --- POSISI X RAK & GANTUNGAN ---
    const totalWidth = fBox.max.x - fBox.min.x;
    const wallThick = 0.015; 
    const compWidth = ((totalWidth - (3 * wallThick)) / 2) + 0.01; 

    const leftCenterX = fBox.min.x + wallThick + (compWidth / 2);
    const rightCenterX = fBox.max.x - wallThick - (compWidth / 2);

    lemariParts.rak.position.set(0,0,0);
    const rBox = new THREE.Box3().setFromObject(lemariParts.rak);
    const scaleXRak = (rBox.max.x - rBox.min.x) > 0 ? compWidth / (rBox.max.x - rBox.min.x) : 1; 

    lemariParts.rakKananAtas.position.set(0,0,0);
    const rTopBox = new THREE.Box3().setFromObject(lemariParts.rakKananAtas);
    const scaleXRakTop = (rTopBox.max.x - rTopBox.min.x) > 0 ? compWidth / (rTopBox.max.x - rTopBox.min.x) : 1;

    lemariParts.rod.position.set(0,0,0);
    const gBox = new THREE.Box3().setFromObject(lemariParts.rod);
    const scaleXRod = (gBox.max.x - gBox.min.x) > 0 ? compWidth / (gBox.max.x - gBox.min.x) : 1;

    const addRak = (xCenter, yPos) => {
        const rak = lemariParts.rak.clone(); applyMat(rak, true);
        rak.position.set(-((rBox.max.x + rBox.min.x) / 2), -rBox.min.y, -((rBox.max.z + rBox.min.z) / 2));
        const wrapper = new THREE.Group(); wrapper.add(rak);
        wrapper.scale.set(scaleXRak, 1, 1);
        wrapper.position.set(xCenter, yPos, wCenter.z);
        unit.add(wrapper);
    };

    const addRakTop = (xCenter, yPos) => {
    const rakTop = lemariParts.rakKananAtas.clone(); applyMat(rakTop, true);
    rakTop.position.set(-((rTopBox.max.x + rTopBox.min.x) / 2), -rTopBox.min.y, -((rTopBox.max.z + rTopBox.min.z) / 2));
    const wrapper = new THREE.Group(); wrapper.add(rakTop);
    wrapper.scale.set(scaleXRakTop, 1, 1);
    wrapper.position.set(xCenter, yPos, wCenter.z - 0.5); // mundur 3cm dari center
    unit.add(wrapper);
};

    const addRod = (xCenter, yPos) => {
        const rod = lemariParts.rod.clone(); applyMat(rod, true);
        rod.position.set(-((gBox.max.x + gBox.min.x) / 2), -gBox.max.y, -((gBox.max.z + gBox.min.z) / 2));
        const wrapper = new THREE.Group(); wrapper.add(rod);
        wrapper.scale.set(scaleXRod, 1, 1);
        wrapper.position.set(xCenter, yPos, wCenter.z);
        unit.add(wrapper);
    };

    const distributeRacks = (xCenter, startY, endY, count) => {
        if (count <= 0) return;
        const spacing = (endY - startY) / (count + 1);
        for(let i=1; i<=count; i++) addRak(xCenter, startY + (spacing * i));
    };

    // --- RUANG KIRI ---
    const pos = lemariConfig.rodPosition;
    let actualRak = Math.min(lemariConfig.leftRak, pos === 'tidak_ada' ? 4 : 3);

    if (pos === 'tidak_ada') {
        distributeRacks(leftCenterX, intMinY, intMaxY, actualRak);
    } 
    else if (pos === 'atas') {
        const rodY = intMaxY - 0.08;
        addRod(leftCenterX, rodY); 
        distributeRacks(leftCenterX, intMinY, splitY, actualRak);
    }
   else if (pos === 'tengah') {
    const rodY = splitY; 
    addRod(leftCenterX, rodY); 
    if (actualRak > 0) {
        const startY = rodY + 0.3; // jarak lebih jauh dari gantungan
        const endY = intMaxY - 0.05; // sedikit margin dari atas
        const spacing = (endY - startY) / actualRak; // bagi rata tanpa +1 biar lebih longgar
        for (let i = 0; i < actualRak; i++) {
            addRak(leftCenterX, startY + (spacing * i));
        }
    }
}
else if (pos === 'atas_tengah') {
    const rodY = splitY + ((intMaxY - splitY) / 2); 
    addRod(leftCenterX, rodY);
    
    // 1 rak di atas gantungan
    if (actualRak >= 1) {
        addRak(leftCenterX, rodY + 0.15);
    }
    
    // Sisa rak di bawah, jauh dari gantungan (ruang baju panjang)
   const rakBawah = Math.max(0, actualRak - 1);
if (rakBawah > 0) {
    const bawahEnd = intMinY + ((rodY - intMinY) * 0.6); // hanya 40% bawah dari zona gantungan
    const bawahStart = intMinY + 0.12;
    const spacing = (bawahEnd - bawahStart) / (rakBawah + 1);
    for (let i = 1; i <= rakBawah; i++) {
        addRak(leftCenterX, bawahStart + (spacing * i));
    }
}
}

    // --- RUANG KANAN ---
    if (lemariConfig.rightRakTop >= 1) {
        const spacing = (intMaxY - splitY) / (lemariConfig.rightRakTop + 1);
        for(let i=1; i<=lemariConfig.rightRakTop; i++) addRakTop(rightCenterX, splitY + (spacing * i));
    }
    if (lemariConfig.rightRakBottom >= 1) {
        const spacing = (splitY - intMinY) / (lemariConfig.rightRakBottom + 1);
        for(let i=1; i<=lemariConfig.rightRakBottom; i++) addRak(rightCenterX, intMinY + (spacing * i));
    }

    rackGroup.add(unit);
}

// ==========================================
// --- SECTION 5: PRODUCT MODULE - STANDARD RACK ---
// ==========================================
async function initStandard(loader) {
    productType = 'rack'; 
    customConfig = { width: 1.125, height: 1.125, depth: 0.400 };
    updateUIValues(113, 113, 40);
    
    document.getElementById('rackCols').oninput = (e) => { 
        rackCols = parseInt(e.target.value) || 1; 
        document.getElementById('rackColsValue').innerText = rackCols; 
        updateDisplay(); 
    };
    document.getElementById('rackRows').oninput = (e) => { 
        rackRows = parseInt(e.target.value) || 1; 
        document.getElementById('rackRowsValue').innerText = rackRows; 
        updateDisplay(); 
    };

    loader.load('./models/rakfix.glb', (gltf) => { 
        modelPrototype = gltf.scene; 
        modelOriginalBox = new THREE.Box3().setFromObject(modelPrototype); 
        updateDisplay(); 
        focusCamera(); 
    });
}

function buildStandard() {
    const size = new THREE.Vector3(); modelOriginalBox.getSize(size);
    const sX = customConfig.width / size.x; 
    const sY = customConfig.height / size.y; 
    const sZ = customConfig.depth / size.z; // scale depth normal lagi
    
    if (productType === 'rack') {
        const offX = (rackCols > 1) ? 0.042 : 0, offY = (rackRows > 1) ? 0.095 : 0;
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
// ==========================================
// --- SECTION 6: CONTROLLER & LOGIC ROUTING ---
// ==========================================
window.updateDoorType = (colIndex, val) => { cabinetDoorTypes[colIndex] = val; updateDisplay(); };

window.updateLemariConfig = (key, val) => { 
    if (key === 'rodPosition') {
        lemariConfig.rodPosition = val;
        const maxRak = val === 'tidak_ada' ? 4 : 3;
        if (lemariConfig.leftRak > maxRak) lemariConfig.leftRak = maxRak;
        if (document.getElementById('input_leftRak')) {
            document.getElementById('input_leftRak').max = maxRak;
            document.getElementById('input_leftRak').value = lemariConfig.leftRak;
        }
    } else {
        let num = parseInt(val) || 0;
        const maxRak = lemariConfig.rodPosition === 'tidak_ada' ? 4 : 3;
        if (key === 'leftRak' && num > maxRak) num = maxRak;
        if (key === 'rightRakTop' && num > 1) num = 1;
        if (key === 'rightRakBottom' && num > 2) num = 2;
        lemariConfig[key] = num;
        if(document.getElementById(`input_${key}`)) document.getElementById(`input_${key}`).value = num;
    }
    updateDisplay(); 
};

function renderDoorControls() {
    const container = document.getElementById('doorConfigContainer'); if (!container) return;
    let html = `<div class="col-span-full border-t border-gray-200 mt-2 pt-5"><h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Tipe Pintu Per Kolom</h4><div class="space-y-3">`;
    for (let i = 0; i < rackCols; i++) {
        const currentType = cabinetDoorTypes[i] || 'left';
        html += `<div class="flex items-center justify-between bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm transition-all hover:border-[#e67e22]">
            <span class="text-sm font-bold text-gray-600">Kolom ${i + 1}</span>
            <select onchange="window.updateDoorType(${i}, this.value)" class="w-[180px] px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#e67e22] outline-none bg-gray-50 text-sm font-medium text-gray-700 cursor-pointer">
                <option value="left" ${currentType === 'left' ? 'selected' : ''}>Tarik Kiri</option>
                <option value="right" ${currentType === 'right' ? 'selected' : ''}>Tarik Kanan</option>
                <option value="drawer" ${currentType === 'drawer' ? 'selected' : ''}>Model Dorong</option>
            </select></div>`;
    }
    html += `</div></div>`; container.innerHTML = html;
}

async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search); const modelId = urlParams.get('id') || 'rak'; const loader = new GLTFLoader();
    document.getElementById('rackLayoutControls').style.display = 'block';
    const layoutGrid = document.querySelector('#rackLayoutControls #layoutGrid'); const dimensionSection = document.getElementById('dimensionSection'); 

    if (modelId === 'hiro_drawer') {
        if(dimensionSection) dimensionSection.style.display = 'none'; 
        layoutGrid.innerHTML = `<div id="colWrapper"><label class="block text-gray-600 text-sm font-medium mb-3">Tambah Drawer (<span id="drawerVal">${numDrawer}</span>)</label><input type="number" id="inputDrawer" min="0" max="10" value="${numDrawer}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div><div id="rowWrapper"><label class="block text-gray-600 text-sm font-medium mb-3">Tambah Laci (<span id="laciVal">${numLaci}</span>)</label><input type="number" id="inputLaci" min="0" max="10" value="${numLaci}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div>`; 
        await initHiro(loader);
    } 
    else if (modelId === 'lemari-kabinet') {
        if(dimensionSection) dimensionSection.style.display = 'none'; 
        layoutGrid.innerHTML = `<div id="colWrapper"><label class="block text-gray-600 text-sm font-medium mb-3">Samping (<span id="rackColsValue">${rackCols}</span>)</label><input type="number" id="rackCols" min="1" max="10" value="${rackCols}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div><div id="rowWrapper"><label class="block text-gray-600 text-sm font-medium mb-3">Atas (<span id="rackRowsValue">${rackRows}</span>)</label><input type="number" id="rackRows" min="1" max="10" value="${rackRows}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div><div id="doorConfigContainer" class="col-span-2"></div>`; 
        await initCabinet(loader);
    } 
    else if (modelId === 'lemari') {
        if(dimensionSection) dimensionSection.style.display = 'none'; 
        layoutGrid.innerHTML = `
            <div class="col-span-full mb-2"><h4 class="text-[13px] font-bold text-[#e67e22] uppercase tracking-wider">Ruang Kiri</h4></div>
            <div class="col-span-2"><label class="block text-gray-500 text-xs font-medium mb-2">Posisi Gantungan Vertikal</label>
            <select onchange="window.updateLemariConfig('rodPosition', this.value)" class="w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-[#e67e22] text-sm bg-white">
                <option value="tidak_ada" ${lemariConfig.rodPosition === 'tidak_ada' ? 'selected':''}>Tidak Ada (Rak Max 4)</option>
                <option value="atas" ${lemariConfig.rodPosition === 'atas' ? 'selected':''}>Di Atas (Rak Max 3)</option>
                <option value="tengah" ${lemariConfig.rodPosition === 'tengah' ? 'selected':''}>Di Tengah (Rak Max 3)</option>
                <option value="atas_tengah" ${lemariConfig.rodPosition === 'atas_tengah' ? 'selected':''}>Diantara Atas & Tengah (Rak Max 3)</option>
            </select></div>
            <div class="col-span-2"><label class="block text-gray-500 text-xs font-medium mb-2">Jumlah Rak Kiri</label>
            <input type="number" id="input_leftRak" oninput="window.updateLemariConfig('leftRak', this.value)" min="0" max="${lemariConfig.rodPosition === 'tidak_ada' ? 4 : 3}" value="${lemariConfig.leftRak}" class="w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-[#e67e22] text-sm"></div>
            
            <div class="col-span-full mt-4 mb-2"><h4 class="text-[13px] font-bold text-[#e67e22] uppercase tracking-wider">Ruang Kanan</h4></div>
            <div><label class="block text-gray-500 text-xs font-medium mb-2">Atas (Max 1)</label>
            <input type="number" id="input_rightRakTop" oninput="window.updateLemariConfig('rightRakTop', this.value)" min="0" max="1" value="${lemariConfig.rightRakTop}" class="w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-[#e67e22] text-sm"></div>
            <div><label class="block text-gray-500 text-xs font-medium mb-2">Bawah (Max 2)</label>
            <input type="number" id="input_rightRakBottom" oninput="window.updateLemariConfig('rightRakBottom', this.value)" min="0" max="2" value="${lemariConfig.rightRakBottom}" class="w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-[#e67e22] text-sm"></div>
        `; 
        await initLemari(loader);
    } 
 else if (modelId === 'hiro_rak2drawer') {
    if(dimensionSection) dimensionSection.style.display = 'none'; 
    layoutGrid.innerHTML = `
        <div id="colWrapper">
            <label class="block text-gray-600 text-sm font-medium mb-3">
                Jumlah Drawer (<span id="drawerVal">${numRak2Drawer}</span>)
            </label>
            <input type="number" id="inputDrawer" min="2" max="6" value="${numRak2Drawer}" 
                class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none">
        </div>
        <div id="rowWrapper">
            <label class="block text-gray-600 text-sm font-medium mb-3">
                Jumlah Laci Kosong (<span id="laciVal">${numRak2Laci}</span>)
            </label>
            <input type="number" id="inputLaci" min="1" max="8" value="${numRak2Laci}" 
                class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none">
        </div>
    `; 
    await initHiroRak2(loader);
}
    else {
        if(dimensionSection) dimensionSection.style.display = 'block'; 
        layoutGrid.innerHTML = `<div id="colWrapper"><label class="block text-gray-600 text-sm font-medium mb-3">Kolom (<span id="rackColsValue">${rackCols}</span>)</label><input type="number" id="rackCols" min="1" max="10" value="${rackCols}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div><div id="rowWrapper"><label id="rowLabel" class="block text-gray-600 text-sm font-medium mb-3">Baris (<span id="rackRowsValue">${rackRows}</span>)</label><input type="number" id="rackRows" min="1" max="10" value="${rackRows}" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e67e22] outline-none"></div>`; 
        await initStandard(loader);
    }
}

function updateDisplay() {
    if (!modelPrototype) return; const currentStates = getInteractiveStates();
    if (rackGroup) mainCabinet.remove(rackGroup); rackGroup = new THREE.Group();
    
    if (productType === 'hiro') buildHiro(currentStates); 
    else if (productType === 'hiro_rak2drawer') buildHiroRak2(currentStates); // <-- tambah ini
    else if (productType === 'lemari_kabinet') buildCabinet(currentStates); 
    else if (productType === 'lemari') buildLemari(currentStates); 
    else buildStandard();
    
    const finalBox = new THREE.Box3().setFromObject(rackGroup); const center = new THREE.Vector3(); finalBox.getCenter(center);
    rackGroup.position.set(-center.x, Math.abs(finalBox.min.y) + 0.01, -center.z); mainCabinet.add(rackGroup); updatePriceUI();
}

// ==========================================
// --- SECTION 7: CORE 3D ENGINE & UTILITIES ---
// ==========================================
async function init() { setupScene(); setupLights(); setupEnvironment(); mainCabinet = new THREE.Group(); scene.add(mainCabinet); await loadProduct(); setupEventListeners(); animate(); }

function setupScene() {
    scene = new THREE.Scene(); 
    scene.background = new THREE.Color(0xd9d5ce);
    scene.fog = new THREE.Fog(0xd9d5ce, 20, 60);
    
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000); 
    camera.position.set(0, 1.2, 5);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); 
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio); 
    renderer.shadowMap.enabled = true; 
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; 
    container.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); 
    controls.enableDamping = true; 
    controls.dampingFactor = 0.08; 
    controls.target.set(0, 0.8, 0);
    raycaster = new THREE.Raycaster(); 
    mouse = new THREE.Vector2();
}

function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 0.6));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5); 
    keyLight.position.set(4, 10, 6); 
    keyLight.castShadow = true; 
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -8;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-6, 4, 2);
    scene.add(fillLight);
}

function setupEnvironment() {
    // --- LANTAI ABU GELAP ---
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0x8a8680,
        roughness: 0.9, 
        metalness: 0.0,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- TEMBOK BELAKANG ABU MUDA ---
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0xd9d5ce,
        roughness: 1.0, 
        metalness: 0.0 
    });
    const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), wallMat);
    wallBack.position.set(0, 8, -7);
    wallBack.receiveShadow = true;
    scene.add(wallBack);

    const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), wallMat.clone());
    wallLeft.rotation.y = Math.PI / 2;
    wallLeft.position.set(-7, 8, 0);
    wallLeft.receiveShadow = true;
    scene.add(wallLeft);

    // --- GARIS PERTEMUAN LANTAI & TEMBOK ---
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x7a7670, roughness: 1.0 });
    const edgeBack = new THREE.Mesh(new THREE.BoxGeometry(40, 0.02, 0.05), edgeMat);
    edgeBack.position.set(0, 0.01, -7);
    scene.add(edgeBack);


}


function getObjectInfo(obj) { const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size); return { height: size.y, minY: box.min.y, maxY: box.max.y }; }

function getInteractiveStates() {
    const states = { drawer: {}, laci: {}, cabinet: {} }; if (!rackGroup) return states;
    rackGroup.traverse(n => { if (n.userData && n.userData.isOpen) {
        if (n.userData.type === 'drawer') states.drawer[n.userData.id] = true;
        else if (n.userData.type === 'laci') states.laci[n.userData.id] = true;
        else if (n.userData.type === 'cabinet_door' || n.userData.type === 'cabinet_drawer') states.cabinet[n.userData.id] = true;
    }}); return states;
}

function setupEventListeners() {
    window.addEventListener('pointermove', (event) => {
        ['width', 'height', 'depth'].forEach(id => { 
    const el = document.getElementById(id); 
    if (el) el.oninput = (e) => { 
        const val = parseFloat(e.target.value);
        customConfig[id] = val / 100; 
        document.getElementById(id + 'Value').textContent = Math.round(val); 
        updateDisplay(); 
        updatePriceUI();
    }; 
});
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
                n.material.side = THREE.DoubleSide; 
                n.material.transparent = false; 
                n.material.opacity = 1.0;
                const r = n.material.color.r, g = n.material.color.g, b = n.material.color.b;
                const isGrey = (Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05 && r < 0.85); 
                const isKnobName = (n.name + " " + n.material.name).toLowerCase().match(/handle|knob|gagang|kenop|abu|grey|bulat/);
                if (!isGrey && !isKnobName) { 
                    if (currentTexture) {
                        n.material.map = currentTexture;
                        n.material.color.set('#ffffff'); // reset warna biar tekstur keliatan
                    } else {
                        n.material.map = null;
                        n.material.color.set(currentColor);
                    }
                }
                if (isHiro) { n.material.roughness = 0.5; n.material.metalness = 0.1; } 
                n.material.needsUpdate = true; 
            } 
        } 
    });
}

window.appChangeColor = (color) => { 
    currentColor = color; 
    currentTexture = null;
    if (rackGroup) applyMat(rackGroup, productType === 'hiro' || productType === 'lemari_kabinet' || productType === 'lemari'); 
};

window.appChangeTexture = (texturePath) => {
    currentTexture = textureLoader.load(texturePath, (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2); // tile tekstur
        tex.colorSpace = THREE.SRGBColorSpace;
        if (rackGroup) applyMat(rackGroup, productType === 'hiro' || productType === 'lemari_kabinet' || productType === 'lemari');
    });
};

function updatePriceUI() { 
    let finalPrice = 0;

    if (productType === 'hiro') {
        finalPrice = (numDrawer + numLaci) * PRICE_PER_UNIT;
    } 
    else if (productType === 'hiro_rak2drawer') {
        finalPrice = (numRak2Drawer + numRak2Laci) * PRICE_PER_UNIT;
    } 
    else if (productType === 'lemari_kabinet') {
        finalPrice = (rackCols * rackRows) * PRICE_PER_UNIT;
    }
    else if (productType === 'rack') {
        const BASE_PRICE    = 300000; // harga dasar 3x3
        const BASE_COLS     = 3;
        const BASE_ROWS     = 3;
        const PRICE_PER_RAK = 25000;  // per 1 rak tambahan
        const PRICE_PER_10CM = 20000; // per 10cm tambahan

        // Tambahan dari ukuran (per 10cm dari default 113cm)
        const defaultCm  = 113;
        const defaultDepthCm = 40;
        const currentWcm = Math.round(customConfig.width  * 100);
        const currentHcm = Math.round(customConfig.height * 100);
        const currentDcm = Math.round(customConfig.depth  * 100);
        const stepsW     = Math.max(0, Math.floor((currentWcm - defaultCm) / 10));
        const stepsH     = Math.max(0, Math.floor((currentHcm - defaultCm) / 10));
        const stepsD     = Math.max(0, Math.floor((currentDcm - defaultDepthCm) / 10));
        const dimExtra   = (stepsW + stepsH + stepsD) * PRICE_PER_10CM;

        // Tambahan dari jumlah rak
        const totalRaks  = rackCols * rackRows;
        const baseRaks   = BASE_COLS * BASE_ROWS; // 9
        const extraRaks  = Math.max(0, totalRaks - baseRaks);
        const rakExtra   = extraRaks * PRICE_PER_RAK;

        finalPrice = BASE_PRICE + dimExtra + rakExtra;
    }
    else if (productType === 'lemari') {
        let count = 3; 
        count += (lemariConfig.leftRak + lemariConfig.rightRakTop + lemariConfig.rightRakBottom) * 0.2; 
        if (lemariConfig.rodPosition !== 'tidak_ada') count += 0.5;
        finalPrice = count * PRICE_PER_UNIT;
    }

    document.getElementById('totalPrice').textContent = `Rp${finalPrice.toLocaleString('id-ID')}`;
}

function updateUIValues(w, h, d) { 
    const elW = document.getElementById('widthValue'); if(elW) elW.innerText = Math.round(w); 
    const elH = document.getElementById('heightValue'); if(elH) elH.innerText = Math.round(h); 
    const elD = document.getElementById('depthValue'); if(elD) elD.innerText = Math.round(d); 
    const inW = document.getElementById('width'); if(inW) inW.value = w; 
    const inH = document.getElementById('height'); if(inH) inH.value = h; 
    const inD = document.getElementById('depth'); if(inD) inD.value = d; 
}

function focusCamera(dist) { 
    const box = new THREE.Box3().setFromObject(mainCabinet); 
    const center = new THREE.Vector3(); 
    const size = new THREE.Vector3(); 
    box.getCenter(center); 
    box.getSize(size); 
    controls.target.copy(center); 
    const d = dist || Math.max(size.x, size.y) * 2.5;
    controls.update(); 
}
function animate() { 
    requestAnimationFrame(animate); 
    if (rackGroup) rackGroup.traverse(c => {
        if (c.userData?.canOpen) {
            if (c.userData.type === 'cabinet_door') {
                c.rotation.y = THREE.MathUtils.lerp(c.rotation.y, c.userData.isOpen ? c.userData.openRotation : c.userData.baseRotation, LERP_SPEED);
            } 
            else if (c.userData.type === 'drawer' || c.userData.type === 'cabinet_drawer') {
                c.position.z = THREE.MathUtils.lerp(c.position.z, c.userData.isOpen ? c.userData.openZ : c.userData.baseZ, LERP_SPEED);
            }
        }
    });
    controls.update(); renderer.render(scene, camera); 
}

init();