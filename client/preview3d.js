import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// ── State ────────────────────────────────────────────
let scene, camera, renderer, controls, raycaster, mouse;
let mainGroup, rackGroup, modelPrototype, modelOriginalBox;
let currentTexture = null, currentColor = '#ffffff';
const textureLoader = new THREE.TextureLoader();
const loader = new GLTFLoader();
const LERP_SPEED = 0.1;

// Config dari order page (diset sebelum init)
export let previewConfig = {
    productType: 'rack',
    config: {},
    finishing: null,
    texturePath: null,
};

// Parts cache — sama persis dengan custom.js
const hiroParts     = { frame:null, laci:null, drawer:null, feet:null };
const hiroRak2Parts = { frameAtas:null, frameBawah:null, rak:null, kaki:null, drawer:null };
const cabinetParts  = { frame:null, doorLeft:null, doorRight:null, drawer:null };
const lemariParts   = { frame:null, doorLeft:null, doorRightTop:null, doorRightBottom:null, rak:null, rakKananAtas:null, rod:null };
const lemari2Parts  = { frame:null, gantungan:null, rak:null, drawer:null, pintuKiri:null, pintuKanan:null };

let rackCols=3, rackRows=3, numDrawer=2, numLaci=1, numRak2Drawer=2, numRak2Laci=2;
let cabinetDoorTypes = Array(10).fill('left');
let lemariConfig  = { leftRak:1, rodPosition:'atas', rightRakTop:1, rightRakBottom:1 };
let lemari2Config = { kiriMode:'gantungan', kiriRak:0, kananRak:2, kananDrawer:1 };

// ── Init ─────────────────────────────────────────────
export async function initPreview(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Apply config
    const c = config.config || {};
    const pt = config.productType || 'rack';

    if (pt === 'rack') {
        if (c.width)  previewConfig.width  = c.width  / 100;
        if (c.height) previewConfig.height = c.height / 100;
        if (c.depth)  previewConfig.depth  = c.depth  / 100;
        rackCols = c.cols || 3;
        rackRows = c.rows || 3;
    } else if (pt === 'hiro') {
        numDrawer = c.drawer ?? 2;
        numLaci   = c.laci   ?? 1;
    } else if (pt === 'hiro_rak2drawer') {
        numRak2Drawer = c.drawer ?? 2;
        numRak2Laci   = c.laci   ?? 2;
    } else if (pt === 'lemari') {
        lemariConfig.rodPosition    = c.rodPosition    || 'atas';
        lemariConfig.leftRak        = c.leftRak        ?? 1;
        lemariConfig.rightRakTop    = c.rightRakTop    ?? 1;
        lemariConfig.rightRakBottom = c.rightRakBottom ?? 1;
    } else if (pt === 'lemari2pintubiasa') {
        lemari2Config.kiriMode    = c.kiriMode    || 'gantungan';
        lemari2Config.kiriRak     = c.kiriRak     ?? 0;
        lemari2Config.kananRak    = c.kananRak    ?? 2;
        lemari2Config.kananDrawer = c.kananDrawer ?? 1;
    }

    setupScene(container);
    setupLights();
    setupEnvironment();

    mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // Load texture jika ada
    if (config.texturePath) {
        await new Promise(resolve => {
            currentTexture = textureLoader.load(config.texturePath, tex => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(2, 2);
                tex.colorSpace = THREE.SRGBColorSpace;
                resolve();
            });
        });
    }

    await loadModel(pt);
    setupInteraction(container);
    animate();

    // Hapus loading indicator
    const fallback = document.getElementById('imgFallback');
    if (fallback) fallback.remove();
}

function setupScene(container) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3e3c3a);
    scene.fog = new THREE.Fog(0xe8e6e1, 25, 70);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.2, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.8, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(5, 12, 8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left=-10; key.shadow.camera.right=10;
    key.shadow.camera.top=10;   key.shadow.camera.bottom=-10;
    key.shadow.bias = -0.001;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-6, 6, 4); scene.add(fill);
    const front = new THREE.DirectionalLight(0xffffff, 0.4);
    front.position.set(0, 2, 10); scene.add(front);
}

