import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// ==========================================
// --- SECTION 1: GLOBAL CONFIG & STATE ---
// ==========================================
const container = document.getElementById('canvas-area');
let basePriceFromDB = 0;
const EXTRA_PART_PRICE = 200000;
const LERP_SPEED = 0.1;
let scene, camera, renderer, controls, raycaster, mouse;
let mainCabinet, rackGroup, modelPrototype, modelOriginalBox;
let productType = 'rack';
let customConfig = { width: 1.2, height: 1.5, depth: 1.0 };
let currentColor = '#ffffff';
let currentTexture = null;
let textureLoader = new THREE.TextureLoader();
let currentProduct = null; // Tambahkan ini di deretan atas

let rackCols = 3, rackRows = 3;
let numDrawer = 2, numLaci = 1;
let cabinetDoorTypes = Array(10).fill('left');

let lemariConfig = {
    leftRak: 1,
    rodPosition: 'atas',
    rightRakTop: 1,
    rightRakBottom: 1
};
const lemari2Parts = {
    frame: null, gantungan: null, rak: null,
    drawer: null, pintuKiri: null, pintuKanan: null
};
let lemari2Config = {
    kiriMode: 'gantungan',
    kiriRak: 0,
    kananRak: 2,
    kananDrawer: 1,
};


// ==========================================
// --- SECTION 2: PRODUCT MODULE - HIRO ---
// ==========================================
const hiroParts = { frame: null, laci: null, drawer: null, feet: null };
const hiroRak2Parts = { frameAtas: null, frameBawah: null, rak: null, kaki: null, drawer: null };
let numRak2Drawer = 2, numRak2Laci = 2;

async function initHiro(loader) {
    productType = 'hiro'; customConfig = { width: 0.8, height: 1.0, depth: 0.5 }; updateUIValues(80, 100, 50);
    try {
        const [f, dw, lc, ft] = await Promise.all([
            loader.loadAsync('./models/frame-hiro-drawer.glb'),
            loader.loadAsync('./models/drawer-hiro-drawer.glb'),
            loader.loadAsync('./models/laci-hiro-drawer.glb'),
            loader.loadAsync('./models/kaki-hiro-drawer.glb')
        ]);
        hiroParts.frame = f.scene; hiroParts.drawer = dw.scene;
        hiroParts.laci = lc.scene; hiroParts.feet = ft.scene;
        modelPrototype = hiroParts.frame;
        modelOriginalBox = new THREE.Box3().setFromObject(hiroParts.frame);
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
        hiroRak2Parts.frameAtas = fAtas.scene; hiroRak2Parts.frameBawah = fBawah.scene;
        hiroRak2Parts.rak = rk.scene; hiroRak2Parts.kaki = kk.scene; hiroRak2Parts.drawer = dr.scene;
        modelPrototype = fAtas.scene;
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
    const GAP = 0.016;
    const RAK_GAP = 2;
    const kaki = hiroRak2Parts.kaki.clone(); applyMat(kaki, true); rackGroup.add(kaki);
    const kakiInfo = getObjectInfo(kaki); let currentY = kakiInfo.maxY + 0.005;
    const frameBawahRaw = getObjectInfo(hiroRak2Parts.frameBawah);
    const drawerRaw = getObjectInfo(hiroRak2Parts.drawer);
    const totalDrawerH = (drawerRaw.height * numRak2Drawer) + (GAP * (numRak2Drawer - 1));
    const scaleYBawah = totalDrawerH / frameBawahRaw.height;
    const frameBawah = hiroRak2Parts.frameBawah.clone();
    frameBawah.scale.set(1, scaleYBawah, 1);
    frameBawah.position.y = currentY - (frameBawahRaw.minY * scaleYBawah);
    applyMat(frameBawah, true); rackGroup.add(frameBawah);
    let drawerY = currentY;
    for (let i = 0; i < numRak2Drawer; i++) {
        const dr = hiroRak2Parts.drawer.clone(); const info = getObjectInfo(dr);
        dr.position.y = drawerY - info.minY;
        const isOpen = states.drawer[`d_${i}`] || false;
        dr.userData = { type: 'drawer', id: `d_${i}`, canOpen: true, isOpen, baseZ: 0, openZ: 0.4 };
        if (isOpen) dr.position.z = 0.4;
        applyMat(dr, true); rackGroup.add(dr); drawerY += info.height + GAP;
    }
    currentY += totalDrawerH + GAP;
    const frameAtasRaw = getObjectInfo(hiroRak2Parts.frameAtas);
    const rakRaw = getObjectInfo(hiroRak2Parts.rak);
    const totalLaciH = (rakRaw.height * numRak2Laci) + (RAK_GAP * (numRak2Laci + 1));
    const scaleYAtas = totalLaciH / frameAtasRaw.height;
    const frameAtas = hiroRak2Parts.frameAtas.clone();
    frameAtas.scale.set(1, scaleYAtas, 1);
    frameAtas.position.y = currentY - (frameAtasRaw.minY * scaleYAtas);
    applyMat(frameAtas, true); rackGroup.add(frameAtas);
    let laciY = currentY + RAK_GAP;
    for (let j = 0; j < numRak2Laci; j++) {
        const rk = hiroRak2Parts.rak.clone(); const info = getObjectInfo(rk);
        rk.position.y = laciY - info.minY;
        rk.userData = { type: 'laci', id: `l_${j}`, canOpen: false };
        applyMat(rk, true); rackGroup.add(rk); laciY += info.height + RAK_GAP;
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
        cabinetParts.frame = f.scene; cabinetParts.doorLeft = pL.scene;
        cabinetParts.doorRight = pR.scene; cabinetParts.drawer = dr.scene;
        modelPrototype = f.scene; modelOriginalBox = new THREE.Box3().setFromObject(f.scene);
        document.getElementById('rackCols').oninput = (e) => { rackCols = parseInt(e.target.value) || 1; document.getElementById('rackColsValue').innerText = rackCols; renderDoorControls(); updateDisplay(); };
        document.getElementById('rackRows').oninput = (e) => { rackRows = parseInt(e.target.value) || 1; document.getElementById('rackRowsValue').innerText = rackRows; updateDisplay(); };
        renderDoorControls(); updateDisplay(); focusCamera();
    } catch (e) { console.error("Cabinet Load Error:", e); }
}

function buildCabinet(states) {
    const size = new THREE.Vector3(); modelOriginalBox.getSize(size);
    const wallThick = 0.015;
    const overlapX = size.x - wallThick;
    const overlapY = size.y - wallThick;
    for (let r = 0; r < rackRows; r++) {
        for (let c = 0; c < rackCols; c++) {
            const unit = new THREE.Group(); const frame = cabinetParts.frame.clone(); applyMat(frame, true); unit.add(frame);
            const hinge = new THREE.Group(); const unitId = `${r}_${c}`;
            const isOpen = states.cabinet[unitId] || false; const doorType = cabinetDoorTypes[c] || 'left';
            const fBox = new THREE.Box3().setFromObject(frame);
            const pivotZ = fBox.max.z;
            const targetW = size.x - 0.02;
            const targetH = size.y - 0.02;
            const innerCenterY = (fBox.max.y + fBox.min.y) / 2;
            if (doorType === 'left') {
                const door = cabinetParts.doorLeft.clone(); applyMat(door, true);
                door.position.set(0, 0, 0); const dBox = new THREE.Box3().setFromObject(door);
                const dW = dBox.max.x - dBox.min.x; const dH = dBox.max.y - dBox.min.y;
                door.position.set(-((dBox.max.x + dBox.min.x) / 2), -((dBox.max.y + dBox.min.y) / 2), -dBox.max.z);
                const doorWrapper = new THREE.Group(); doorWrapper.add(door);
                doorWrapper.scale.set(targetW / dW, targetH / dH, 1);
                const pivotX = fBox.min.x + wallThick;
                hinge.position.set(pivotX, 0, pivotZ);
                doorWrapper.position.set((targetW / 2) - 0.005, innerCenterY, 0);
                hinge.userData = { type: 'cabinet_door', id: unitId, canOpen: true, isOpen, baseRotation: 0, openRotation: -Math.PI / 1.8 };
                if (isOpen) hinge.rotation.y = hinge.userData.openRotation; hinge.add(doorWrapper);
            } else if (doorType === 'right') {
                const door = cabinetParts.doorRight.clone(); applyMat(door, true);
                door.position.set(0, 0, 0); const dBox = new THREE.Box3().setFromObject(door);
                const dW = dBox.max.x - dBox.min.x; const dH = dBox.max.y - dBox.min.y;
                door.position.set(-((dBox.max.x + dBox.min.x) / 2), -((dBox.max.y + dBox.min.y) / 2), -dBox.max.z);
                const doorWrapper = new THREE.Group(); doorWrapper.add(door);
                doorWrapper.scale.set(targetW / dW, targetH / dH, 1);
                const pivotX = fBox.max.x - wallThick;
                hinge.position.set(pivotX, 0, pivotZ);
                doorWrapper.position.set(-(targetW / 2) + 0.005, innerCenterY, 0);
                hinge.userData = { type: 'cabinet_door', id: unitId, canOpen: true, isOpen, baseRotation: 0, openRotation: Math.PI / 1.8 };
                if (isOpen) hinge.rotation.y = hinge.userData.openRotation; hinge.add(doorWrapper);
            } else if (doorType === 'drawer') {
                const door = cabinetParts.drawer.clone(); applyMat(door, true);
                door.position.set(0, 0, 0); const dBox = new THREE.Box3().setFromObject(door);
                const dW = dBox.max.x - dBox.min.x; const dH = dBox.max.y - dBox.min.y;
                door.position.set(-((dBox.max.x + dBox.min.x) / 2), -((dBox.max.y + dBox.min.y) / 2), -dBox.max.z);
                const doorWrapper = new THREE.Group(); doorWrapper.add(door);
                doorWrapper.scale.set(targetW / dW, targetH / dH, 1);
                const centerX = (fBox.min.x + fBox.max.x) / 2;
                hinge.position.set(centerX, 0, pivotZ);
                doorWrapper.position.set(0, innerCenterY, 0);
                hinge.userData = { type: 'cabinet_drawer', id: unitId, canOpen: true, isOpen, baseZ: pivotZ + 0.1, openZ: pivotZ + 2 };
                if (isOpen) hinge.position.z = hinge.userData.openZ; hinge.add(doorWrapper);
            }
            unit.add(hinge);
            unit.position.set(c * overlapX, r * overlapY, 0);
            rackGroup.add(unit);
        }
    }
}

// ==========================================
// --- SECTION 4: PRODUCT MODULE - LEMARI ---
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
        lemariParts.frame = f.scene; lemariParts.doorLeft = dL.scene;
        lemariParts.doorRightTop = dRT.scene; lemariParts.doorRightBottom = dRB.scene;
        lemariParts.rak = rk.scene; lemariParts.rakKananAtas = rkTop ? rkTop.scene : rk.scene;
        lemariParts.rod = rd.scene;
        modelPrototype = f.scene; modelOriginalBox = new THREE.Box3().setFromObject(f.scene);
        updateDisplay(); focusCamera();
    } catch (e) { console.error("Lemari Load Error:", e); }
}

