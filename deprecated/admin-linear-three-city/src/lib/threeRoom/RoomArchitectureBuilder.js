/**
 * RoomArchitectureBuilder.js
 * 
 * Constructs the architectural shell of Lera's historic apartment on Petrogradka:
 * - 6.0m x 5.0m x 3.6m proportions (high ceilings of pre-revolutionary St. Petersburg).
 * - Procedural herringbone oak parquet floor with PBR reflection.
 * - Warm stucco walls with high wooden plinths (0.25m) and plaster ceiling cornices.
 * - Arched Petersburg window with deep wooden sill and glass glazing.
 * - Dynamic wall cutaway support for The Sims isometric view.
 */

import * as THREE from 'three';

export class RoomArchitectureBuilder {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'room_architecture';
        this.scene.add(this.group);

        this.width = 6.0;
        this.depth = 5.0;
        this.height = 3.6;

        this.initTextures();
        this.buildFloor();
        this.buildWalls();
        this.buildArchedWindow();
        this.buildDoor();
        this.buildCornicesAndPlinths();
    }

    /**
     * Procedural canvas textures for herringbone parquet and stucco
     */
    initTextures() {
        if (typeof document === 'undefined') {
            this.parquetTexture = null;
            this.wallTexture = null;
            return;
        }
        // 1. Herringbone oak parquet texture
        const floorCanvas = document.createElement('canvas');
        floorCanvas.width = 512;
        floorCanvas.height = 512;
        const fCtx = floorCanvas.getContext('2d');

        fCtx.fillStyle = '#9b714b';
        fCtx.fillRect(0, 0, 512, 512);

        // Herringbone planks pattern
        const plankW = 64;
        const plankH = 16;
        fCtx.lineWidth = 1.2;
        fCtx.strokeStyle = 'rgba(74, 48, 28, 0.45)';

        for (let y = 0; y < 512; y += plankH) {
            for (let x = 0; x < 512; x += plankW) {
                // Subtle plank color variance
                const toneVar = ((x * 13 + y * 7) % 25) - 12;
                fCtx.fillStyle = `rgb(${155 + toneVar}, ${113 + toneVar * 0.8}, ${75 + toneVar * 0.6})`;
                fCtx.fillRect(x, y, plankW, plankH);
                fCtx.strokeRect(x, y, plankW, plankH);

                // Wood grain micro-lines
                fCtx.fillStyle = 'rgba(60, 36, 18, 0.08)';
                fCtx.fillRect(x + 4, y + 4, plankW - 8, 1.5);
                fCtx.fillRect(x + 8, y + 10, plankW - 16, 1.0);
            }
        }

        this.parquetTexture = new THREE.CanvasTexture(floorCanvas);
        this.parquetTexture.wrapS = THREE.RepeatWrapping;
        this.parquetTexture.wrapT = THREE.RepeatWrapping;
        this.parquetTexture.repeat.set(4, 3.5);
        this.parquetTexture.colorSpace = THREE.SRGBColorSpace;

        // 2. Warm Petersburg plaster wall texture
        const wallCanvas = document.createElement('canvas');
        wallCanvas.width = 256;
        wallCanvas.height = 256;
        const wCtx = wallCanvas.getContext('2d');

        wCtx.fillStyle = '#f2ece4'; // Warm linen cream
        wCtx.fillRect(0, 0, 256, 256);

        // Subtle plaster mottling
        for (let i = 0; i < 400; i++) {
            const px = Math.random() * 256;
            const py = Math.random() * 256;
            const pr = 1.5 + Math.random() * 3.5;
            wCtx.fillStyle = Math.random() > 0.5 ? 'rgba(230, 222, 212, 0.4)' : 'rgba(255, 255, 255, 0.35)';
            wCtx.beginPath();
            wCtx.arc(px, py, pr, 0, Math.PI * 2);
            wCtx.fill();
        }

        this.wallTexture = new THREE.CanvasTexture(wallCanvas);
        this.wallTexture.wrapS = THREE.RepeatWrapping;
        this.wallTexture.wrapT = THREE.RepeatWrapping;
        this.wallTexture.repeat.set(3, 2);
        this.wallTexture.colorSpace = THREE.SRGBColorSpace;
    }

    /**
     * Parquet floor
     */
    buildFloor() {
        const floorGeo = new THREE.PlaneGeometry(this.width, this.depth);
        const floorMat = new THREE.MeshStandardMaterial({
            map: this.parquetTexture,
            roughness: 0.42,
            metalness: 0.05
        });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, 0, 0);
        floorMesh.receiveShadow = true;
        this.group.add(floorMesh);
        this.floorMesh = floorMesh;

        // Ceiling
        const ceilGeo = new THREE.PlaneGeometry(this.width, this.depth);
        this.ceilMat = new THREE.MeshStandardMaterial({
            color: 0xfbf9f6,
            roughness: 0.95,
            side: THREE.DoubleSide
        });
        this.ceilingMesh = new THREE.Mesh(ceilGeo, this.ceilMat);
        this.ceilingMesh.rotation.x = Math.PI / 2;
        this.ceilingMesh.position.set(0, this.height, 0);
        this.group.add(this.ceilingMesh);
    }

    /**
     * Walls with cutout on North wall for window and cutaway support for South wall
     */
    buildWalls() {
        const wallMat = new THREE.MeshStandardMaterial({
            map: this.wallTexture,
            roughness: 0.88,
            metalness: 0.02
        });

        // West wall (X = -3.0m)
        const westGeo = new THREE.PlaneGeometry(this.depth, this.height);
        const westMesh = new THREE.Mesh(westGeo, wallMat);
        westMesh.rotation.y = Math.PI / 2;
        westMesh.position.set(-this.width / 2, this.height / 2, 0);
        westMesh.receiveShadow = true;
        this.group.add(westMesh);

        // East wall (X = +3.0m)
        const eastGeo = new THREE.PlaneGeometry(this.depth, this.height);
        const eastMesh = new THREE.Mesh(eastGeo, wallMat);
        eastMesh.rotation.y = -Math.PI / 2;
        eastMesh.position.set(this.width / 2, this.height / 2, 0);
        eastMesh.receiveShadow = true;
        this.group.add(eastMesh);

        // South wall (Z = +2.5m) - cutaway capable for The Sims view
        this.southWallGroup = new THREE.Group();
        this.southWallGroup.position.set(0, 0, this.depth / 2);

        const southGeo = new THREE.PlaneGeometry(this.width, this.height);
        this.southWallMesh = new THREE.Mesh(southGeo, wallMat.clone());
        this.southWallMesh.rotation.y = Math.PI;
        this.southWallMesh.position.set(0, this.height / 2, 0);
        this.southWallMesh.receiveShadow = true;
        this.southWallGroup.add(this.southWallMesh);
        this.group.add(this.southWallGroup);

        // North wall (Z = -2.5m) with aperture for arched window
        // Constructed from 4 panels around the window: left, right, top arch fill, bottom sill apron
        const northGroup = new THREE.Group();
        northGroup.position.set(0, 0, -this.depth / 2);

        const winWidth = 2.4;
        const winBottomY = 0.8;
        const winTopY = 3.25;

        // North-Left panel
        const leftW = (this.width - winWidth) / 2;
        const leftGeo = new THREE.PlaneGeometry(leftW, this.height);
        const leftMesh = new THREE.Mesh(leftGeo, wallMat);
        leftMesh.position.set(-this.width / 2 + leftW / 2, this.height / 2, 0);
        leftMesh.receiveShadow = true;
        northGroup.add(leftMesh);

        // North-Right panel
        const rightGeo = new THREE.PlaneGeometry(leftW, this.height);
        const rightMesh = new THREE.Mesh(rightGeo, wallMat);
        rightMesh.position.set(this.width / 2 - leftW / 2, this.height / 2, 0);
        rightMesh.receiveShadow = true;
        northGroup.add(rightMesh);

        // North-Bottom panel under window sill
        const bottomGeo = new THREE.PlaneGeometry(winWidth, winBottomY);
        const bottomMesh = new THREE.Mesh(bottomGeo, wallMat);
        bottomMesh.position.set(0, winBottomY / 2, 0);
        bottomMesh.receiveShadow = true;
        northGroup.add(bottomMesh);

        // North-Top panel above arch
        const topH = this.height - winTopY;
        const topGeo = new THREE.PlaneGeometry(winWidth, topH);
        const topMesh = new THREE.Mesh(topGeo, wallMat);
        topMesh.position.set(0, this.height - topH / 2, 0);
        topMesh.receiveShadow = true;
        northGroup.add(topMesh);

        this.group.add(northGroup);
    }

    /**
     * Arched St. Petersburg window frame, deep sill, and glass panes
     */
    buildArchedWindow() {
        const winGroup = new THREE.Group();
        winGroup.position.set(0, 0, -this.depth / 2);

        // Deep wooden window sill (oak)
        const sillGeo = new THREE.BoxGeometry(2.6, 0.08, 0.48);
        const sillMat = new THREE.MeshStandardMaterial({
            color: 0x543a29,
            roughness: 0.5,
            metalness: 0.05
        });
        const sillMesh = new THREE.Mesh(sillGeo, sillMat);
        sillMesh.position.set(0, 0.8, 0.22);
        sillMesh.receiveShadow = true;
        sillMesh.castShadow = true;
        winGroup.add(sillMesh);

        // Window frame perimeter (white painted wood of historic Petrograd flats)
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0xe8e4de,
            roughness: 0.65,
            metalness: 0.05
        });

        // Left jamb
        const jambGeo = new THREE.BoxGeometry(0.1, 2.45, 0.22);
        const leftJamb = new THREE.Mesh(jambGeo, frameMat);
        leftJamb.position.set(-1.18, 2.02, 0.1);
        winGroup.add(leftJamb);

        // Right jamb
        const rightJamb = new THREE.Mesh(jambGeo, frameMat);
        rightJamb.position.set(1.18, 2.02, 0.1);
        winGroup.add(rightJamb);

        // Center vertical mullion
        const mullionGeo = new THREE.BoxGeometry(0.06, 2.45, 0.18);
        const centerMullion = new THREE.Mesh(mullionGeo, frameMat);
        centerMullion.position.set(0, 2.02, 0.1);
        winGroup.add(centerMullion);

        // Horizontal transom bar
        const transomGeo = new THREE.BoxGeometry(2.36, 0.06, 0.18);
        const transom = new THREE.Mesh(transomGeo, frameMat);
        transom.position.set(0, 2.35, 0.1);
        winGroup.add(transom);

        // Semi-circular arch top moulding
        const archCurve = new THREE.EllipseCurve(0, 2.35, 1.18, 0.9, 0, Math.PI, false, 0);
        const archPoints = archCurve.getPoints(24);
        const archShape = new THREE.Shape(archPoints);
        const archFrameGeo = new THREE.RingGeometry(1.14, 1.22, 24, 1, 0, Math.PI);
        const archMesh = new THREE.Mesh(archFrameGeo, frameMat);
        archMesh.position.set(0, 2.35, 0.08);
        winGroup.add(archMesh);

        // Double glazing glass (subtle reflection, transparent)
        const glassGeo = new THREE.PlaneGeometry(2.36, 2.45);
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.18,
            roughness: 0.05,
            metalness: 0.1,
            transmission: 0.9,
            ior: 1.5
        });
        const glassMesh = new THREE.Mesh(glassGeo, glassMat);
        glassMesh.position.set(0, 2.02, 0.05);
        winGroup.add(glassMesh);

        this.group.add(winGroup);
    }

    /**
     * Interior door on East wall
     */
    buildDoor() {
        const doorGroup = new THREE.Group();
        doorGroup.position.set(this.width / 2 - 0.02, 0, 1.4);
        doorGroup.rotation.y = -Math.PI / 2;

        // Tall classic Petersburg door frame
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0xf5f3ed,
            roughness: 0.75
        });

        // Door leaf
        const leafGeo = new THREE.BoxGeometry(0.95, 2.4, 0.05);
        const leafMesh = new THREE.Mesh(leafGeo, doorMat);
        leafMesh.position.set(0, 1.2, 0);
        leafMesh.receiveShadow = true;
        doorGroup.add(leafMesh);

        // Molded panels
        const panelGeo = new THREE.BoxGeometry(0.72, 0.88, 0.02);
        const panelMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.8 });
        const pTop = new THREE.Mesh(panelGeo, panelMat);
        pTop.position.set(0, 1.62, 0.025);
        const pBottom = new THREE.Mesh(panelGeo, panelMat);
        pBottom.position.set(0, 0.68, 0.025);
        doorGroup.add(pTop, pBottom);

        // Brass handle
        const handleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0xc8a452,
            metalness: 0.85,
            roughness: 0.3
        });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.35, 1.05, 0.05);
        doorGroup.add(handle);

        this.group.add(doorGroup);
    }

    /**
     * High wooden plinth (baseboards) and ceiling plaster cornices
     */
    buildCornicesAndPlinths() {
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xf8f6f2,
            roughness: 0.6
        });

        const plinthH = 0.22;
        const plinthD = 0.025;

        // West plinth
        const westPlinthGeo = new THREE.BoxGeometry(plinthD, plinthH, this.depth);
        const westPlinth = new THREE.Mesh(westPlinthGeo, trimMat);
        westPlinth.position.set(-this.width / 2 + plinthD / 2, plinthH / 2, 0);
        this.group.add(westPlinth);

        // East plinth
        const eastPlinthGeo = new THREE.BoxGeometry(plinthD, plinthH, this.depth);
        const eastPlinth = new THREE.Mesh(eastPlinthGeo, trimMat);
        eastPlinth.position.set(this.width / 2 - plinthD / 2, plinthH / 2, 0);
        this.group.add(eastPlinth);

        // North plinths (left and right of window sill)
        const winW = 2.4;
        const nSideW = (this.width - winW) / 2;
        const nLeftGeo = new THREE.BoxGeometry(nSideW, plinthH, plinthD);
        const nLeftPlinth = new THREE.Mesh(nLeftGeo, trimMat);
        nLeftPlinth.position.set(-this.width / 2 + nSideW / 2, plinthH / 2, -this.depth / 2 + plinthD / 2);
        const nRightPlinth = new THREE.Mesh(nLeftGeo, trimMat);
        nRightPlinth.position.set(this.width / 2 - nSideW / 2, plinthH / 2, -this.depth / 2 + plinthD / 2);
        this.group.add(nLeftPlinth, nRightPlinth);

        // Plaster ceiling cornices around perimeter
        const corniceH = 0.15;
        const corniceD = 0.12;
        const cGeoX = new THREE.BoxGeometry(this.width, corniceH, corniceD);
        const cGeoZ = new THREE.BoxGeometry(corniceD, corniceH, this.depth);

        const cNorth = new THREE.Mesh(cGeoX, trimMat);
        cNorth.position.set(0, this.height - corniceH / 2, -this.depth / 2 + corniceD / 2);

        const cWest = new THREE.Mesh(cGeoZ, trimMat);
        cWest.position.set(-this.width / 2 + corniceD / 2, this.height - corniceH / 2, 0);

        const cEast = new THREE.Mesh(cGeoZ, trimMat);
        cEast.position.set(this.width / 2 - corniceD / 2, this.height - corniceH / 2, 0);

        this.group.add(cNorth, cWest, cEast);
    }

    /**
     * Controls wall visibility/cutaway for The Sims isometric mode
     * @param {boolean} isCutaway - When true, lowers/hides south wall and ceiling
     */
    setWallCutaway(isCutaway) {
        if (this.southWallGroup) {
            this.southWallGroup.visible = !isCutaway;
        }
        if (this.ceilingMesh) {
            this.ceilingMesh.visible = !isCutaway;
        }
    }

    dispose() {
        if (this.parquetTexture) this.parquetTexture.dispose();
        if (this.wallTexture) this.wallTexture.dispose();
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
