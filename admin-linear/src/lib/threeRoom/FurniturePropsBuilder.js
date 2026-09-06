/**
 * FurniturePropsBuilder.js
 * 
 * Procedural PBR furniture and decor for Lera's room:
 * - Work desk with MacBook (emissive screen), coffee mug, notebook & desk lamp.
 * - Double bed with linen, textured throw blanket, pillows & bedside nightstand.
 * - Vintage brass floor lamp with warm ambient glow.
 * - Industrial wardrobe clothes rail with hangers (beige trench coat, hoodie, yellow raincoat).
 * - Bookshelf with books, ceramic vases and camera.
 * - Monstera in terracotta pot on the windowsill.
 * - Soft woven wool floor rug.
 * - Pre-baked contact shadow planes beneath furniture (60 FPS optimization).
 */

import * as THREE from 'three';

export class FurniturePropsBuilder {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'room_furniture';
        this.scene.add(this.group);

        // Pre-allocate point lights references for toggle/controls
        this.lampLight = null;
        this.nightstandLight = null;
        this.macbookGlow = null;

        this.initMaterials();
        this.buildContactShadows();
        this.buildWorkDesk();
        this.buildBed();
        this.buildBedsideTable();
        this.buildFloorLamp();
        this.buildWardrobeRail();
        this.buildBookshelf();
        this.buildMonsteraPlant();
        this.buildCarpet();
    }

    /**
     * Shared materials across props to minimize GPU state changes
     */
    initMaterials() {
        // Ash wood (desk, shelves)
        this.woodMat = new THREE.MeshStandardMaterial({
            color: 0xc4a88b,
            roughness: 0.55,
            metalness: 0.05
        });

        // Dark walnut/teak (bed frame, accents)
        this.darkWoodMat = new THREE.MeshStandardMaterial({
            color: 0x5a3d28,
            roughness: 0.6,
            metalness: 0.05
        });

        // Matte black metal (rail, lamp details, chair legs)
        this.blackMetalMat = new THREE.MeshStandardMaterial({
            color: 0x1e2024,
            roughness: 0.4,
            metalness: 0.8
        });

        // Vintage brass (floor lamp)
        this.brassMat = new THREE.MeshStandardMaterial({
            color: 0xc8a85c,
            roughness: 0.35,
            metalness: 0.85
        });

        // Off-white fabric / linen (bedding, lampshade)
        this.linenMat = new THREE.MeshStandardMaterial({
            color: 0xf5f2eb,
            roughness: 0.9,
            metalness: 0.0
        });

        // Charcoal wool (plaid blanket, chair seat)
        this.woolMat = new THREE.MeshStandardMaterial({
            color: 0x3b4252,
            roughness: 0.95,
            metalness: 0.0
        });

        // Space gray aluminum (MacBook)
        this.aluminumMat = new THREE.MeshStandardMaterial({
            color: 0x475569,
            roughness: 0.3,
            metalness: 0.9
        });

        // Terracotta
        this.terracottaMat = new THREE.MeshStandardMaterial({
            color: 0xb45309,
            roughness: 0.8,
            metalness: 0.05
        });

        // Plant foliage
        this.leafMat = new THREE.MeshStandardMaterial({
            color: 0x15803d,
            roughness: 0.45,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
    }

    /**
     * Creates procedural canvas texture for MacBook display (code/editor interface)
     */
    createScreenTexture() {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Dark editor window background
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, 512, 320);

        // Window header bar with macOS traffic lights
        ctx.fillStyle = '#161b22';
        ctx.fillRect(0, 0, 512, 28);
        ctx.fillStyle = '#ff5f56';
        ctx.beginPath(); ctx.arc(16, 14, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffbd2e';
        ctx.beginPath(); ctx.arc(32, 14, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#27c93f';
        ctx.beginPath(); ctx.arc(48, 14, 5, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#8b949e';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, monospace';
        ctx.fillText('telegram_channel_post.md — Linear Studio', 70, 18);

        // Content lines
        ctx.fillStyle = '#7ee787';
        ctx.fillText('const lera = new StPetersburgCompanion();', 24, 60);

        ctx.fillStyle = '#79c0ff';
        ctx.fillText('// Утро на Петроградке, кофе и винтажные пластинки', 24, 85);

        ctx.fillStyle = '#d2a8ff';
        ctx.fillText('await lera.publishStory({', 24, 115);
        ctx.fillStyle = '#ffa657';
        ctx.fillText('  location: "Большой проспект П.С.",', 40, 140);
        ctx.fillText('  mood: "Уютный питерский дождь ☕",', 40, 165);
        ctx.fillText('  vibe: "normcore_vintage"', 40, 190);
        ctx.fillStyle = '#d2a8ff';
        ctx.fillText('});', 24, 215);

        // Terminal line at bottom
        ctx.fillStyle = '#21262d';
        ctx.fillRect(16, 250, 480, 50);
        ctx.fillStyle = '#58a6ff';
        ctx.fillText('✓ 3D Petersburg Map synced (60 FPS)', 28, 280);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    /**
     * Contact shadow plane helper
     */
    createContactShadow(w, d, opacity = 0.35) {
        const geo = new THREE.PlaneGeometry(w, d);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: opacity,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.002;
        return mesh;
    }

    buildContactShadows() {
        // Bed shadow
        const bedShadow = this.createContactShadow(1.7, 2.2, 0.4);
        bedShadow.position.set(1.6, 0.002, -1.45);
        this.group.add(bedShadow);

        // Desk shadow
        const deskShadow = this.createContactShadow(1.5, 0.85, 0.35);
        deskShadow.position.set(-1.8, 0.002, -1.9);
        this.group.add(deskShadow);

        // Wardrobe rail shadow
        const railShadow = this.createContactShadow(1.2, 0.55, 0.3);
        railShadow.position.set(2.2, 0.002, 1.15);
        this.group.add(railShadow);

        // Bookshelf shadow
        const shelfShadow = this.createContactShadow(0.85, 0.35, 0.35);
        shelfShadow.position.set(-2.75, 0.002, 0.0);
        this.group.add(shelfShadow);
    }

    /**
     * 1. Work Desk, MacBook, Chair & Accessories
     */
    buildWorkDesk() {
        const deskGroup = new THREE.Group();
        deskGroup.position.set(-1.8, 0, -1.9);

        // Tabletop (1.4m x 0.75m x 0.04m)
        const topGeo = new THREE.BoxGeometry(1.4, 0.04, 0.75);
        const topMesh = new THREE.Mesh(topGeo, this.woodMat);
        topMesh.position.set(0, 0.73, 0);
        topMesh.castShadow = true;
        topMesh.receiveShadow = true;
        deskGroup.add(topMesh);

        // 4 Sleek black metal desk legs
        const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.71, 10);
        const legPositions = [
            [-0.64, 0.355, -0.32],
            [0.64, 0.355, -0.32],
            [-0.64, 0.355, 0.32],
            [0.64, 0.355, 0.32]
        ];
        legPositions.forEach(([lx, ly, lz]) => {
            const leg = new THREE.Mesh(legGeo, this.blackMetalMat);
            leg.position.set(lx, ly, lz);
            leg.castShadow = true;
            deskGroup.add(leg);
        });

        // Minimalist desk drawer under right side
        const drawerGeo = new THREE.BoxGeometry(0.38, 0.12, 0.65);
        const drawerMesh = new THREE.Mesh(drawerGeo, this.woodMat);
        drawerMesh.position.set(0.45, 0.64, 0);
        deskGroup.add(drawerMesh);

        // MacBook
        const macGroup = new THREE.Group();
        macGroup.position.set(-0.1, 0.75, 0.05);

        // Laptop base
        const macBaseGeo = new THREE.BoxGeometry(0.30, 0.012, 0.21);
        const macBase = new THREE.Mesh(macBaseGeo, this.aluminumMat);
        macGroup.add(macBase);

        // Laptop screen lid angled back at ~115 degrees
        const lidGroup = new THREE.Group();
        lidGroup.position.set(0, 0.006, -0.105);
        lidGroup.rotation.x = -Math.PI * 0.18; // angled back

        const lidBackGeo = new THREE.BoxGeometry(0.30, 0.20, 0.008);
        const lidBack = new THREE.Mesh(lidBackGeo, this.aluminumMat);
        lidBack.position.set(0, 0.10, 0);
        lidGroup.add(lidBack);

        // Glowing Screen
        this.screenTex = this.createScreenTexture();
        const screenMat = new THREE.MeshStandardMaterial({
            map: this.screenTex,
            emissive: 0x93c5fd,
            emissiveIntensity: 0.85,
            roughness: 0.2
        });
        const screenGeo = new THREE.PlaneGeometry(0.28, 0.18);
        const screenMesh = new THREE.Mesh(screenGeo, screenMat);
        screenMesh.position.set(0, 0.10, 0.005);
        lidGroup.add(screenMesh);
        macGroup.add(lidGroup);

        // Soft screen glow on desk surface
        this.macbookGlow = new THREE.PointLight(0xa5f3fc, 0.35, 1.2);
        this.macbookGlow.position.set(0, 0.15, 0.05);
        macGroup.add(this.macbookGlow);

        deskGroup.add(macGroup);

        // Ceramic Coffee Mug
        const mugGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.09, 16);
        const mugMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.3 });
        const mug = new THREE.Mesh(mugGeo, mugMat);
        mug.position.set(0.42, 0.795, 0.15);
        deskGroup.add(mug);

        // Dark coffee surface inside mug
        const coffeeGeo = new THREE.CircleGeometry(0.037, 16);
        const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.2 });
        const coffee = new THREE.Mesh(coffeeGeo, coffeeMat);
        coffee.rotation.x = -Math.PI / 2;
        coffee.position.set(0.42, 0.835, 0.15);
        deskGroup.add(coffee);

        // Notebook & Pen
        const noteGeo = new THREE.BoxGeometry(0.18, 0.01, 0.24);
        const noteMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
        const note = new THREE.Mesh(noteGeo, noteMat);
        note.rotation.y = 0.2;
        note.position.set(-0.48, 0.755, 0.1);
        deskGroup.add(note);

        // Ergonomic desk chair facing desk
        const chairGroup = new THREE.Group();
        chairGroup.position.set(-0.1, 0, 0.55);

        const seatGeo = new THREE.BoxGeometry(0.48, 0.06, 0.46);
        const seat = new THREE.Mesh(seatGeo, this.woolMat);
        seat.position.set(0, 0.46, 0);
        chairGroup.add(seat);

        const backGeo = new THREE.BoxGeometry(0.46, 0.48, 0.05);
        const back = new THREE.Mesh(backGeo, this.woolMat);
        back.position.set(0, 0.72, 0.21);
        back.rotation.x = -0.08;
        chairGroup.add(back);

        const chairStemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.44, 8);
        const chairStem = new THREE.Mesh(chairStemGeo, this.blackMetalMat);
        chairStem.position.set(0, 0.22, 0);
        chairGroup.add(chairStem);

        const chairBaseGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.03, 5);
        const chairBase = new THREE.Mesh(chairBaseGeo, this.blackMetalMat);
        chairBase.position.set(0, 0.03, 0);
        chairGroup.add(chairBase);

        deskGroup.add(chairGroup);
        this.group.add(deskGroup);
    }

    /**
     * 2. Double Bed with Headboard, Linen, Plaid & Pillows
     */
    buildBed() {
        const bedGroup = new THREE.Group();
        bedGroup.position.set(1.6, 0, -1.45);

        // Wooden Bed frame (1.6m wide x 2.1m long x 0.32m high)
        const frameGeo = new THREE.BoxGeometry(1.6, 0.32, 2.1);
        const frameMesh = new THREE.Mesh(frameGeo, this.darkWoodMat);
        frameMesh.position.set(0, 0.16, 0);
        frameMesh.receiveShadow = true;
        bedGroup.add(frameMesh);

        // Tall wooden headboard at North end (Z = -1.05m)
        const headboardGeo = new THREE.BoxGeometry(1.68, 0.95, 0.08);
        const headboard = new THREE.Mesh(headboardGeo, this.darkWoodMat);
        headboard.position.set(0, 0.65, -1.04);
        headboard.castShadow = true;
        headboard.receiveShadow = true;
        bedGroup.add(headboard);

        // Comfortable mattress with crisp linen
        const mattressGeo = new THREE.BoxGeometry(1.5, 0.22, 1.98);
        const mattress = new THREE.Mesh(mattressGeo, this.linenMat);
        mattress.position.set(0, 0.42, 0.02);
        mattress.receiveShadow = true;
        bedGroup.add(mattress);

        // Folded grey wool plaid blanket at foot of bed
        const plaidGeo = new THREE.BoxGeometry(1.52, 0.04, 0.75);
        const plaid = new THREE.Mesh(plaidGeo, this.woolMat);
        plaid.position.set(0, 0.54, 0.62);
        bedGroup.add(plaid);

        // Two soft pillows propped up against headboard
        const pillowGeo = new THREE.BoxGeometry(0.58, 0.14, 0.38);
        const p1 = new THREE.Mesh(pillowGeo, this.linenMat);
        p1.position.set(-0.42, 0.56, -0.78);
        p1.rotation.x = 0.15;
        const p2 = new THREE.Mesh(pillowGeo, this.linenMat);
        p2.position.set(0.42, 0.56, -0.78);
        p2.rotation.x = 0.15;
        bedGroup.add(p1, p2);

        this.group.add(bedGroup);
    }

    /**
     * 3. Bedside Table with Night Lamp
     */
    buildBedsideTable() {
        const tableGroup = new THREE.Group();
        tableGroup.position.set(0.32, 0, -2.25);

        // Wooden nightstand block
        const standGeo = new THREE.BoxGeometry(0.42, 0.52, 0.42);
        const stand = new THREE.Mesh(standGeo, this.darkWoodMat);
        stand.position.set(0, 0.26, 0);
        stand.castShadow = true;
        stand.receiveShadow = true;
        tableGroup.add(stand);

        // Bedside lamp base
        const lampBaseGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.02, 16);
        const lampBase = new THREE.Mesh(lampBaseGeo, this.brassMat);
        lampBase.position.set(0, 0.53, 0);
        tableGroup.add(lampBase);

        // Lamp rod
        const rodGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.24, 8);
        const rod = new THREE.Mesh(rodGeo, this.brassMat);
        rod.position.set(0, 0.65, 0);
        tableGroup.add(rod);

        // Frosted warm shade
        const shadeGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.16, 16, 1, true);
        const shadeMat = new THREE.MeshStandardMaterial({
            color: 0xfef3c7,
            roughness: 0.6,
            side: THREE.DoubleSide
        });
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.set(0, 0.78, 0);
        tableGroup.add(shade);

        // Bedside Warm PointLight (Non-shadowing, 2700K)
        this.nightstandLight = new THREE.PointLight(0xffedd5, 0.75, 4.0);
        this.nightstandLight.position.set(0, 0.78, 0);
        tableGroup.add(this.nightstandLight);

        this.group.add(tableGroup);
    }

    /**
     * 4. Vintage Brass Floor Lamp with pleated shade
     */
    buildFloorLamp() {
        const lampGroup = new THREE.Group();
        lampGroup.position.set(-2.35, 0, 1.05);

        // Heavy brass round base
        const baseGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.03, 24);
        const base = new THREE.Mesh(baseGeo, this.brassMat);
        base.position.set(0, 0.015, 0);
        lampGroup.add(base);

        // Tall slender vertical brass stem
        const stemGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.62, 12);
        const stem = new THREE.Mesh(stemGeo, this.brassMat);
        stem.position.set(0, 0.82, 0);
        lampGroup.add(stem);

        // Pleated lampshade (warm cream)
        const shadeGeo = new THREE.CylinderGeometry(0.24, 0.36, 0.38, 24, 1, true);
        const shadeMat = new THREE.MeshStandardMaterial({
            color: 0xfffbeb,
            roughness: 0.8,
            side: THREE.DoubleSide
        });
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.set(0, 1.62, 0);
        lampGroup.add(shade);

        // Vintage floor lamp light (Cozy warmth filling the room)
        this.lampLight = new THREE.PointLight(0xffedd5, 1.15, 6.0);
        this.lampLight.position.set(0, 1.60, 0);
        lampGroup.add(this.lampLight);

        this.group.add(lampGroup);
    }

    /**
     * 5. Wardrobe Clothes Rail (OOTD: Beige coat, hoodie, yellow raincoat)
     */
    buildWardrobeRail() {
        const railGroup = new THREE.Group();
        railGroup.position.set(2.2, 0, 1.15);

        // Industrial black metal pipe frame
        const pipeMat = this.blackMetalMat;
        const width = 1.1;
        const height = 1.6;

        // Bottom feet
        const footGeo = new THREE.BoxGeometry(0.03, 0.03, 0.45);
        const fLeft = new THREE.Mesh(footGeo, pipeMat);
        fLeft.position.set(-width / 2, 0.015, 0);
        const fRight = new THREE.Mesh(footGeo, pipeMat);
        fRight.position.set(width / 2, 0.015, 0);
        railGroup.add(fLeft, fRight);

        // Vertical posts
        const postGeo = new THREE.CylinderGeometry(0.014, 0.014, height, 10);
        const pLeft = new THREE.Mesh(postGeo, pipeMat);
        pLeft.position.set(-width / 2, height / 2, 0);
        const pRight = new THREE.Mesh(postGeo, pipeMat);
        pRight.position.set(width / 2, height / 2, 0);
        railGroup.add(pLeft, pRight);

        // Top horizontal rail bar
        const topBarGeo = new THREE.CylinderGeometry(0.014, 0.014, width, 10);
        const topBar = new THREE.Mesh(topBarGeo, pipeMat);
        topBar.rotation.z = Math.PI / 2;
        topBar.position.set(0, height, 0);
        railGroup.add(topBar);

        // Bottom shoe rack shelf
        const shelfGeo = new THREE.BoxGeometry(width - 0.06, 0.02, 0.36);
        const shelf = new THREE.Mesh(shelfGeo, pipeMat);
        shelf.position.set(0, 0.12, 0);
        railGroup.add(shelf);

        // Clothes on hangers
        const clothesData = [
            { x: -0.32, color: 0xd4b896, length: 0.95, width: 0.32, name: 'beige_coat' },
            { x: -0.04, color: 0x374151, length: 0.65, width: 0.30, name: 'hoodie' },
            { x: 0.26, color: 0xeab308, length: 0.85, width: 0.32, name: 'yellow_raincoat' }
        ];

        clothesData.forEach(item => {
            const clothGeo = new THREE.BoxGeometry(item.width, item.length, 0.16);
            const clothMat = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.85 });
            const clothMesh = new THREE.Mesh(clothGeo, clothMat);
            clothMesh.position.set(item.x, height - 0.08 - item.length / 2, 0);
            railGroup.add(clothMesh);
        });

        this.group.add(railGroup);
    }

    /**
     * 6. Bookshelf with Books & Art objects
     */
    buildBookshelf() {
        const shelfGroup = new THREE.Group();
        shelfGroup.position.set(-2.75, 0, 0.0);

        // Uprights & shelves
        const unitGeo = new THREE.BoxGeometry(0.8, 1.8, 0.28);
        // We hollow out or build shelves
        const sideGeo = new THREE.BoxGeometry(0.03, 1.8, 0.28);
        const sLeft = new THREE.Mesh(sideGeo, this.woodMat);
        sLeft.position.set(-0.385, 0.9, 0);
        const sRight = new THREE.Mesh(sideGeo, this.woodMat);
        sRight.position.set(0.385, 0.9, 0);
        shelfGroup.add(sLeft, sRight);

        // 4 Shelves
        const shelfPlankGeo = new THREE.BoxGeometry(0.74, 0.025, 0.28);
        [0.08, 0.52, 0.96, 1.40, 1.78].forEach(sy => {
            const plank = new THREE.Mesh(shelfPlankGeo, this.woodMat);
            plank.position.set(0, sy, 0);
            shelfGroup.add(plank);
        });

        // Procedural book blocks on shelves
        const bookColors = [0x991b1b, 0x1e40af, 0x166534, 0x854d0e, 0x374151, 0xf1f5f9];
        // Shelf 2 books
        for (let i = 0; i < 7; i++) {
            const bh = 0.22 + (i % 3) * 0.04;
            const bGeo = new THREE.BoxGeometry(0.04, bh, 0.18);
            const bMat = new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length], roughness: 0.7 });
            const b = new THREE.Mesh(bGeo, bMat);
            b.position.set(-0.32 + i * 0.05, 0.52 + bh / 2, 0);
            shelfGroup.add(b);
        }

        // Ceramic Vase on top shelf
        const vaseGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.22, 16);
        const vaseMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3 });
        const vase = new THREE.Mesh(vaseGeo, vaseMat);
        vase.position.set(0.18, 1.40 + 0.11, 0);
        shelfGroup.add(vase);

        this.group.add(shelfGroup);
    }

    /**
     * 7. Lush Monstera Deliciosa Plant in terracotta pot on windowsill
     */
    buildMonsteraPlant() {
        const plantGroup = new THREE.Group();
        plantGroup.position.set(-0.3, 0.84, -2.35);

        // Terracotta pot
        const potGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.18, 16);
        const pot = new THREE.Mesh(potGeo, this.terracottaMat);
        pot.position.set(0, 0.09, 0);
        plantGroup.add(pot);

        // Dark soil surface
        const soilGeo = new THREE.CircleGeometry(0.115, 16);
        const soilMat = new THREE.MeshStandardMaterial({ color: 0x271c14, roughness: 0.9 });
        const soil = new THREE.Mesh(soilGeo, soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.set(0, 0.175, 0);
        plantGroup.add(soil);

        // Leaves fanning out
        const leafGeo = new THREE.SphereGeometry(0.15, 8, 8);
        leafGeo.scale(1.2, 0.1, 1.6); // flattened organic leaf

        const leafTransforms = [
            { x: -0.12, y: 0.26, z: -0.05, rx: 0.3, ry: -0.4, rz: -0.4 },
            { x: 0.14, y: 0.30, z: -0.08, rx: 0.2, ry: 0.5, rz: 0.3 },
            { x: 0.02, y: 0.38, z: 0.08, rx: -0.4, ry: 0.1, rz: 0.1 },
            { x: -0.08, y: 0.34, z: 0.10, rx: -0.3, ry: -0.6, rz: -0.2 }
        ];

        leafTransforms.forEach(t => {
            const leaf = new THREE.Mesh(leafGeo, this.leafMat);
            leaf.position.set(t.x, t.y, t.z);
            leaf.rotation.set(t.rx, t.ry, t.rz);
            plantGroup.add(leaf);
        });

        this.group.add(plantGroup);
    }

    /**
     * 8. Soft Woven Wool Rug in Center of Room
     */
    buildCarpet() {
        if (typeof document === 'undefined') {
            this.rugTex = null;
            const rugGeo = new THREE.PlaneGeometry(2.4, 1.8);
            const rugMat = new THREE.MeshStandardMaterial({
                color: 0xeae4d9,
                roughness: 0.95,
                metalness: 0.0
            });
            const rugMesh = new THREE.Mesh(rugGeo, rugMat);
            rugMesh.rotation.x = -Math.PI / 2;
            rugMesh.position.set(-0.2, 0.003, 0.2);
            rugMesh.receiveShadow = true;
            this.group.add(rugMesh);
            return;
        }
        const rugCanvas = document.createElement('canvas');
        rugCanvas.width = 256;
        rugCanvas.height = 256;
        const ctx = rugCanvas.getContext('2d');

        // Base cream tone
        ctx.fillStyle = '#eae4d9';
        ctx.fillRect(0, 0, 256, 256);

        // Subtle geometric lozenge lines
        ctx.strokeStyle = 'rgba(100, 90, 80, 0.18)';
        ctx.lineWidth = 3;
        ctx.strokeRect(20, 20, 216, 216);

        ctx.beginPath();
        ctx.moveTo(128, 20); ctx.lineTo(236, 128); ctx.lineTo(128, 236); ctx.lineTo(20, 128); ctx.closePath();
        ctx.stroke();

        this.rugTex = new THREE.CanvasTexture(rugCanvas);
        this.rugTex.colorSpace = THREE.SRGBColorSpace;

        const rugGeo = new THREE.PlaneGeometry(2.4, 1.8);
        const rugMat = new THREE.MeshStandardMaterial({
            map: this.rugTex,
            roughness: 0.95,
            metalness: 0.0
        });
        const rugMesh = new THREE.Mesh(rugGeo, rugMat);
        rugMesh.rotation.x = -Math.PI / 2;
        rugMesh.position.set(-0.2, 0.003, 0.2);
        rugMesh.receiveShadow = true;
        this.group.add(rugMesh);
    }

    dispose() {
        if (this.screenTex) this.screenTex.dispose();
        if (this.rugTex) this.rugTex.dispose();
        this.group.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        this.scene.remove(this.group);
    }
}