function buildLemari(states) {
    if (!lemariParts.frame) return;
    const unit = new THREE.Group();
    const frame = lemariParts.frame.clone(); applyMat(frame, true); unit.add(frame);
    const fBox = new THREE.Box3().setFromObject(frame);
    const wCenter = new THREE.Vector3(); fBox.getCenter(wCenter);
    const intMinY = fBox.min.y + 0.1;
    const intMaxY = fBox.max.y - 0.1;

    const attachDoor = (doorModel, isLeft, idStr) => {
        const door = doorModel.clone(); applyMat(door, true);
        door.position.set(0, 0, 0);
        const dBox = new THREE.Box3().setFromObject(door);
        const hinge = new THREE.Group();
        const pivotX = isLeft ? dBox.min.x : dBox.max.x;
        const pivotZ = dBox.min.z + 0.018;
        let offsetZ = 0.015;
        if (idStr === 'lemari_kanan_atas') offsetZ += 0.1;
        let openAngle = Math.PI / 1.8;
        if (idStr === 'lemari_kanan_atas') openAngle = (Math.PI / 2);
        hinge.position.set(pivotX, 0, pivotZ + offsetZ);
        door.position.set(-pivotX, 0, -pivotZ);
        hinge.userData = { type: 'cabinet_door', id: idStr, canOpen: true, isOpen: states.cabinet[idStr] || false, baseRotation: 0, openRotation: isLeft ? -openAngle : openAngle };
        if (hinge.userData.isOpen) hinge.rotation.y = hinge.userData.openRotation;
        hinge.add(door); unit.add(hinge);
    };

    attachDoor(lemariParts.doorLeft, true, 'lemari_kiri');
    attachDoor(lemariParts.doorRightTop, false, 'lemari_kanan_atas');
    attachDoor(lemariParts.doorRightBottom, false, 'lemari_kanan_bawah');

    lemariParts.doorRightBottom.position.set(0, 0, 0);
    const drbBox = new THREE.Box3().setFromObject(lemariParts.doorRightBottom);
    const splitY = drbBox.max.y + 0.02;

    const totalWidth = fBox.max.x - fBox.min.x;
    const wallThick = 0.015;
    const compWidth = ((totalWidth - (3 * wallThick)) / 2) + 0.01;
    const leftCenterX = fBox.min.x + wallThick + (compWidth / 2);
    const rightCenterX = fBox.max.x - wallThick - (compWidth / 2);

    lemariParts.rak.position.set(0, 0, 0);
    const rBox = new THREE.Box3().setFromObject(lemariParts.rak);
    const scaleXRak = (rBox.max.x - rBox.min.x) > 0 ? compWidth / (rBox.max.x - rBox.min.x) : 1;

    lemariParts.rakKananAtas.position.set(0, 0, 0);
    const rTopBox = new THREE.Box3().setFromObject(lemariParts.rakKananAtas);
    const scaleXRakTop = (rTopBox.max.x - rTopBox.min.x) > 0 ? compWidth / (rTopBox.max.x - rTopBox.min.x) : 1;

    lemariParts.rod.position.set(0, 0, 0);
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
        wrapper.position.set(xCenter, yPos, wCenter.z - 0.5);
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
        for (let i = 1; i <= count; i++) addRak(xCenter, startY + (spacing * i));
    };

    const pos = lemariConfig.rodPosition;
    let actualRak = Math.min(lemariConfig.leftRak, pos === 'tidak_ada' ? 4 : 3);
    if (pos === 'tidak_ada') {
        distributeRacks(leftCenterX, intMinY, intMaxY, actualRak);
    } else if (pos === 'atas') {
        const rodY = intMaxY - 0.08; addRod(leftCenterX, rodY);
        distributeRacks(leftCenterX, intMinY, splitY, actualRak);
    } else if (pos === 'tengah') {
        const rodY = splitY; addRod(leftCenterX, rodY);
        if (actualRak > 0) {
            const startY = rodY + 0.3; const endY = intMaxY - 0.05;
            const spacing = (endY - startY) / actualRak;
            for (let i = 0; i < actualRak; i++) addRak(leftCenterX, startY + (spacing * i));
        }
    } else if (pos === 'atas_tengah') {
        const rodY = splitY + ((intMaxY - splitY) / 2); addRod(leftCenterX, rodY);
        if (actualRak >= 1) addRak(leftCenterX, rodY + 0.15);
        const rakBawah = Math.max(0, actualRak - 1);
        if (rakBawah > 0) {
            const bawahEnd = intMinY + ((rodY - intMinY) * 0.6);
            const bawahStart = intMinY + 0.12;
            const spacing = (bawahEnd - bawahStart) / (rakBawah + 1);
            for (let i = 1; i <= rakBawah; i++) addRak(leftCenterX, bawahStart + (spacing * i));
        }
    }

    if (lemariConfig.rightRakTop >= 1) {
        const spacing = (intMaxY - splitY) / (lemariConfig.rightRakTop + 1);
        for (let i = 1; i <= lemariConfig.rightRakTop; i++) addRakTop(rightCenterX, splitY + (spacing * i));
    }
    if (lemariConfig.rightRakBottom >= 1) {
        const spacing = (splitY - intMinY) / (lemariConfig.rightRakBottom + 1);
        for (let i = 1; i <= lemariConfig.rightRakBottom; i++) addRak(rightCenterX, intMinY + (spacing * i));
    }
    rackGroup.add(unit);
}