function setupEnvironment() {
    const floorMat = new THREE.MeshStandardMaterial({ color:0x6b6560, roughness:0.85 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50,50), floorMat);
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color:0x4a4845, roughness:1.0 });
    const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(50,20), wallMat);
    wallBack.position.set(0,10,-8); scene.add(wallBack);
    const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(50,20), wallMat.clone());
    wallLeft.rotation.y = Math.PI/2; wallLeft.position.set(-8,10,0); scene.add(wallLeft);
}

// ── Apply material ────────────────────────────────────
function applyMat(obj) {
    obj.traverse(n => {
        if (!n.isMesh || !n.material) return;
        n.castShadow = n.receiveShadow = true;
        n.material = n.material.clone();
        n.material.side = THREE.DoubleSide;
        n.material.transparent = false;
        const r=n.material.color.r, g=n.material.color.g, b=n.material.color.b;
        const isGrey = Math.abs(r-g)<0.05 && Math.abs(g-b)<0.05 && r<0.85;
        const isKnob = (n.name+' '+n.material.name).toLowerCase().match(/handle|knob|gagang|kenop/);
        if (!isGrey && !isKnob) {
            if (currentTexture) { n.material.map = currentTexture; n.material.color.set('#ffffff'); }
            else { n.material.map = null; n.material.color.set(currentColor); }
        }
        n.material.roughness = 0.5; n.material.metalness = 0.1;
        n.material.needsUpdate = true;
    });
}

function getInfo(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    return { height:size.y, minY:box.min.y, maxY:box.max.y };
}

function getStates() {
    const s = { drawer:{}, cabinet:{} };
    if (!rackGroup) return s;
    rackGroup.traverse(n => {
        if (n.userData?.isOpen) {
            if (n.userData.type==='drawer') s.drawer[n.userData.id]=true;
            else if (n.userData.type==='cabinet_door'||n.userData.type==='cabinet_drawer') s.cabinet[n.userData.id]=true;
        }
    });
    return s;
}

