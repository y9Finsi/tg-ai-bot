/**
 * LeraCharacter.js
 * 
 * 3D Avatar of Lera for the historic Petrogradka apartment.
 * Proportions: 1.71m tall, 19 years old, СПбГИК student.
 * Features:
 * - Expressive articulated biped hierarchy (pelvis, torso, head, hair, limbs).
 * - Procedural normcore outfit: graphite hoodie, high-waist blue denim, white retro sneakers.
 * - Smooth kinematic animation: walk cycle, idle breathing, and jump poses.
 * - Sims Plumbob emerald crystal rotating above head.
 * - Sims click destination indicator (pulse ring on floor).
 * - Support for loading /models/lera.glb via GLTFLoader with procedural fallback.
 */

import * as THREE from 'three';

export class LeraCharacter {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'lera_character';
        this.scene.add(this.group);

        // State
        this.position = new THREE.Vector3(0, 0, 0.5);
        this.targetAngle = 0;
        this.currentAngle = 0;
        this.walkPhase = 0;
        this.idlePhase = 0;

        // Visual click-to-move marker
        this.initClickMarker();

        // 3D Model
        this.initMaterials();
        this.initProceduralBody();
        this.initPlumbob();

        // Try async GLTF load if in browser
        this.tryLoadGltf();
    }

    initMaterials() {
        this.skinMat = new THREE.MeshStandardMaterial({
            color: 0xf5d0b5,
            roughness: 0.65,
            metalness: 0.05
        });

        this.hairMat = new THREE.MeshStandardMaterial({
            color: 0x271911, // Dark chestnut
            roughness: 0.85,
            metalness: 0.02
        });

        this.hoodieMat = new THREE.MeshStandardMaterial({
            color: 0x374151, // Graphite hoodie
            roughness: 0.9,
            metalness: 0.0
        });

        this.pantsMat = new THREE.MeshStandardMaterial({
            color: 0x2563eb, // Classic blue denim
            roughness: 0.75,
            metalness: 0.0
        });

        this.shoesMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc, // White sneakers
            roughness: 0.4,
            metalness: 0.1
        });
    }

    initProceduralBody() {
        this.bodyRoot = new THREE.Group();
        this.bodyRoot.name = 'lera_body_root';
        this.group.add(this.bodyRoot);

        // 1. Soft contact shadow beneath feet
        const shadowGeo = new THREE.CircleGeometry(0.32, 18);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x0a0c10,
            transparent: true,
            opacity: 0.38,
            depthWrite: false
        });
        this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadowMesh.rotation.x = -Math.PI / 2;
        this.shadowMesh.position.y = 0.005;
        this.group.add(this.shadowMesh);

        // 2. Pelvis (Base height ~0.84m)
        this.pelvis = new THREE.Group();
        this.pelvis.position.y = 0.84;
        this.bodyRoot.add(this.pelvis);

        // 3. Torso & Hoodie
        this.torso = new THREE.Group();
        this.torso.position.y = 0.08;
        this.pelvis.add(this.torso);

        const torsoGeo = new THREE.BoxGeometry(0.30, 0.42, 0.19);
        const torsoMesh = new THREE.Mesh(torsoGeo, this.hoodieMat);
        torsoMesh.position.y = 0.21;
        torsoMesh.castShadow = true;
        torsoMesh.receiveShadow = true;
        this.torso.add(torsoMesh);

        // Hoodie collar / hood at back
        const hoodGeo = new THREE.BoxGeometry(0.24, 0.12, 0.12);
        const hoodMesh = new THREE.Mesh(hoodGeo, this.hoodieMat);
        hoodMesh.position.set(0, 0.38, -0.09);
        this.torso.add(hoodMesh);

        // 4. Head, Hair & Face
        this.headGroup = new THREE.Group();
        this.headGroup.position.set(0, 0.42, 0);
        this.torso.add(this.headGroup);

        // Neck
        const neckGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10);
        const neckMesh = new THREE.Mesh(neckGeo, this.skinMat);
        neckMesh.position.y = 0.04;
        this.headGroup.add(neckMesh);

        // Head
        const headGeo = new THREE.BoxGeometry(0.18, 0.20, 0.18);
        const headMesh = new THREE.Mesh(headGeo, this.skinMat);
        headMesh.position.y = 0.18;
        this.headGroup.add(headMesh);

        // Hair (bangs + shoulder length bob)
        const hairTopGeo = new THREE.BoxGeometry(0.20, 0.10, 0.21);
        const hairTop = new THREE.Mesh(hairTopGeo, this.hairMat);
        hairTop.position.set(0, 0.25, -0.01);
        this.headGroup.add(hairTop);

        const hairBackGeo = new THREE.BoxGeometry(0.20, 0.22, 0.08);
        const hairBack = new THREE.Mesh(hairBackGeo, this.hairMat);
        hairBack.position.set(0, 0.14, -0.08);
        this.headGroup.add(hairBack);

        // 5. Arms (Shoulders + Forearms)
        // Left Arm
        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.18, 0.38, 0);
        const armGeo = new THREE.BoxGeometry(0.08, 0.38, 0.09);
        const lArmMesh = new THREE.Mesh(armGeo, this.hoodieMat);
        lArmMesh.position.y = -0.16;
        this.leftArm.add(lArmMesh);
        // Hand
        const handGeo = new THREE.BoxGeometry(0.06, 0.08, 0.06);
        const lHandMesh = new THREE.Mesh(handGeo, this.skinMat);
        lHandMesh.position.y = -0.38;
        this.leftArm.add(lHandMesh);
        this.torso.add(this.leftArm);

        // Right Arm
        this.rightArm = new THREE.Group();
        this.rightArm.position.set(0.18, 0.38, 0);
        const rArmMesh = new THREE.Mesh(armGeo, this.hoodieMat);
        rArmMesh.position.y = -0.16;
        this.rightArm.add(rArmMesh);
        const rHandMesh = new THREE.Mesh(handGeo, this.skinMat);
        rHandMesh.position.y = -0.38;
        this.rightArm.add(rHandMesh);
        this.torso.add(this.rightArm);

        // 6. Legs & Feet
        const legGeo = new THREE.BoxGeometry(0.11, 0.44, 0.12);
        const shoeGeo = new THREE.BoxGeometry(0.11, 0.08, 0.20);

        // Left Leg
        this.leftLeg = new THREE.Group();
        this.leftLeg.position.set(-0.09, 0, 0);
        const lLegMesh = new THREE.Mesh(legGeo, this.pantsMat);
        lLegMesh.position.y = -0.22;
        lLegMesh.castShadow = true;
        this.leftLeg.add(lLegMesh);
        // Left Shoe
        const lShoeMesh = new THREE.Mesh(shoeGeo, this.shoesMat);
        lShoeMesh.position.set(0, -0.44, 0.03);
        this.leftLeg.add(lShoeMesh);
        this.pelvis.add(this.leftLeg);

        // Right Leg
        this.rightLeg = new THREE.Group();
        this.rightLeg.position.set(0.09, 0, 0);
        const rLegMesh = new THREE.Mesh(legGeo, this.pantsMat);
        rLegMesh.position.y = -0.22;
        rLegMesh.castShadow = true;
        this.rightLeg.add(rLegMesh);
        // Right Shoe
        const rShoeMesh = new THREE.Mesh(shoeGeo, this.shoesMat);
        rShoeMesh.position.set(0, -0.44, 0.03);
        this.rightLeg.add(rShoeMesh);
        this.pelvis.add(this.rightLeg);
    }

    /**
     * Iconic green Sims Plumbob hovering directly above Lera's head
     */
    initPlumbob() {
        this.plumbobGroup = new THREE.Group();
        this.plumbobGroup.name = 'sims_plumbob_lera';

        const geo = new THREE.OctahedronGeometry(0.13, 0);
        geo.scale(0.8, 1.8, 0.8);

        const mat = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            emissive: 0x15803d,
            emissiveIntensity: 0.75,
            roughness: 0.15,
            metalness: 0.2
        });

        this.plumbobMesh = new THREE.Mesh(geo, mat);
        this.plumbobMesh.position.y = 1.98;
        this.plumbobGroup.add(this.plumbobMesh);

        // Soft emerald glow around the diamond
        this.plumbobLight = new THREE.PointLight(0x22c55e, 0.65, 2.2);
        this.plumbobLight.position.y = 1.98;
        this.plumbobGroup.add(this.plumbobLight);

        this.group.add(this.plumbobGroup);
    }

    /**
     * Visual Sims destination click-marker (pulsing green circle on floor)
     */
    initClickMarker() {
        const ringGeo = new THREE.RingGeometry(0.18, 0.24, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.clickMarker = new THREE.Mesh(ringGeo, ringMat);
        this.clickMarker.rotation.x = -Math.PI / 2;
        this.clickMarker.position.set(0, 0.006, 0);
        this.clickMarkerTime = 0;
        this.scene.add(this.clickMarker);
    }

    triggerClickMarker(x, z) {
        this.clickMarker.position.set(x, 0.006, z);
        this.clickMarkerTime = 1.0; // 1 second pulse
    }

    /**
     * Attempts loading lera.glb with graceful fallback
     */
    tryLoadGltf() {
        if (typeof window === 'undefined') return;
        // Check if GLTFLoader is available dynamically
        import('three/examples/jsm/loaders/GLTFLoader.js')
            .then(({ GLTFLoader }) => {
                const loader = new GLTFLoader();
                loader.load(
                    '/models/lera.glb',
                    (gltf) => {
                        if (!gltf || !gltf.scene) return;
                        const model = gltf.scene;
                        model.scale.set(1.0, 1.0, 1.0);
                        model.position.set(0, 0, 0);
                        model.traverse((node) => {
                            if (node.isMesh) {
                                node.castShadow = true;
                                node.receiveShadow = true;
                            }
                        });

                        // Swap procedural mesh for loaded GLTF if valid
                        this.gltfModel = model;
                        this.bodyRoot.visible = false;
                        this.group.add(model);
                    },
                    undefined,
                    () => {
                        // Silent fallback to procedural body
                    }
                );
            })
            .catch(() => {
                // Procedural body is active
            });
    }

    /**
     * Set visibility based on camera mode (visible in Sims, hidden in 1st person)
     */
    setVisibility(visible) {
        this.group.visible = visible;
        if (this.clickMarker) {
            this.clickMarker.visible = visible;
        }
    }

    /**
     * Update animations (walk cycle, idle breathing, jump posing, plumbob rotation)
     * 
     * @param {number} dt Delta time in seconds
     * @param {THREE.Vector3} worldPos Current position of character root
     * @param {boolean} isMoving Is walking/running
     * @param {number} speed Movement speed
     * @param {number} moveAngle Heading angle in radians
     * @param {boolean} isJumping Whether in mid-air jump
     * @param {number} jumpHeight Height above floor
     */
    update(dt, worldPos, isMoving, speed, moveAngle, isJumping = false, jumpHeight = 0) {
        // Position root
        this.position.copy(worldPos);
        this.group.position.set(worldPos.x, worldPos.y, worldPos.z);

        // Shadow follows on the floor plane
        if (this.shadowMesh) {
            this.shadowMesh.position.y = -worldPos.y + 0.005;
            // Shadow shrinks slightly as player jumps higher
            const sScale = Math.max(0.4, 1.0 - jumpHeight * 0.4);
            this.shadowMesh.scale.set(sScale, sScale, sScale);
        }

        // Rotate smoothly towards movement direction
        if (isMoving) {
            this.targetAngle = moveAngle;
        }
        // Shortest angular lerp
        let diff = this.targetAngle - this.currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.currentAngle += diff * Math.min(1.0, dt * 14.0);
        this.group.rotation.y = this.currentAngle;

        // Animate Plumbob
        if (this.plumbobMesh) {
            this.plumbobMesh.rotation.y += dt * 2.4;
            this.plumbobMesh.position.y = 1.98 + Math.sin(Date.now() * 0.004) * 0.04;
        }

        // Click marker pulse animation
        if (this.clickMarkerTime > 0) {
            this.clickMarkerTime -= dt * 1.5;
            const t = Math.max(0, this.clickMarkerTime);
            this.clickMarker.material.opacity = t * 0.7;
            const rScale = 1.0 + (1.0 - t) * 0.6;
            this.clickMarker.scale.set(rScale, rScale, 1.0);
        } else {
            this.clickMarker.material.opacity = 0;
        }

        // Limb Kinematics
        if (isJumping) {
            // Jump pose: legs bend up slightly, arms raise outward
            this.leftLeg.rotation.x = -0.45;
            this.rightLeg.rotation.x = -0.35;
            this.leftArm.rotation.x = 0.5;
            this.leftArm.rotation.z = -0.4;
            this.rightArm.rotation.x = 0.5;
            this.rightArm.rotation.z = 0.4;
            this.torso.rotation.x = 0.12;
        } else if (isMoving) {
            // Walking / Running Cycle
            const freq = speed * 3.8;
            this.walkPhase += dt * freq;

            const swingLeg = Math.sin(this.walkPhase) * 0.65;
            const swingArm = Math.sin(this.walkPhase) * 0.55;

            this.leftLeg.rotation.x = swingLeg;
            this.rightLeg.rotation.x = -swingLeg;
            this.leftArm.rotation.x = -swingArm;
            this.leftArm.rotation.z = -0.05;
            this.rightArm.rotation.x = swingArm;
            this.rightArm.rotation.z = 0.05;

            // Pelvis subtle bounce
            this.pelvis.position.y = 0.84 + Math.abs(Math.cos(this.walkPhase)) * 0.035;
            this.torso.rotation.y = Math.sin(this.walkPhase) * 0.08;
            this.torso.rotation.x = 0.06; // slight lean forward
        } else {
            // Idle Breathing
            this.idlePhase += dt * 2.2;
            const breath = Math.sin(this.idlePhase) * 0.015;

            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
            this.leftArm.rotation.x = 0;
            this.leftArm.rotation.z = -0.08;
            this.rightArm.rotation.x = 0;
            this.rightArm.rotation.z = 0.08;

            this.pelvis.position.y = 0.84 + breath;
            this.torso.rotation.y = 0;
            this.torso.rotation.x = 0;
            this.headGroup.rotation.y = Math.sin(this.idlePhase * 0.5) * 0.05;
        }
    }

    dispose() {
        if (this.clickMarker) {
            this.clickMarker.geometry.dispose();
            this.clickMarker.material.dispose();
            this.scene.remove(this.clickMarker);
        }
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