// ==========================================
// --- SECTION 5: LEMARI 2 PINTU ---
// ==========================================
async function initLemari2(loader) {
    productType = 'lemari2pintubiasa';
    customConfig = { width: 1.2, height: 1.8, depth: 0.6 };
    try {
        const [f, g, rk, dr, pK, pKn] = await Promise.all([
            loader.loadAsync('./models/framelemari2pintubiasa.glb'),
            loader.loadAsync('./models/gantunganlemari2pintubiasa.glb'),
            loader.loadAsync('./models/raklemari2pintubiasa.glb'),
            loader.loadAsync('./models/drawerlemari2pintubiasa.glb'),
            loader.loadAsync('./models/pintukirilemari2pintubiasa.glb'),
            loader.loadAsync('./models/pintukananlemari2pintubiasa.glb'),
        ]);
        lemari2Parts.frame = f.scene; lemari2Parts.gantungan = g.scene;
        lemari2Parts.rak = rk.scene; lemari2Parts.drawer = dr.scene;
        lemari2Parts.pintuKiri = pK.scene; lemari2Parts.pintuKanan = pKn.scene;
        modelPrototype = f.scene;
        modelOriginalBox = new THREE.Box3().setFromObject(f.scene);
        updateDisplay(); focusCamera();
    } catch (e) { console.error("Lemari2 Load Error:", e); }
}