// ── Load model (sama seperti custom.js) ──────────────
async function loadModel(pt) {
    if (pt === 'hiro') {
        const [f,dw,lc,ft] = await Promise.all([
            loader.loadAsync('./models/frame-hiro-drawer.glb'),
            loader.loadAsync('./models/drawer-hiro-drawer.glb'),
            loader.loadAsync('./models/laci-hiro-drawer.glb'),
            loader.loadAsync('./models/kaki-hiro-drawer.glb'),
        ]);
        hiroParts.frame=f.scene; hiroParts.drawer=dw.scene; hiroParts.laci=lc.scene; hiroParts.feet=ft.scene;
        modelPrototype=hiroParts.frame; modelOriginalBox=new THREE.Box3().setFromObject(hiroParts.frame);
        buildAndDisplay(pt); focusCamera();
    }
    else if (pt === 'hiro_rak2drawer') {
        const [fA,fB,rk,kk,dr] = await Promise.all([
            loader.loadAsync('./models/frameatashirorak2drawer.glb'),
            loader.loadAsync('./models/framebawahhirorak2drawer.glb'),
            loader.loadAsync('./models/rakhirorak2drawer.glb'),
            loader.loadAsync('./models/kakihirorak2drawer.glb'),
            loader.loadAsync('./models/drawerhirorak2drawer.glb'),
        ]);
        hiroRak2Parts.frameAtas=fA.scene; hiroRak2Parts.frameBawah=fB.scene;
        hiroRak2Parts.rak=rk.scene; hiroRak2Parts.kaki=kk.scene; hiroRak2Parts.drawer=dr.scene;
        modelPrototype=fA.scene; modelOriginalBox=new THREE.Box3().setFromObject(fA.scene);
        buildAndDisplay(pt); focusCamera();
    }
    else if (pt === 'lemari_kabinet') {
        const [f,pL,pR,dr] = await Promise.all([
            loader.loadAsync('./models/frame-lemari-kabinet.glb'),
            loader.loadAsync('./models/pintu-lemari-kabinet.glb'),
            loader.loadAsync('./models/pintu-lemari-kabinet-tarikkanan.glb'),
            loader.loadAsync('./models/pintu-lemari-kabinet-dorong.glb'),
        ]);
        cabinetParts.frame=f.scene; cabinetParts.doorLeft=pL.scene;
        cabinetParts.doorRight=pR.scene; cabinetParts.drawer=dr.scene;
        modelPrototype=f.scene; modelOriginalBox=new THREE.Box3().setFromObject(f.scene);
        buildAndDisplay(pt); focusCamera();
    }
    else if (pt === 'lemari') {
        const [f,dL,dRT,dRB,rk,rkTop,rd] = await Promise.all([
            loader.loadAsync('./models/framelemari2pintu.glb'),
            loader.loadAsync('./models/pintulemari2kiri.glb'),
            loader.loadAsync('./models/pintulemari2kananatas.glb'),
            loader.loadAsync('./models/pintulemari2kananbawah.glb'),
            loader.loadAsync('./models/raklemari2pintu.glb'),
            loader.loadAsync('./models/rakkananataslemari2pintu.glb').catch(()=>null),
            loader.loadAsync('./models/gantunganbajulemari2pintu.glb'),
        ]);
        lemariParts.frame=f.scene; lemariParts.doorLeft=dL.scene;
        lemariParts.doorRightTop=dRT.scene; lemariParts.doorRightBottom=dRB.scene;
        lemariParts.rak=rk.scene; lemariParts.rakKananAtas=rkTop?rkTop.scene:rk.scene;
        lemariParts.rod=rd.scene;
        modelPrototype=f.scene; modelOriginalBox=new THREE.Box3().setFromObject(f.scene);
        buildAndDisplay(pt); focusCamera();
    }
    else if (pt === 'lemari2pintubiasa') {
        const [f,g,rk,dr,pK,pKn] = await Promise.all([
            loader.loadAsync('./models/framelemari2pintubiasa.glb'),
            loader.loadAsync('./models/gantunganlemari2pintubiasa.glb'),
            loader.loadAsync('./models/raklemari2pintubiasa.glb'),
            loader.loadAsync('./models/drawerlemari2pintubiasa.glb'),
            loader.loadAsync('./models/pintukirilemari2pintubiasa.glb'),
            loader.loadAsync('./models/pintukananlemari2pintubiasa.glb'),
        ]);
        lemari2Parts.frame=f.scene; lemari2Parts.gantungan=g.scene;
        lemari2Parts.rak=rk.scene; lemari2Parts.drawer=dr.scene;
        lemari2Parts.pintuKiri=pK.scene; lemari2Parts.pintuKanan=pKn.scene;
        modelPrototype=f.scene; modelOriginalBox=new THREE.Box3().setFromObject(f.scene);
        buildAndDisplay(pt); focusCamera();
    }
    else {
        // rack default
        loader.load('./models/rakfix.glb', gltf => {
            modelPrototype=gltf.scene; modelOriginalBox=new THREE.Box3().setFromObject(modelPrototype);
            buildAndDisplay('rack'); focusCamera();
        });
    }
}

function buildAndDisplay(pt) {
    const states = getStates();
    if (rackGroup) mainGroup.remove(rackGroup);
    rackGroup = new THREE.Group();

    if      (pt==='hiro')            buildHiro(states);
    else if (pt==='hiro_rak2drawer') buildHiroRak2(states);
    else if (pt==='lemari_kabinet')  buildCabinet(states);
    else if (pt==='lemari')          buildLemari(states);
    else if (pt==='lemari2pintubiasa') buildLemari2(states);
    else                             buildStandard();

    const box = new THREE.Box3().setFromObject(rackGroup);
    const center = new THREE.Vector3(); box.getCenter(center);
    rackGroup.position.set(-center.x, Math.abs(box.min.y)+0.01, -center.z);
    mainGroup.add(rackGroup);
}

// ── Build functions (copy dari custom.js) ────────────
function buildHiro(states) {
    const feet = hiroParts.feet.clone(); applyMat(feet); rackGroup.add(feet);
    const feetInfo = getInfo(feet); let currentY = feetInfo.maxY+0.01;
    const frameRaw = getInfo(hiroParts.frame);
    for (let i=0;i<numDrawer;i++) {
        const el=hiroParts.drawer.clone(); const info=getInfo(el); el.position.y=currentY-info.minY;
        const isOpen=states.drawer[i]||false;
        el.userData={type:'drawer',id:i,canOpen:true,isOpen,baseZ:0,openZ:0.9};
        if(isOpen)el.position.z=0.9;
        applyMat(el); rackGroup.add(el); currentY+=info.height+0.01;
    }
    for (let j=0;j<numLaci;j++) {
        const el=hiroParts.laci.clone(); const info=getInfo(el); el.position.y=currentY-info.minY;
        el.userData={type:'laci',id:j,canOpen:false};
        applyMat(el); rackGroup.add(el); currentY+=info.height+0.01;
    }
    const frame=hiroParts.frame.clone(); const targetH=Math.max(currentY-feetInfo.maxY,0.5);
    const scaleY=targetH/frameRaw.height; frame.scale.set(1,scaleY,1);
    frame.position.y=feetInfo.maxY-(frameRaw.minY*scaleY);
    applyMat(frame); rackGroup.add(frame);
}

