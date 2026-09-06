/**
 * SkylineEnvironment.js
 * 
 * Outdoor environment and dynamic St. Petersburg lighting through the window.
 * Integrates with calculateSpbSun for day/dusk/night cycle, rooftop silhouettes,
 * dormer attic lights, and directional sun/moon light with soft shadow mapping.
 */

import * as THREE from 'three';
import { calculateSpbSun } from '../solarCalculator.js';

export class SkylineEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'skyline_environment';
        this.scene.add(this.group);

        // Pre-allocated vectors for zero-GC animation updates
        this._sunTargetPos = new THREE.Vector3(0, 1.2, 0);

        this.initSkyBackdrop();
        this.initRooftopsSilhouette();
        this.initDirectionalSunLight();
        this.initAmbientLighting();

        // Initial sun calculation
        this.updateSun(calculateSpbSun(new Date()));
    }

    /**
     * Create procedural canvas texture for outside Petersburg sky
     */
    createSkyTexture(topColor, midColor, bottomColor) {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.55, midColor);
        grad.addColorStop(1, bottomColor);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 512);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }

    /**
     * Sky backdrop plane behind the window
     */
    initSkyBackdrop() {
        const skyGeo = new THREE.PlaneGeometry(14, 8);
        this.skyMat = new THREE.MeshBasicMaterial({
            side: THREE.FrontSide,
            depthWrite: false
        });
        this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
        this.skyMesh.position.set(0, 2.5, -4.5);
        this.group.add(this.skyMesh);

        // Night stars particle group
        const starCount = 60;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            starPositions[i * 3 + 0] = (Math.random() - 0.5) * 12;
            starPositions[i * 3 + 1] = 1.0 + Math.random() * 4.5;
            starPositions[i * 3 + 2] = -4.2 + (Math.random() - 0.5) * 0.2;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        this.starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.04,
            transparent: true,
            opacity: 0.0
        });
        this.starsMesh = new THREE.Points(starGeo, this.starMat);
        this.group.add(this.starsMesh);
    }

    /**
     * St. Petersburg rooftops 3D layered silhouette
     */
    initRooftopsSilhouette() {
        this.rooftopsGroup = new THREE.Group();
        this.rooftopsGroup.position.set(0, 0, -3.8);

        // Dark tin metal roof material
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x141822,
            roughness: 0.85,
            metalness: 0.2
        });

        // Layer 1: Foreground roof ridges and attics
        const roofShape = new THREE.Shape();
        roofShape.moveTo(-6, -0.5);
        roofShape.lineTo(-5, 0.4);
        roofShape.lineTo(-4, 0.1);
        roofShape.lineTo(-3, 0.7);
        roofShape.lineTo(-2.2, 0.7); // flat dormer
        roofShape.lineTo(-1.8, 0.3);
        roofShape.lineTo(-0.8, 0.8);
        roofShape.lineTo(-0.2, 0.4);
        roofShape.lineTo(0.5, 0.9);
        roofShape.lineTo(1.2, 0.45);
        roofShape.lineTo(2.0, 0.85);
        roofShape.lineTo(2.4, 0.4);
        roofShape.lineTo(3.2, 0.7);
        roofShape.lineTo(4.5, 0.2);
        roofShape.lineTo(6, 0.6);
        roofShape.lineTo(6, -1.5);
        roofShape.lineTo(-6, -1.5);
        roofShape.closePath();

        const roofExtrudeSettings = { depth: 0.15, bevelEnabled: false };
        const roofGeo = new THREE.ExtrudeGeometry(roofShape, roofExtrudeSettings);
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(0, 0.8, 0);
        this.rooftopsGroup.add(roofMesh);

        // Peter & Paul / historic spire in background
        const spireGeo = new THREE.ConeGeometry(0.12, 1.8, 6);
        const spireMat = new THREE.MeshStandardMaterial({
            color: 0x222a38,
            roughness: 0.7,
            metalness: 0.5
        });
        const spireMesh = new THREE.Mesh(spireGeo, spireMat);
        spireMesh.position.set(2.8, 2.1, -0.2);
        this.rooftopsGroup.add(spireMesh);

        // Brick chimneys
        const chimneyGeo = new THREE.BoxGeometry(0.24, 0.55, 0.24);
        const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x1f232b, roughness: 0.9 });
        const c1 = new THREE.Mesh(chimneyGeo, chimneyMat);
        c1.position.set(-2.5, 1.6, -0.05);
        const c2 = new THREE.Mesh(chimneyGeo, chimneyMat);
        c2.position.set(0.7, 1.8, -0.05);
        const c3 = new THREE.Mesh(chimneyGeo, chimneyMat);
        c3.position.set(-0.9, 1.7, -0.05);
        this.rooftopsGroup.add(c1, c2, c3);

        // Glowing warm dormer attic windows
        this.dormerLights = [];
        const dormerGeo = new THREE.PlaneGeometry(0.14, 0.18);
        const dormerMat = new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            side: THREE.FrontSide
        });
        
        const dormerPositions = [
            [-2.6, 1.25, 0.16],
            [-0.5, 1.35, 0.16],
            [1.5, 1.15, 0.16],
            [3.8, 1.10, 0.16]
        ];

        dormerPositions.forEach(([x, y, z]) => {
            const d = new THREE.Mesh(dormerGeo, dormerMat);
            d.position.set(x, y, z);
            this.dormerLights.push(d);
            this.rooftopsGroup.add(d);
        });

        this.group.add(this.rooftopsGroup);
    }

    /**
     * Directional sun/moon light entering through the window
     * Single active shadow-caster for the entire room (60-120 FPS guarantee)
     */
    initDirectionalSunLight() {
        this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.0);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 1024;
        this.sunLight.shadow.mapSize.height = 1024;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 16.0;
        this.sunLight.shadow.bias = -0.0005;

        // Shadow bounds tightly encompass the room (6x5m)
        const d = 4.0;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;

        // Default light position outside window entering at angle
        this.sunLight.position.set(1.5, 4.2, -4.5);
        this.sunLight.target.position.copy(this._sunTargetPos);

        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
    }

    /**
     * Ambient light filling the room with soft indirect bounce
     */
    initAmbientLighting() {
        this.ambientLight = new THREE.AmbientLight(0xdce7f5, 0.45);
        this.scene.add(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight(0xe8f0fe, 0x3d332a, 0.35);
        this.scene.add(this.hemiLight);
    }

    /**
     * Updates sun elevation, colors, and shadows based on time of day
     * @param {Object} sun - Result of calculateSpbSun()
     */
    updateSun(sun) {
        if (!sun) return;

        let skyTop, skyMid, skyBottom;
        let sunColor, sunIntensity;
        let ambientColor, ambientIntensity;
        let dormerOpacity = 0.0;
        let starsOpacity = 0.0;

        if (sun.isNight) {
            // SPB Northern Night (Deep navy)
            skyTop = '#050811';
            skyMid = '#0f172a';
            skyBottom = '#1e293b';
            sunColor = 0x818cf8;
            sunIntensity = 0.25;
            ambientColor = 0x1e293b;
            ambientIntensity = 0.3;
            dormerOpacity = 0.95;
            starsOpacity = 0.75;
            this.sunLight.position.set(-1.0, 3.8, -4.5);
        } else if (sun.phase === 'dawn') {
            // Petersburg Dawn (Rose, lilac, amber)
            skyTop = '#1e1b4b';
            skyMid = '#831843';
            skyBottom = '#fdba74';
            sunColor = 0xfdba74;
            sunIntensity = 1.1;
            ambientColor = 0xfce7f3;
            ambientIntensity = 0.55;
            dormerOpacity = 0.4;
            starsOpacity = 0.0;
            this.sunLight.position.set(2.5, 2.5, -4.5);
        } else if (sun.phase === 'dusk' || sun.elevation <= 12) {
            // Petrogradka Sunset (Amber, deep orange, violet)
            skyTop = '#311042';
            skyMid = '#c2410c';
            skyBottom = '#fde047';
            sunColor = 0xfb923c;
            sunIntensity = 1.25;
            ambientColor = 0xfef3c7;
            ambientIntensity = 0.6;
            dormerOpacity = 0.7;
            starsOpacity = 0.0;
            this.sunLight.position.set(-2.8, 2.2, -4.5);
        } else {
            // Overcast or crisp daytime
            skyTop = '#0284c7';
            skyMid = '#7dd3fc';
            skyBottom = '#f0f9ff';
            sunColor = 0xfffbeb;
            sunIntensity = 1.4;
            ambientColor = 0xe0f2fe;
            ambientIntensity = 0.65;
            dormerOpacity = 0.0;
            starsOpacity = 0.0;
            this.sunLight.position.set(1.2, 4.8, -4.5);
        }

        // Update sky texture
        if (this.skyMat.map) {
            this.skyMat.map.dispose();
        }
        this.skyMat.map = this.createSkyTexture(skyTop, skyMid, skyBottom);
        this.skyMat.needsUpdate = true;

        // Update lighting
        this.sunLight.color.setHex(sunColor);
        this.sunLight.intensity = sunIntensity;

        this.ambientLight.color.setHex(ambientColor);
        this.ambientLight.intensity = ambientIntensity;

        // Update dormer window glow
        this.dormerLights.forEach(d => {
            d.visible = dormerOpacity > 0.1;
        });

        // Update stars
        if (this.starMat) {
            this.starMat.opacity = starsOpacity;
        }
    }

    dispose() {
        if (this.skyMat?.map) this.skyMat.map.dispose();
        this.skyMat?.dispose();
        this.starMat?.dispose();
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
        this.scene.remove(this.sunLight);
        this.scene.remove(this.sunLight.target);
        this.scene.remove(this.ambientLight);
        this.scene.remove(this.hemiLight);
    }
}