function buildLemari2(states) {
    if (!lemari2Parts.frame) return;
    const unit = new THREE.Group();
    const frame = lemari2Parts.frame.clone(); applyMat(frame, true); unit.add(frame);
    const fBox = new THREE.Box3().setFromObject(frame);
    const wCenter = new THREE.Vector3(); fBox.getCenter(wCenter);
    const intMinY = fBox.min.y + 0.08;
    const intMaxY = fBox.max.y - 0.22;
    const splitY = intMinY + ((intMaxY - intMinY) * 0.5);

    const attachDoor2 = (doorModel, isLeft, idStr) => {
        const door = doorModel.clone(); applyMat(door, true);
        door.position.set(0, 0, 0);
        const dBox = new THREE.Box3().setFromObject(door);
        const hinge = new THREE.Group();
        const pivotX = isLeft ? dBox.min.x : dBox.max.x;
        const pivotZ = dBox.min.z + 0.018;
        hinge.position.set(pivotX, 0, pivotZ + 0.015);
        door.position.set(-pivotX, 0, -pivotZ);
        hinge.userData = { type: 'cabinet_door', id: idStr, canOpen: true, isOpen: states.cabinet[idStr] || false, baseRotation: 0, openRotation: isLeft ? -Math.PI / 1.8 : Math.PI / 1.8 };
        if (hinge.userData.isOpen) hinge.rotation.y = hinge.userData.openRotation;
        hinge.add(door); unit.add(hinge);
    };
    attachDoor2(lemari2Parts.pintuKiri, true, 'lemari2_kiri');
    attachDoor2(lemari2Parts.pintuKanan, false, 'lemari2_kanan');

    const totalWidth = fBox.max.x - fBox.min.x;
    const wallThick = 0.015;
    const compWidth = ((totalWidth - (3 * wallThick)) / 2) + 0.01;
    const leftCenterX = fBox.min.x + wallThick + (compWidth / 2);
    const rightCenterX = fBox.max.x - wallThick - (compWidth / 2);

    lemari2Parts.rak.position.set(0, 0, 0);
    const rBox = new THREE.Box3().setFromObject(lemari2Parts.rak);
    const scaleXRak = compWidth / (rBox.max.x - rBox.min.x);
    const rakH = rBox.max.y - rBox.min.y;

    lemari2Parts.gantungan.position.set(0, 0, 0);
    const gBox = new THREE.Box3().setFromObject(lemari2Parts.gantungan);
    const scaleXGantungan = compWidth / (gBox.max.x - gBox.min.x);

    lemari2Parts.drawer.position.set(0, 0, 0);
    const drBox = new THREE.Box3().setFromObject(lemari2Parts.drawer);
    const drawerH = drBox.max.y - drBox.min.y;

    const addRak2 = (xCenter, yPos) => {
        const rak = lemari2Parts.rak.clone(); applyMat(rak, true);
        rak.position.set(-((rBox.max.x + rBox.min.x) / 2), -rBox.min.y, -((rBox.max.z + rBox.min.z) / 2));
        const wrapper = new THREE.Group(); wrapper.add(rak);
        wrapper.scale.set(scaleXRak, 1, 1);
        wrapper.position.set(xCenter - 0.01, yPos, wCenter.z);
        unit.add(wrapper);
    };
    const addGantungan2 = (xCenter, yPos) => {
        const g = lemari2Parts.gantungan.clone(); applyMat(g, true);
        g.position.set(-((gBox.max.x + gBox.min.x) / 2), -gBox.max.y, -((gBox.max.z + gBox.min.z) / 2));
        const wrapper = new THREE.Group(); wrapper.add(g);
        wrapper.scale.set(scaleXGantungan, 1, 1);
        wrapper.position.set(xCenter, yPos, wCenter.z);
        unit.add(wrapper);
    };
    const addDrawer2 = (xCenter, yPos, idStr) => {
        const dr = lemari2Parts.drawer.clone();
        dr.traverse(n => {
            if (n.isMesh && n.material) {
                n.material = n.material.clone(); n.material.side = THREE.DoubleSide;
                n.castShadow = n.receiveShadow = true;
                if (currentTexture) { n.material.map = currentTexture; n.material.color.set('#ffffff'); }
                else { n.material.map = null; n.material.color.set(currentColor); }
                n.material.needsUpdate = true;
            }
        });
        dr.position.set(-((drBox.max.x + drBox.min.x) / 2), -drBox.min.y, -((drBox.max.z + drBox.min.z) / 2));
        const wrapper = new THREE.Group(); wrapper.add(dr);
        const drawerScale = compWidth * 0.94 / (drBox.max.x - drBox.min.x);
        const lebarBaru = (drBox.max.x - drBox.min.x) * drawerScale;
        const selisih = (compWidth - lebarBaru) / 2;
        wrapper.scale.set(drawerScale, 1, 1);
        wrapper.position.set(xCenter - selisih, yPos, wCenter.z);
        const isOpen = states.cabinet[idStr] || false;
        wrapper.userData = { type: 'cabinet_drawer', id: idStr, canOpen: true, isOpen, baseZ: wCenter.z, openZ: wCenter.z + 1.5 };
        if (isOpen) wrapper.position.z = wCenter.z + 0.35;
        unit.add(wrapper);
    };

    if (lemari2Config.kiriMode === 'gantungan') {
        addGantungan2(leftCenterX, splitY - (-2.6));
    } else {
        const rakKiri = Math.min(lemari2Config.kiriRak, 3);
        if (rakKiri > 0) {
            const gap = 2;
            const totalRakH = rakKiri * rakH + (rakKiri - 1) * gap;
            const startY = intMinY + ((intMaxY - intMinY - totalRakH) / 3.5);
            for (let i = 0; i < rakKiri; i++) addRak2(leftCenterX, startY + i * (rakH + gap));
        }
    }

    const maxRakKanan = lemari2Config.kananDrawer > 0 ? 2 : 3;
    const rakKanan = Math.min(lemari2Config.kananRak, maxRakKanan);
    if (lemari2Config.kananDrawer > 0) {
        const drawerY = splitY - drawerH * 0.5 - 0.02;
        addDrawer2(rightCenterX, drawerY, 'lemari2_drawer');
        if (rakKanan >= 1) addRak2(rightCenterX, drawerY + drawerH * 0.5 + rakH * 0.5 + 0.5);
        if (rakKanan >= 2) addRak2(rightCenterX, drawerY - drawerH * 0.5 - rakH * 0.5 - 2);
    } else {
        if (rakKanan > 0) {
            const gap = 2;
            const totalRakH = rakKanan * rakH + (rakKanan - 1) * gap;
            const startY = intMinY + ((intMaxY - intMinY - totalRakH) / 3.5);
            for (let i = 0; i < rakKanan; i++) addRak2(rightCenterX, startY + i * (rakH + gap));
        }
    }
    rackGroup.add(unit);
}

// ==========================================
// --- SECTION 6: STANDARD RACK ---
// ==========================================
async function initStandard(loader) {
    productType = 'rack';
    customConfig = { width: 1.125, height: 1.125, depth: 0.400 };
    updateUIValues(113, 113, 40);
    document.getElementById('rackCols').oninput = (e) => { rackCols = parseInt(e.target.value) || 1; document.getElementById('rackColsValue').innerText = rackCols; updateDisplay(); };
    document.getElementById('rackRows').oninput = (e) => { rackRows = parseInt(e.target.value) || 1; document.getElementById('rackRowsValue').innerText = rackRows; updateDisplay(); };
    loader.load('./models/rakfix.glb', (gltf) => {
        modelPrototype = gltf.scene;
        modelOriginalBox = new THREE.Box3().setFromObject(modelPrototype);
        updateDisplay(); focusCamera();
    });
}

function buildStandard() {
    const size = new THREE.Vector3(); modelOriginalBox.getSize(size);
    const sX = customConfig.width / size.x;
    const sY = customConfig.height / size.y;
    const sZ = customConfig.depth / size.z;
    if (productType === 'rack') {
        const offX = (rackCols > 1) ? 0.042 : 0, offY = (rackRows > 1) ? 0.095 : 0;
        for (let r = 0; r < rackRows; r++) {
            for (let c = 0; c < rackCols; c++) {
                const clone = modelPrototype.clone();
                clone.scale.set(sX, sY, sZ);
                clone.position.set(c * (customConfig.width - offX), r * (customConfig.height - offY), 0);
                applyMat(clone, false); rackGroup.add(clone);
            }
        }
    } else {
        const single = modelPrototype.clone(); single.scale.set(sX, sY, sZ);
        applyMat(single, false); rackGroup.add(single);
    }
}

// ==========================================
// --- SECTION 7: CONTROLLERS ---
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
        if (document.getElementById(`input_${key}`)) document.getElementById(`input_${key}`).value = num;
    }
    updateDisplay();
};