function buildHiroRak2(states) {
    const GAP=0.016, RAK_GAP=2;
    const kaki=hiroRak2Parts.kaki.clone(); applyMat(kaki); rackGroup.add(kaki);
    const kakiInfo=getInfo(kaki); let currentY=kakiInfo.maxY+0.005;
    const fBRaw=getInfo(hiroRak2Parts.frameBawah), drRaw=getInfo(hiroRak2Parts.drawer);
    const totalDH=(drRaw.height*numRak2Drawer)+(GAP*(numRak2Drawer-1));
    const scaleYB=totalDH/fBRaw.height;
    const fB=hiroRak2Parts.frameBawah.clone(); fB.scale.set(1,scaleYB,1);
    fB.position.y=currentY-(fBRaw.minY*scaleYB); applyMat(fB); rackGroup.add(fB);
    let dY=currentY;
    for(let i=0;i<numRak2Drawer;i++){
        const dr=hiroRak2Parts.drawer.clone(); const info=getInfo(dr); dr.position.y=dY-info.minY;
        const isOpen=states.drawer[`d_${i}`]||false;
        dr.userData={type:'drawer',id:`d_${i}`,canOpen:true,isOpen,baseZ:0,openZ:0.4};
        if(isOpen)dr.position.z=0.4;
        applyMat(dr); rackGroup.add(dr); dY+=info.height+GAP;
    }
    currentY+=totalDH+GAP;
    const fARaw=getInfo(hiroRak2Parts.frameAtas), rkRaw=getInfo(hiroRak2Parts.rak);
    const totalLH=(rkRaw.height*numRak2Laci)+(RAK_GAP*(numRak2Laci+1));
    const scaleYA=totalLH/fARaw.height;
    const fA=hiroRak2Parts.frameAtas.clone(); fA.scale.set(1,scaleYA,1);
    fA.position.y=currentY-(fARaw.minY*scaleYA); applyMat(fA); rackGroup.add(fA);
    let lY=currentY+RAK_GAP;
    for(let j=0;j<numRak2Laci;j++){
        const rk=hiroRak2Parts.rak.clone(); const info=getInfo(rk); rk.position.y=lY-info.minY;
        rk.userData={type:'laci',id:`l_${j}`,canOpen:false};
        applyMat(rk); rackGroup.add(rk); lY+=info.height+RAK_GAP;
    }
}

