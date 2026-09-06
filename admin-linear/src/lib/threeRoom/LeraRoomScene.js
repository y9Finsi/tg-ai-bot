/**
 * LeraRoomScene.js
 * 
 * Master controller and WebGL facade for Lera's 3D historic apartment.
 * Coordinates Three.js renderer, architecture, furniture, Petersburg outdoor skyline,
 * collisions, Lera 3D character avatar, camera kinematics (1st Person + The Sims),
 * jumps, point-and-click navigation, zoom, and lighting.
 */

import * as THREE from 'three';
import { CollisionSystem } from './CollisionSystem.js';
import { SkylineEnvironment } from './SkylineEnvironment.js';
import { RoomArchitectureBuilder } from './RoomArchitectureBuilder.js';
import { FurniturePropsBuilder } from './FurniturePropsBuilder.js';
import { LeraCharacter } from './LeraCharacter.js';
import { CameraController } from './CameraController.js';

export class LeraRoomScene {
    constructor(canvasContainer, options = {}) {
        this.container = canvasContainer;
        this.options = options;

        this.isRunning = false;
        this.rafId = null;

        // 1. Scene & Clock
        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        // 2. Camera: 75 deg FOV, near=0.08 (prevents wall clipping on close approach)
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.08, 50.0);
        this.camera.position.set(0, 1.62, 0.5);

        // 3. High-performance WebGL Renderer with ACES Filmic Tone Mapping
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Ensure canvas respects touch actions for smooth mobile controls
        this.renderer.domElement.style.touchAction = 'none';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        this.container.appendChild(this.renderer.domElement);

        // 4. Subsystems
        this.collision = new CollisionSystem();
        this.skyline = new SkylineEnvironment(this.scene);
        this.architecture = new RoomArchitectureBuilder(this.scene);
        this.furniture = new FurniturePropsBuilder(this.scene);
        this.character = new LeraCharacter(this.scene);

        this.cameraController = new CameraController(
            this.camera,
            this.renderer.domElement,
            this.collision,
            this.architecture,
            this.character
        );

        // Hook lock change listener if provided
        if (options.onLockChange) {
            this.cameraController.onLockChangeCallback = options.onLockChange;
        }

        // 5. Window resize listener
        this._onResize = this.onResize.bind(this);
        window.addEventListener('resize', this._onResize);

        // Start render loop
        this.start();
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.start();

        const tick = () => {
            if (!this.isRunning) return;
            this.rafId = requestAnimationFrame(tick);

            const dt = this.clock.getDelta();
            this.cameraController.update(dt);
            this.renderer.render(this.scene, this.camera);
        };

        this.rafId = requestAnimationFrame(tick);
    }

    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Switch between 'first_person' and 'sims'
     */
    setCameraMode(mode) {
        this.cameraController.setMode(mode);
    }

    getCameraMode() {
        return this.cameraController.mode;
    }

    requestPointerLock() {
        this.cameraController.requestPointerLock();
    }

    exitPointerLock() {
        this.cameraController.exitPointerLock();
    }

    /**
     * Jump Trigger
     */
    triggerJump() {
        this.cameraController.triggerJump();
    }

    /**
     * Zoom controls
     */
    zoomIn() {
        this.cameraController.zoomIn();
    }

    zoomOut() {
        this.cameraController.zoomOut();
    }

    resetZoom() {
        this.cameraController.resetZoom();
    }

    /**
     * Orbit rotation in The Sims mode
     */
    rotateOrbit(deltaRadians) {
        this.cameraController.rotateOrbit(deltaRadians);
    }

    /**
     * Toggle individual lighting sources
     */
    toggleFloorLamp(enabled) {
        if (this.furniture.lampLight) {
            this.furniture.lampLight.visible = enabled;
        }
    }

    toggleBedsideLamp(enabled) {
        if (this.furniture.nightstandLight) {
            this.furniture.nightstandLight.visible = enabled;
        }
    }

    toggleMacBookGlow(enabled) {
        if (this.furniture.macbookGlow) {
            this.furniture.macbookGlow.visible = enabled;
        }
    }

    /**
     * Update solar illumination
     */
    updateSun(sunData) {
        if (this.skyline) {
            this.skyline.updateSun(sunData);
        }
    }

    /**
     * Cleanup and free GPU memory
     */
    dispose() {
        this.stop();
        window.removeEventListener('resize', this._onResize);

        if (this.cameraController) this.cameraController.dispose();
        if (this.character) this.character.dispose();
        if (this.furniture) this.furniture.dispose();
        if (this.architecture) this.architecture.dispose();
        if (this.skyline) this.skyline.dispose();

        if (this.renderer) {
            if (this.renderer.domElement && this.renderer.domElement.parentElement) {
                this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
            }
            this.renderer.dispose();
            this.renderer.forceContextLoss();
        }
    }
}