window.updateLemari2Config = (key, val) => {
    if (key === 'kiriMode') {
        lemari2Config.kiriMode = val;
        const wrapper = document.getElementById('kiriRakWrapper');
        if (wrapper) wrapper.style.display = val === 'rak' ? 'block' : 'none';
        if (val === 'gantungan') lemari2Config.kiriRak = 0;
    } else {
        let num = parseInt(val) || 0;
        if (key === 'kiriRak') num = Math.min(Math.max(num, 0), 3);
        if (key === 'kananDrawer') num = Math.min(Math.max(num, 0), 1);
        if (key === 'kananRak') {
            const maxRak = lemari2Config.kananDrawer > 0 ? 2 : 3;
            num = Math.min(Math.max(num, 0), maxRak);
            const el = document.getElementById('input_kananRak');
            if (el) el.max = maxRak;
        }
        lemari2Config[key] = num;
        const el = document.getElementById(`input_${key}`);
        if (el) el.value = num;
        if (key === 'kananDrawer') {
            const maxRak = num > 0 ? 2 : 3;
            lemari2Config.kananRak = Math.min(lemari2Config.kananRak, maxRak);
            const rakEl = document.getElementById('input_kananRak');
            if (rakEl) { rakEl.max = maxRak; rakEl.value = lemari2Config.kananRak; }
        }
    }
    updateDisplay();
};

function renderDoorControls() {
    const cont = document.getElementById('doorConfigContainer'); if (!cont) return;
    let html = `<div class="col-span-full border-t border-stone-200 mt-2 pt-4"><p class="text-[0.65rem] uppercase tracking-widest text-stone-400 mb-3">Tipe Pintu Per Kolom</p><div class="space-y-2">`;
    for (let i = 0; i < rackCols; i++) {
        const currentType = cabinetDoorTypes[i] || 'left';
        html += `<div class="flex items-center justify-between border border-stone-200 px-3 py-2.5">
            <span class="text-xs text-stone-600">Kolom ${i + 1}</span>
            <select onchange="window.updateDoorType(${i}, this.value)" style="width:160px">
                <option value="left" ${currentType === 'left' ? 'selected' : ''}>Tarik Kiri</option>
                <option value="right" ${currentType === 'right' ? 'selected' : ''}>Tarik Kanan</option>
                <option value="drawer" ${currentType === 'drawer' ? 'selected' : ''}>Model Dorong</option>
            </select></div>`;
    }
    html += `</div></div>`; cont.innerHTML = html;
}

// ==========================================
// --- SECTION 8: LOAD PRODUCT ---
// ==========================================
async function loadProduct() {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');
    const loader = new GLTFLoader();
    document.getElementById('rackLayoutControls').style.display = 'block';
    const layoutGrid = document.querySelector('#rackLayoutControls #layoutGrid');
    const dimensionSection = document.getElementById('dimensionSection');

    let productData = null;
    try {
        if (slug) {
            const res = await fetch(`http://localhost:3001/api/products/${slug}`);
            if (res.ok) { productData = await res.json(); 
                basePriceFromDB = productData.basePrice; 
                currentProduct = productData;
            }
        }
    } catch (e) { console.error("Gagal mengambil data dari database:", e); }

    let internalModelId = 'rack';
    if (slug) {
        const s = slug.toLowerCase();
        if (s.includes('kaca')) internalModelId = 'lemari';
        else if (s.includes('kabinet')) internalModelId = 'lemari-kabinet';
        else if (s.includes('2 pintu')) internalModelId = 'lemari2pintubiasa';
        else if (s.includes('hiro') && s.includes('rak')) internalModelId = 'hiro_rak2drawer';
        else if (s.includes('hiro')) internalModelId = 'hiro_drawer';
        else internalModelId = 'rack';
    }

    if (internalModelId === 'hiro_drawer') {
        if (dimensionSection) dimensionSection.style.display = 'none';
        layoutGrid.innerHTML = `<div><label>Tambah Drawer (<span id="drawerVal">${numDrawer}</span>)</label><input type="number" id="inputDrawer" min="0" max="10" value="${numDrawer}"></div><div><label>Tambah Laci (<span id="laciVal">${numLaci}</span>)</label><input type="number" id="inputLaci" min="0" max="10" value="${numLaci}"></div>`;
        await initHiro(loader);
    } else if (internalModelId === 'lemari-kabinet') {
        if (dimensionSection) dimensionSection.style.display = 'none';
        layoutGrid.innerHTML = `<div><label>Samping (<span id="rackColsValue">${rackCols}</span>)</label><input type="number" id="rackCols" min="1" max="10" value="${rackCols}"></div><div><label>Atas (<span id="rackRowsValue">${rackRows}</span>)</label><input type="number" id="rackRows" min="1" max="10" value="${rackRows}"></div><div id="doorConfigContainer" class="col-span-2"></div>`;
        await initCabinet(loader);
    } else if (internalModelId === 'lemari') {
        if (dimensionSection) dimensionSection.style.display = 'none';
        layoutGrid.innerHTML = `
            <div class="col-span-full mb-1"><p style="font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:#555550;font-weight:500">Ruang Kiri</p></div>
            <div class="col-span-2"><label>Posisi Gantungan</label>
            <select onchange="window.updateLemariConfig('rodPosition', this.value)">
                <option value="tidak_ada" ${lemariConfig.rodPosition==='tidak_ada'?'selected':''}>Tidak Ada (Rak Max 4)</option>
                <option value="atas" ${lemariConfig.rodPosition==='atas'?'selected':''}>Di Atas (Rak Max 3)</option>
                <option value="tengah" ${lemariConfig.rodPosition==='tengah'?'selected':''}>Di Tengah (Rak Max 3)</option>
                <option value="atas_tengah" ${lemariConfig.rodPosition==='atas_tengah'?'selected':''}>Atas & Tengah (Rak Max 3)</option>
            </select></div>
            <div class="col-span-2"><label>Jumlah Rak Kiri</label>
            <input type="number" id="input_leftRak" oninput="window.updateLemariConfig('leftRak',this.value)" min="0" max="${lemariConfig.rodPosition==='tidak_ada'?4:3}" value="${lemariConfig.leftRak}"></div>
            <div class="col-span-full mt-3 mb-1"><p style="font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:#555550;font-weight:500">Ruang Kanan</p></div>
            <div><label>Atas (Max 1)</label><input type="number" id="input_rightRakTop" oninput="window.updateLemariConfig('rightRakTop',this.value)" min="0" max="1" value="${lemariConfig.rightRakTop}"></div>
            <div><label>Bawah (Max 2)</label><input type="number" id="input_rightRakBottom" oninput="window.updateLemariConfig('rightRakBottom',this.value)" min="0" max="2" value="${lemariConfig.rightRakBottom}"></div>`;
        await initLemari(loader);
    } else if (internalModelId === 'lemari2pintubiasa') {
        if (dimensionSection) dimensionSection.style.display = 'none';
        layoutGrid.innerHTML = `
            <div class="col-span-full mb-1"><p style="font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:#555550;font-weight:500">Ruang Kiri</p></div>
            <div class="col-span-2"><label>Mode Ruang Kiri</label>
            <select onchange="window.updateLemari2Config('kiriMode',this.value)">
                <option value="gantungan" ${lemari2Config.kiriMode==='gantungan'?'selected':''}>Gantungan Baju</option>
                <option value="rak" ${lemari2Config.kiriMode==='rak'?'selected':''}>Rak (Max 3)</option>
            </select></div>
            <div class="col-span-2" id="kiriRakWrapper" style="display:${lemari2Config.kiriMode==='rak'?'block':'none'}">
                <label>Jumlah Rak Kiri (Max 3)</label>
                <input type="number" id="input_kiriRak" oninput="window.updateLemari2Config('kiriRak',this.value)" min="0" max="3" value="${lemari2Config.kiriRak}">
            </div>
            <div class="col-span-full mt-3 mb-1"><p style="font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:#555550;font-weight:500">Ruang Kanan</p></div>
            <div><label>Jumlah Rak (Max 3)</label><input type="number" id="input_kananRak" oninput="window.updateLemari2Config('kananRak',this.value)" min="0" max="3" value="${lemari2Config.kananRak}"></div>
            <div><label>Drawer (0 atau 1)</label><input type="number" id="input_kananDrawer" oninput="window.updateLemari2Config('kananDrawer',this.value)" min="0" max="1" value="${lemari2Config.kananDrawer}"></div>`;
        await initLemari2(loader);
    } else if (internalModelId === 'hiro_rak2drawer') {
        if (dimensionSection) dimensionSection.style.display = 'none';
        layoutGrid.innerHTML = `
            <div><label>Jumlah Drawer (<span id="drawerVal">${numRak2Drawer}</span>)</label><input type="number" id="inputDrawer" min="2" max="6" value="${numRak2Drawer}"></div>
            <div><label>Jumlah Laci Kosong (<span id="laciVal">${numRak2Laci}</span>)</label><input type="number" id="inputLaci" min="1" max="8" value="${numRak2Laci}"></div>`;
        await initHiroRak2(loader);
    } else {
        if (dimensionSection) dimensionSection.style.display = 'block';
        layoutGrid.innerHTML = `<div><label>Kolom (<span id="rackColsValue">${rackCols}</span>)</label><input type="number" id="rackCols" min="1" max="10" value="${rackCols}"></div><div><label>Baris (<span id="rackRowsValue">${rackRows}</span>)</label><input type="number" id="rackRows" min="1" max="10" value="${rackRows}"></div>`;
        await initStandard(loader);
    }
}