function buildCabinet(states) {
    const size=new THREE.Vector3(); modelOriginalBox.getSize(size);
    const wallThick=0.015, overlapX=size.x-wallThick, overlapY=size.y-wallThick;
    for(let r=0;r<rackRows;r++){
        for(let c=0;c<rackCols;c++){
            const unit=new THREE.Group(); const frame=cabinetParts.frame.clone(); applyMat(frame); unit.add(frame);
            const hinge=new THREE.Group(); const unitId=`${r}_${c}`;
            const isOpen=states.cabinet[unitId]||false; const doorType=cabinetDoorTypes[c]||'left';
            const fBox=new THREE.Box3().setFromObject(frame); const pivotZ=fBox.max.z;
            const targetW=size.x-0.02, targetH=size.y-0.02, innerCY=(fBox.max.y+fBox.min.y)/2;
            if(doorType==='left'){
                const door=cabinetParts.doorLeft.clone(); applyMat(door);
                door.position.set(0,0,0); const dBox=new THREE.Box3().setFromObject(door);
                const dW=dBox.max.x-dBox.min.x, dH=dBox.max.y-dBox.min.y;
                door.position.set(-((dBox.max.x+dBox.min.x)/2),-((dBox.max.y+dBox.min.y)/2),-dBox.max.z);
                const dw=new THREE.Group(); dw.add(door); dw.scale.set(targetW/dW,targetH/dH,1);
                hinge.position.set(fBox.min.x+wallThick,0,pivotZ); dw.position.set((targetW/2)-0.005,innerCY,0);
                hinge.userData={type:'cabinet_door',id:unitId,canOpen:true,isOpen,baseRotation:0,openRotation:-Math.PI/1.8};
                if(isOpen)hinge.rotation.y=hinge.userData.openRotation; hinge.add(dw);
            } else if(doorType==='right'){
                const door=cabinetParts.doorRight.clone(); applyMat(door);
                door.position.set(0,0,0); const dBox=new THREE.Box3().setFromObject(door);
                const dW=dBox.max.x-dBox.min.x, dH=dBox.max.y-dBox.min.y;
                door.position.set(-((dBox.max.x+dBox.min.x)/2),-((dBox.max.y+dBox.min.y)/2),-dBox.max.z);
                const dw=new THREE.Group(); dw.add(door); dw.scale.set(targetW/dW,targetH/dH,1);
                hinge.position.set(fBox.max.x-wallThick,0,pivotZ); dw.position.set(-(targetW/2)+0.005,innerCY,0);
                hinge.userData={type:'cabinet_door',id:unitId,canOpen:true,isOpen,baseRotation:0,openRotation:Math.PI/1.8};
                if(isOpen)hinge.rotation.y=hinge.userData.openRotation; hinge.add(dw);
            } else {
                const door=cabinetParts.drawer.clone(); applyMat(door);
                door.position.set(0,0,0); const dBox=new THREE.Box3().setFromObject(door);
                const dW=dBox.max.x-dBox.min.x, dH=dBox.max.y-dBox.min.y;
                door.position.set(-((dBox.max.x+dBox.min.x)/2),-((dBox.max.y+dBox.min.y)/2),-dBox.max.z);
                const dw=new THREE.Group(); dw.add(door); dw.scale.set(targetW/dW,targetH/dH,1);
                hinge.position.set((fBox.min.x+fBox.max.x)/2,0,pivotZ); dw.position.set(0,innerCY,0);
                hinge.userData={type:'cabinet_drawer',id:unitId,canOpen:true,isOpen,baseZ:pivotZ+0.1,openZ:pivotZ+2};
                if(isOpen)hinge.position.z=hinge.userData.openZ; hinge.add(dw);
            }
            unit.add(hinge); unit.position.set(c*overlapX,r*overlapY,0); rackGroup.add(unit);
        }
    }
}