function updateDisplay() {
    if (!modelPrototype) return;
    const currentStates = getInteractiveStates();
    if (rackGroup) mainCabinet.remove(rackGroup);
    rackGroup = new THREE.Group();
    if (productType === 'hiro') buildHiro(currentStates);
    else if (productType === 'hiro_rak2drawer') buildHiroRak2(currentStates);
    else if (productType === 'lemari_kabinet') buildCabinet(currentStates);
    else if (productType === 'lemari') buildLemari(currentStates);
    else if (productType === 'lemari2pintubiasa') buildLemari2(currentStates);
    else buildStandard();
    const finalBox = new THREE.Box3().setFromObject(rackGroup);
    const center = new THREE.Vector3(); finalBox.getCenter(center);
    rackGroup.position.set(-center.x, Math.abs(finalBox.min.y) + 0.01, -center.z);
    mainCabinet.add(rackGroup);
    updatePriceUI();
}

// ==========================================
// --- SECTION 9: 3D ENGINE ---
// ==========================================
async function init() {
    setupScene();
    setupLights();
    setupEnvironment();
    initLabelContainer();
    mainCabinet = new THREE.Group();
    scene.add(mainCabinet);
    await loadProduct();
    setupEventListeners();
    animate();
}

function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8e6e1);
    scene.fog = new THREE.Fog(0xe8e6e1, 25, 70);

    const canvasEl = document.getElementById('canvas-area');
    camera = new THREE.PerspectiveCamera(45, canvasEl.clientWidth / canvasEl.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.2, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(canvasEl.clientWidth, canvasEl.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    canvasEl.appendChild(renderer.domElement);

    // Renderer ikut resize window
    window.addEventListener('resize', () => {
        const w = canvasEl.clientWidth;
        const h = canvasEl.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

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
    keyLight.position.set(4, 18, 6); 
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
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b6560, roughness: 0.85, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0; floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe0ddd8, roughness: 1.0, metalness: 0.0 });
    const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(50, 20), wallMat);
    wallBack.position.set(0, 10, -8); wallBack.receiveShadow = true; scene.add(wallBack);
    const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(50, 20), wallMat.clone());
    wallLeft.rotation.y = Math.PI / 2; wallLeft.position.set(-8, 10, 0); scene.add(wallLeft);

    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x8a8480, roughness: 1.0 });
    const skirtBack = new THREE.Mesh(new THREE.BoxGeometry(50, 0.08, 0.06), skirtMat);
    skirtBack.position.set(0, 0.04, -8); scene.add(skirtBack);
    const skirtLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 50), skirtMat);
    skirtLeft.position.set(-8, 0.04, 0); scene.add(skirtLeft);

    // Silhouette manusia — tanpa addLabel3D, label ditangani HTML overlay
  
}



// ==========================================
// --- DIMENSION LABELS & PRICE OVERLAY ---
// ==========================================
let labelContainer = null;

function initLabelContainer() {
    labelContainer = document.createElement('div');
    labelContainer.id = 'dim-labels';
    labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:10;';
    container.style.position = 'relative';
    container.appendChild(labelContainer);

    // Price overlay pojok kiri atas canvas
    const priceOverlay = document.createElement('div');
    priceOverlay.id = 'price-overlay';
    priceOverlay.style.cssText = `
        position:absolute;top:16px;left:16px;
        background:rgba(26,26,24,0.80);
        backdrop-filter:blur(8px);
        color:#ffffff;padding:10px 16px;
        font-family:"DM Sans",sans-serif;
        pointer-events:none;z-index:20;min-width:150px;
    `;
    priceOverlay.innerHTML = `
        <div style="font-size:0.56rem;letter-spacing:0.12em;text-transform:uppercase;color:#b0ada6;margin-bottom:4px;">Estimasi Harga</div>
        <div id="price-overlay-value" style="font-family:'Noto Serif Display',serif;font-weight:300;font-size:1.4rem;line-height:1.1;">Rp 0</div>
    `;
    container.appendChild(priceOverlay);
}


function worldToScreen(worldPos) {
    if (!camera || !renderer) return null;
    const pos = worldPos.clone().project(camera);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    return { x: (pos.x * 0.5 + 0.5) * w, y: (-(pos.y) * 0.5 + 0.5) * h };
}

// ==========================================
// --- SECTION 10: UTILITIES ---
// ==========================================
function getObjectInfo(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    return { height: size.y, minY: box.min.y, maxY: box.max.y };
}

function getInteractiveStates() {
    const states = { drawer: {}, laci: {}, cabinet: {} };
    if (!rackGroup) return states;
    rackGroup.traverse(n => {
        if (n.userData && n.userData.isOpen) {
            if (n.userData.type === 'drawer') states.drawer[n.userData.id] = true;
            else if (n.userData.type === 'laci') states.laci[n.userData.id] = true;
            else if (n.userData.type === 'cabinet_door' || n.userData.type === 'cabinet_drawer') states.cabinet[n.userData.id] = true;
        }
    });
    return states;
}

function setupEventListeners() {
    window.addEventListener('pointermove', (event) => {
        ['width', 'height', 'depth'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = (e) => {
                const val = parseFloat(e.target.value);
                customConfig[id] = val / 100;
                document.getElementById(id + 'Value').textContent = Math.round(val);
                updateDisplay(); updatePriceUI();
            };
        });
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(rackGroup?.children || [], true);
        let isHover = false;
        if (intersects.length > 0) {
            let t = intersects[0].object;
            while (t.parent && t.parent !== rackGroup) { if (t.userData?.canOpen) { isHover = true; break; } t = t.parent; }
        }
        container.style.cursor = isHover ? 'pointer' : 'default';
    });
    window.addEventListener('pointerdown', () => {
        if (!rackGroup) return;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(rackGroup.children, true);
        if (intersects.length > 0) {
            let t = intersects[0].object;
            while (t && t !== rackGroup) { if (t.userData?.canOpen) { t.userData.isOpen = !t.userData.isOpen; break; } t = t.parent; }
        }
    });
}

// 3. Fungsi Apply Material (Yang Sudah Disempurnakan)
// 3. Fungsi Apply Material (Dengan Logika Deteksi Kaca/Gagang)
function applyMat(obj, isHiro) {
    obj.traverse(n => {
        if (n.isMesh && n.material) {
            n.castShadow = n.receiveShadow = true;
            n.material = n.material.clone();
            n.material.side = THREE.DoubleSide;
            n.material.transparent = false;
            n.material.opacity = 1.0;
            
            // LOGIKA CERDAS: Cek warna asli GLTF untuk mendeteksi kaca/besi
            const r = n.material.color.r, g = n.material.color.g, b = n.material.color.b;
            const isGrey = (Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05 && r < 0.85);
            const isKnob = (n.name + ' ' + n.material.name).toLowerCase().match(/handle|knob|gagang|kenop|kaca|glass/);
            
            const forceApply = obj.userData?.type === 'cabinet_drawer' || n.parent?.userData?.type === 'cabinet_drawer';
            
            // HANYA TERAPKAN TEKSTUR JIKA BUKAN KACA ATAU GAGANG
            if ((!isGrey && !isKnob) || forceApply) {
                if (window.currentTexture) { 
                    n.material.map = window.currentTexture; 
                    n.material.color.set('#ffffff'); // Reset ke putih agar warna gambar asli keluar
                    n.material.roughness = 1.0;
                } else { 
                    n.material.map = null; 
                    n.material.color.set('#ffffff'); 
                }
            }
            
            if (isHiro && !isKnob) { 
                n.material.roughness = 0.5; 
                n.material.metalness = 0.1; 
            }
            
            n.material.needsUpdate = true;
        }
    });
}
window.appChangeColor = (color) => {
    currentColor = color; currentTexture = null;
    if (rackGroup) applyMat(rackGroup, ['hiro', 'lemari_kabinet', 'lemari'].includes(productType));
};

window.appChangeTexture = (texturePath) => {
    sessionStorage.setItem('lastTexturePath', texturePath); 
    currentTexture = textureLoader.load(texturePath, (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        tex.colorSpace = THREE.SRGBColorSpace;
        if (rackGroup) applyMat(rackGroup, ['hiro', 'lemari_kabinet', 'lemari'].includes(productType));
    });
};

function updatePriceUI() {
    let finalPrice = basePriceFromDB || 0;
    let sizeMultiplier = 1; 

    // ==========================================
    // 1. KALKULASI HARGA KOMPONEN & MULTIPLIER
    // ==========================================
    if (productType === 'hiro') {
        const extraDrawer = Math.max(0, numDrawer - 2); 
        const extraLaci = Math.max(0, numLaci - 1);     
        finalPrice += (extraDrawer * 40000) + (extraLaci * 25000);
        sizeMultiplier = Math.max(1, (numDrawer + numLaci) / 3);

    } else if (productType === 'hiro_rak2drawer') {
        const extraDrawer = Math.max(0, numRak2Drawer - 2); 
        const extraRak = Math.max(0, numRak2Laci - 2);      
        finalPrice += (extraDrawer * 50000) + (extraRak * 35000);
        sizeMultiplier = Math.max(1, (numRak2Drawer + numRak2Laci) / 4);

    } else if (productType === 'lemari_kabinet') {
        const totalBoxes = rackCols * rackRows;
        const extra = Math.max(0, totalBoxes - 6); 
        finalPrice += extra * 80000;
        sizeMultiplier = Math.max(1, totalBoxes / 6);

    } else if (productType === 'rack') {
        const defaultCm = 113, defaultDepthCm = 40;
        const wCm = Math.round(customConfig.width * 100);
        const hCm = Math.round(customConfig.height * 100);
        const dCm = Math.round(customConfig.depth * 100);
        
        const stepsW = Math.max(0, Math.floor((wCm - defaultCm) / 10));
        const stepsH = Math.max(0, Math.floor((hCm - defaultCm) / 10));
        const stepsD = Math.max(0, Math.floor((dCm - defaultDepthCm) / 10));
        
        finalPrice += (stepsW + stepsH + stepsD) * 20000;
        
        const totalRak = rackCols * rackRows;
        const extraRak = Math.max(0, totalRak - 9); 
        finalPrice += extraRak * 25000;
        sizeMultiplier = Math.max(1, totalRak / 9);

    } else if (productType === 'lemari') {
        const totalRak = lemariConfig.leftRak + lemariConfig.rightRakTop + lemariConfig.rightRakBottom;
        const extra = Math.max(0, totalRak - 5);
        finalPrice += extra * 25000;
        sizeMultiplier = 3; 

    } else if (productType === 'lemari2pintubiasa') {
        const totalRak = lemari2Config.kiriRak + lemari2Config.kananRak + lemari2Config.kananDrawer;
        const extra = Math.max(0, totalRak - 5);
        finalPrice += extra * 25000;
        sizeMultiplier = 3; 
    }

    // ==========================================
    // 2. KALKULASI HARGA FINISHING PVC & HPL
    // ==========================================
    let baseFinishingPrice = 0;
    
    switch(window.currentFinishing) {
        // TIER 1: PVC Polos (Harga Dasar)
        case 'Putih':
        case 'Abu':
            baseFinishingPrice = 0; 
            break;
            
        // TIER 2: PVC Motif Kayu
        case 'Kayu Terang':
        case 'Kayu':
        case 'Kayu Abu':
            baseFinishingPrice = 40000; 
            break;
            
        // TIER 3: HPL Standar
        case 'Oak Putih':
        case 'Abu Terang':
        case 'Abu Gelap':
            baseFinishingPrice = 150000; 
            break;
            
        // TIER 4: HPL Premium
        case 'Kayu Mewah': // Di HTML nama parameternya 'Kayu Mewah' walau teksnya 'Motif Marmer'
        
            baseFinishingPrice = 250000; 
            break;
            
        default:
            baseFinishingPrice = 0;
    }

    // Hitung total harga finishing berdasarkan ukuran produk
    finalPrice += Math.round(baseFinishingPrice * sizeMultiplier);

    // ==========================================
    // 3. RENDER KE ANTARMUKA (UI)
    // ==========================================
    const fmt = `Rp${finalPrice.toLocaleString('id-ID')}`;
    const overlayEl = document.getElementById('price-overlay-value');
    if (overlayEl) overlayEl.textContent = fmt;
    
    const totalEl = document.getElementById('totalPrice');
    if (totalEl) totalEl.textContent = fmt;
}
function updateUIValues(w, h, d) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const txt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = Math.round(val); };
    txt('widthValue', w); txt('heightValue', h); txt('depthValue', d);
    set('width', w); set('height', h); set('depth', d);
}