function buildLemari(states) {
    if(!lemariParts.frame)return;
    const unit=new THREE.Group(); const frame=lemariParts.frame.clone(); applyMat(frame); unit.add(frame);
    const fBox=new THREE.Box3().setFromObject(frame);
    const wCenter=new THREE.Vector3(); fBox.getCenter(wCenter);
    const intMinY=fBox.min.y+0.1, intMaxY=fBox.max.y-0.1;

    const attachDoor=(doorModel,isLeft,idStr)=>{
        const door=doorModel.clone(); applyMat(door); door.position.set(0,0,0);
        const dBox=new THREE.Box3().setFromObject(door);
        const hinge=new THREE.Group();
        const pivotX=isLeft?dBox.min.x:dBox.max.x;
        const pivotZ=dBox.min.z+0.018;
        let offsetZ=0.015; if(idStr==='lemari_kanan_atas')offsetZ+=0.1;
        let openAngle=Math.PI/1.8; if(idStr==='lemari_kanan_atas')openAngle=Math.PI/2;
        hinge.position.set(pivotX,0,pivotZ+offsetZ); door.position.set(-pivotX,0,-pivotZ);
        hinge.userData={type:'cabinet_door',id:idStr,canOpen:true,isOpen:states.cabinet[idStr]||false,baseRotation:0,openRotation:isLeft?-openAngle:openAngle};
        if(hinge.userData.isOpen)hinge.rotation.y=hinge.userData.openRotation;
        hinge.add(door); unit.add(hinge);
    };
    attachDoor(lemariParts.doorLeft,true,'lemari_kiri');
    attachDoor(lemariParts.doorRightTop,false,'lemari_kanan_atas');
    attachDoor(lemariParts.doorRightBottom,false,'lemari_kanan_bawah');

    lemariParts.doorRightBottom.position.set(0,0,0);
    const drbBox=new THREE.Box3().setFromObject(lemariParts.doorRightBottom);
    const splitY=drbBox.max.y+0.02;
    const totalWidth=fBox.max.x-fBox.min.x, wallThick=0.015;
    const compWidth=((totalWidth-(3*wallThick))/2)+0.01;
    const leftCX=fBox.min.x+wallThick+(compWidth/2), rightCX=fBox.max.x-wallThick-(compWidth/2);

    lemariParts.rak.position.set(0,0,0);
    const rBox=new THREE.Box3().setFromObject(lemariParts.rak);
    const scaleXRak=(rBox.max.x-rBox.min.x)>0?compWidth/(rBox.max.x-rBox.min.x):1;
    lemariParts.rakKananAtas.position.set(0,0,0);
    const rTopBox=new THREE.Box3().setFromObject(lemariParts.rakKananAtas);
    const scaleXRakTop=(rTopBox.max.x-rTopBox.min.x)>0?compWidth/(rTopBox.max.x-rTopBox.min.x):1;
    lemariParts.rod.position.set(0,0,0);
    const gBox=new THREE.Box3().setFromObject(lemariParts.rod);
    const scaleXRod=(gBox.max.x-gBox.min.x)>0?compWidth/(gBox.max.x-gBox.min.x):1;

    const addRak=(xC,yP)=>{const rak=lemariParts.rak.clone();applyMat(rak);rak.position.set(-((rBox.max.x+rBox.min.x)/2),-rBox.min.y,-((rBox.max.z+rBox.min.z)/2));const w=new THREE.Group();w.add(rak);w.scale.set(scaleXRak,1,1);w.position.set(xC,yP,wCenter.z);unit.add(w);};
    const addRakTop=(xC,yP)=>{const r=lemariParts.rakKananAtas.clone();applyMat(r);r.position.set(-((rTopBox.max.x+rTopBox.min.x)/2),-rTopBox.min.y,-((rTopBox.max.z+rTopBox.min.z)/2));const w=new THREE.Group();w.add(r);w.scale.set(scaleXRakTop,1,1);w.position.set(xC,yP,wCenter.z-0.5);unit.add(w);};
    const addRod=(xC,yP)=>{const rod=lemariParts.rod.clone();applyMat(rod);rod.position.set(-((gBox.max.x+gBox.min.x)/2),-gBox.max.y,-((gBox.max.z+gBox.min.z)/2));const w=new THREE.Group();w.add(rod);w.scale.set(scaleXRod,1,1);w.position.set(xC,yP,wCenter.z);unit.add(w);};
    const distRacks=(xC,sY,eY,cnt)=>{if(cnt<=0)return;const sp=(eY-sY)/(cnt+1);for(let i=1;i<=cnt;i++)addRak(xC,sY+(sp*i));};

    const pos=lemariConfig.rodPosition;
    const actualRak=Math.min(lemariConfig.leftRak,pos==='tidak_ada'?4:3);
    if(pos==='tidak_ada')distRacks(leftCX,intMinY,intMaxY,actualRak);
    else if(pos==='atas'){addRod(leftCX,intMaxY-0.08);distRacks(leftCX,intMinY,splitY,actualRak);}
    else if(pos==='tengah'){const rodY=splitY;addRod(leftCX,rodY);if(actualRak>0){const sY=rodY+0.3,eY=intMaxY-0.05,sp=(eY-sY)/actualRak;for(let i=0;i<actualRak;i++)addRak(leftCX,sY+(sp*i));}}
    else if(pos==='atas_tengah'){const rodY=splitY+((intMaxY-splitY)/2);addRod(leftCX,rodY);if(actualRak>=1)addRak(leftCX,rodY+0.15);const rb=Math.max(0,actualRak-1);if(rb>0){const bE=intMinY+((rodY-intMinY)*0.6),bS=intMinY+0.12,sp=(bE-bS)/(rb+1);for(let i=1;i<=rb;i++)addRak(leftCX,bS+(sp*i));}}

    if(lemariConfig.rightRakTop>=1){const sp=(intMaxY-splitY)/(lemariConfig.rightRakTop+1);for(let i=1;i<=lemariConfig.rightRakTop;i++)addRakTop(rightCX,splitY+(sp*i));}
    if(lemariConfig.rightRakBottom>=1){const sp=(splitY-intMinY)/(lemariConfig.rightRakBottom+1);for(let i=1;i<=lemariConfig.rightRakBottom;i++)addRak(rightCX,intMinY+(sp*i));}
    rackGroup.add(unit);
}

function buildLemari2(states) {
    if(!lemari2Parts.frame)return;
    const unit=new THREE.Group(); const frame=lemari2Parts.frame.clone(); applyMat(frame); unit.add(frame);
    const fBox=new THREE.Box3().setFromObject(frame);
    const wCenter=new THREE.Vector3(); fBox.getCenter(wCenter);
    const intMinY=fBox.min.y+0.08, intMaxY=fBox.max.y-0.22;
    const splitY=intMinY+((intMaxY-intMinY)*0.5);

    const attachDoor2=(doorModel,isLeft,idStr)=>{
        const door=doorModel.clone(); applyMat(door); door.position.set(0,0,0);
        const dBox=new THREE.Box3().setFromObject(door);
        const hinge=new THREE.Group();
        const pivotX=isLeft?dBox.min.x:dBox.max.x, pivotZ=dBox.min.z+0.018;
        hinge.position.set(pivotX,0,pivotZ+0.015); door.position.set(-pivotX,0,-pivotZ);
        hinge.userData={type:'cabinet_door',id:idStr,canOpen:true,isOpen:states.cabinet[idStr]||false,baseRotation:0,openRotation:isLeft?-Math.PI/1.8:Math.PI/1.8};
        if(hinge.userData.isOpen)hinge.rotation.y=hinge.userData.openRotation;
        hinge.add(door); unit.add(hinge);
    };
    attachDoor2(lemari2Parts.pintuKiri,true,'lemari2_kiri');
    attachDoor2(lemari2Parts.pintuKanan,false,'lemari2_kanan');

    const totalWidth=fBox.max.x-fBox.min.x, wallThick=0.015;
    const compWidth=((totalWidth-(3*wallThick))/2)+0.01;
    const leftCX=fBox.min.x+wallThick+(compWidth/2), rightCX=fBox.max.x-wallThick-(compWidth/2);

    lemari2Parts.rak.position.set(0,0,0);
    const rBox=new THREE.Box3().setFromObject(lemari2Parts.rak);
    const scaleXRak=compWidth/(rBox.max.x-rBox.min.x), rakH=rBox.max.y-rBox.min.y;
    lemari2Parts.gantungan.position.set(0,0,0);
    const gBox=new THREE.Box3().setFromObject(lemari2Parts.gantungan);
    const scaleXG=compWidth/(gBox.max.x-gBox.min.x);
    lemari2Parts.drawer.position.set(0,0,0);
    const drBox=new THREE.Box3().setFromObject(lemari2Parts.drawer);
    const drawerH=drBox.max.y-drBox.min.y;

    const addRak2=(xC,yP)=>{const rak=lemari2Parts.rak.clone();applyMat(rak);rak.position.set(-((rBox.max.x+rBox.min.x)/2),-rBox.min.y,-((rBox.max.z+rBox.min.z)/2));const w=new THREE.Group();w.add(rak);w.scale.set(scaleXRak,1,1);w.position.set(xC-0.01,yP,wCenter.z);unit.add(w);};
    const addGantungan2=(xC,yP)=>{const g=lemari2Parts.gantungan.clone();applyMat(g);g.position.set(-((gBox.max.x+gBox.min.x)/2),-gBox.max.y,-((gBox.max.z+gBox.min.z)/2));const w=new THREE.Group();w.add(g);w.scale.set(scaleXG,1,1);w.position.set(xC,yP,wCenter.z);unit.add(w);};
    const addDrawer2=(xC,yP,id)=>{
        const dr=lemari2Parts.drawer.clone(); applyMat(dr);
        dr.position.set(-((drBox.max.x+drBox.min.x)/2),-drBox.min.y,-((drBox.max.z+drBox.min.z)/2));
        const drScale=compWidth*0.94/(drBox.max.x-drBox.min.x);
        const lebarBaru=(drBox.max.x-drBox.min.x)*drScale, selisih=(compWidth-lebarBaru)/2;
        const w=new THREE.Group(); w.add(dr); w.scale.set(drScale,1,1);
        w.position.set(xC-selisih,yP,wCenter.z);
        const isOpen=states.cabinet[id]||false;
        w.userData={type:'cabinet_drawer',id,canOpen:true,isOpen,baseZ:wCenter.z,openZ:wCenter.z+1.5};
        if(isOpen)w.position.z=wCenter.z+0.35;
        unit.add(w);
    };

    if(lemari2Config.kiriMode==='gantungan'){addGantungan2(leftCX,splitY+2.6);}
    else{const rakKiri=Math.min(lemari2Config.kiriRak,3);if(rakKiri>0){const gap=2,totalRH=rakKiri*rakH+(rakKiri-1)*gap,sY=intMinY+((intMaxY-intMinY-totalRH)/3.5);for(let i=0;i<rakKiri;i++)addRak2(leftCX,sY+i*(rakH+gap));}}

    const maxRK=lemari2Config.kananDrawer>0?2:3, rakKanan=Math.min(lemari2Config.kananRak,maxRK);
    if(lemari2Config.kananDrawer>0){
        const dY=splitY-drawerH*0.5-0.02; addDrawer2(rightCX,dY,'lemari2_drawer');
        if(rakKanan>=1)addRak2(rightCX,dY+drawerH*0.5+rakH*0.5+0.5);
        if(rakKanan>=2)addRak2(rightCX,dY-drawerH*0.5-rakH*0.5-2);
    } else {
        if(rakKanan>0){const gap=2,totalRH=rakKanan*rakH+(rakKanan-1)*gap,sY=intMinY+((intMaxY-intMinY-totalRH)/3.5);for(let i=0;i<rakKanan;i++)addRak2(rightCX,sY+i*(rakH+gap));}
    }
    rackGroup.add(unit);
}