function focusCamera(dist) { 
    const box = new THREE.Box3().setFromObject(mainCabinet); 
    const center = new THREE.Vector3(); 
    const size = new THREE.Vector3(); 
    box.getCenter(center); 
    box.getSize(size); 
    controls.target.set(center.x, center.y, center.z);
    const d = dist || Math.max(size.x, size.y) * 2.5;
    camera.position.set(center.x, center.y, d);
    controls.update(); 
}
function animate() {
    requestAnimationFrame(animate);
    if (rackGroup) rackGroup.traverse(c => {
        if (c.userData?.canOpen) {
            if (c.userData.type === 'cabinet_door') {
                c.rotation.y = THREE.MathUtils.lerp(c.rotation.y, c.userData.isOpen ? c.userData.openRotation : c.userData.baseRotation, LERP_SPEED);
            } else if (c.userData.type === 'drawer' || c.userData.type === 'cabinet_drawer') {
                c.position.z = THREE.MathUtils.lerp(c.position.z, c.userData.isOpen ? c.userData.openZ : c.userData.baseZ, LERP_SPEED);
            }
        }
    });
    controls.update();
    renderer.render(scene, camera);
}

window.saveAndOrder = () => {
    const totalEl = document.getElementById('totalPrice');
    if (!totalEl) { console.error('Element totalPrice tidak ditemukan'); return; }

    let finishingLabel = 'Putih (Default)';
    if (currentTexture) {
        finishingLabel = localStorage.getItem('selectedFinishingName') || 'Tekstur Custom';
    } else if (currentColor !== '#ffffff') {
        finishingLabel = localStorage.getItem('selectedFinishingName') || currentColor;
    }

    const totalPriceRaw = totalEl.textContent.replace(/[^0-9]/g, '');

    // Render satu frame dulu, baru screenshot
    renderer.render(scene, camera);
    const screenshot = renderer.domElement.toDataURL('image/jpeg', 0.85);
    sessionStorage.setItem('orderScreenshot', screenshot);

    const params = new URLSearchParams({
        productId:   currentProduct?.id   || '1',
        productName: currentProduct?.name || productType,
        productType: productType,
        totalPrice:  totalPriceRaw,
        finishing:   finishingLabel,
        config:      encodeURIComponent(JSON.stringify(getCurrentConfig()))
    });
    // Tambah di dalam window.saveAndOrder, sebelum redirect
    const texPath = sessionStorage.getItem('lastTexturePath') || null;
    sessionStorage.setItem('orderTexturePath', texPath || '');

    window.location.href = `order.html?${params.toString()}`;
};

function getCurrentConfig() {
    if (productType === 'rack') return {
        width:  Math.round(customConfig.width * 100),
        height: Math.round(customConfig.height * 100),
        depth:  Math.round(customConfig.depth * 100),
        cols: rackCols, rows: rackRows
    };
    if (productType === 'hiro') return { drawer: numDrawer, laci: numLaci };
    if (productType === 'hiro_rak2drawer') return { drawer: numRak2Drawer, laci: numRak2Laci };
    if (productType === 'lemari') return {
        rodPosition:     lemariConfig.rodPosition,
        leftRak:         lemariConfig.leftRak,
        rightRakTop:     lemariConfig.rightRakTop,
        rightRakBottom:  lemariConfig.rightRakBottom
    };
    if (productType === 'lemari2pintubiasa') return {
        kiriMode:    lemari2Config.kiriMode,
        kiriRak:     lemari2Config.kiriRak,
        kananRak:    lemari2Config.kananRak,
        kananDrawer: lemari2Config.kananDrawer
    };
    return {};
}
window.currentFinishing = 'Putih'; 
window.currentTexture = null; 

// 2. Fungsi dipanggil saat tombol HTML diklik
window.selectTexture = function(type, path, name, btn) {
    window.currentFinishing = name; 
    
    // Hapus border aktif di semua tombol
    document.querySelectorAll('.texture-btn').forEach(b => {
        b.classList.remove('border-stone-900', 'ring-1', 'ring-stone-900');
        b.classList.add('border-stone-200');
    });
    // Tambah border ke tombol yang sedang diklik
    if (btn) {
        btn.classList.remove('border-stone-200');
        btn.classList.add('border-stone-900', 'ring-1', 'ring-stone-900');
    }

    // SELALU LOAD GAMBAR TEKSTUR DARI HTML (Termasuk Putih & Abu)
    if (path) {
        window.currentTexture = textureLoader.load(path, (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(1, 1);
            tex.colorSpace = THREE.SRGBColorSpace;
            
            // PENTING: Gunakan updateDisplay() alih-alih applyMat()
            // Agar model 3D di-rebuild dari nol dan kaca/gagang tidak ikut ketimpa
            updateDisplay();
        });
    } else {
        window.currentTexture = null;
        updateDisplay();
    }

    // Hitung ulang harga
    updatePriceUI();
};
init();