function buildStandard() {
    const cfg = previewConfig;
    const size=new THREE.Vector3(); modelOriginalBox.getSize(size);
    const sX=(cfg.width||1.125)/size.x, sY=(cfg.height||1.125)/size.y, sZ=(cfg.depth||0.4)/size.z;
    const offX=rackCols>1?0.042:0, offY=rackRows>1?0.095:0;
    for(let r=0;r<rackRows;r++){
        for(let c=0;c<rackCols;c++){
            const clone=modelPrototype.clone(); clone.scale.set(sX,sY,sZ);
            clone.position.set(c*(sX*size.x-offX),r*(sY*size.y-offY),0);
            applyMat(clone); rackGroup.add(clone);
        }
    }
}

// ── Camera focus ─────────────────────────────────────
function focusCamera() {
    const box=new THREE.Box3().setFromObject(mainGroup);
    const center=new THREE.Vector3(); const size=new THREE.Vector3();
    box.getCenter(center); box.getSize(size);
    controls.target.copy(center);
    const d=Math.max(size.x,size.y)*2.5;
    camera.position.set(center.x,center.y,d);
    controls.update();
}

// ── Interaction ──────────────────────────────────────
function setupInteraction(container) {
    container.addEventListener('pointermove', e => {
        const rect=renderer.domElement.getBoundingClientRect();
        mouse.x=((e.clientX-rect.left)/rect.width)*2-1;
        mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
        raycaster.setFromCamera(mouse,camera);
        const hits=raycaster.intersectObjects(rackGroup?.children||[],true);
        let hover=false;
        if(hits.length>0){let t=hits[0].object;while(t.parent&&t.parent!==rackGroup){if(t.userData?.canOpen){hover=true;break;}t=t.parent;}}
        container.style.cursor=hover?'pointer':'default';
    });
    container.addEventListener('pointerdown', () => {
        if(!rackGroup)return;
        raycaster.setFromCamera(mouse,camera);
        const hits=raycaster.intersectObjects(rackGroup.children,true);
        if(hits.length>0){let t=hits[0].object;while(t&&t!==rackGroup){if(t.userData?.canOpen){t.userData.isOpen=!t.userData.isOpen;break;}t=t.parent;}}
    });
}

// ── Animate ──────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    if(rackGroup) rackGroup.traverse(c=>{
        if(c.userData?.canOpen){
            if(c.userData.type==='cabinet_door'){
                c.rotation.y=THREE.MathUtils.lerp(c.rotation.y,c.userData.isOpen?c.userData.openRotation:c.userData.baseRotation,LERP_SPEED);
            } else if(c.userData.type==='drawer'||c.userData.type==='cabinet_drawer'){
                c.position.z=THREE.MathUtils.lerp(c.position.z,c.userData.isOpen?c.userData.openZ:c.userData.baseZ,LERP_SPEED);
            }
        }
    });
    controls.update();
    renderer.render(scene,camera);
}