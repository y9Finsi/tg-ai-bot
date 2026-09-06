/**
 * CameraController.js
 * 
 * Advanced Hybrid Kinematic & Camera Controller:
 * 1. First-Person Mode:
 *    - Increased movement speed: 3.2 m/s walk, 5.8 m/s sprint
 *    - Jump physics on Space key (vy = 5.2 m/s, gravity = 18 m/s^2)
 *    - Vertical elevation detection (jumping onto bed / desk / armchair)
 *    - PointerLock mouse look with zero roll and damped rotation (lambda=28)
 *    - Dynamic air control and smooth landing damping
 * 2. The Sims Mode:
 *    - Articulated Lera 3D character with animated walk, idle & jump
 *    - Point-and-Click navigation: click anywhere on the floor to send Lera there
 *    - Pulsing destination marker on floor
 *    - WASD movement continues working seamlessly
 *    - Zoom In / Zoom Out (mouse wheel, pinch gestures, HUD buttons)
 *    - Orbit camera rotation around room center (right-click drag / HUD buttons)
 *    - Rotating green Sims Plumbob above Lera
 */

import * as THREE from 'three';

export class CameraController {
    constructor(camera, domElement, collisionSystem, architectureBuilder, leraCharacter = null) {
        this.camera = camera;
        this.domElement = domElement;
        this.collision = collisionSystem;
        this.architecture = architectureBuilder;
        this.character = leraCharacter;

        // Mode: 'first_person' | 'sims'
        this.mode = 'first_person';

        // Kinematic Player Position (X, Y, Z)
        this.playerPos = new THREE.Vector3(0, 1.62, 0.5);
        this.targetPlayerPos = new THREE.Vector3(0, 1.62, 0.5);

        // Vertical Jump & Gravity state
        this.feetY = 0.0;
        this.verticalVelocity = 0.0;
        this.gravity = 18.0;
        this.jumpForce = 5.2;
        this.isGrounded = true;
        this.isJumping = false;

        // Speeds (Fast, responsive gameplay)
        this.walkSpeed = 3.2;   // increased from 1.8
        this.runSpeed = 5.8;    // increased from 3.2

        // First Person Rotation angles
        this.yaw = 0;          // radians around Y
        this.pitch = 0;        // radians around X
        this.targetYaw = 0;
        this.targetPitch = 0;
        this.fpFov = 75;

        // Head bobbing state
        this.bobPhase = 0;
        this.bobIntensity = 0;

        // The Sims Camera & Orbit parameters
        this.simsZoom = 1.0;            // 0.5 (close) to 1.9 (far)
        this.simsOrbitAngle = Math.PI * 0.25; // default 45 deg angle
        this.simsCamPos = new THREE.Vector3(2.8, 3.8, 3.8);
        this.simsLookAt = new THREE.Vector3(0, 0.9, 0);

        // Point-and-Click Destination
        this.targetNavPos = null;

        // Movement keys
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            run: false,
            jump: false
        };

        // Mobile touch input state
        this.touchMove = { x: 0, z: 0 };
        this.touchLook = { x: 0, y: 0 };
        this.activeTouchMoveId = null;
        this.activeTouchLookId = null;
        this.lastTouchLookPos = { x: 0, y: 0 };
        this.touchPinchDist = null;

        // Right-click drag state for orbit
        this.isOrbitDragging = false;
        this.lastOrbitMouseX = 0;

        // Mode transition state
        this.transitionProgress = 0; // 0 = 1st person, 1 = Sims
        this.targetTransition = 0;

        // Raycasting for point-and-click
        this.raycaster = new THREE.Raycaster();
        this.mouseVec = new THREE.Vector2();

        // Pre-allocated scratch vectors for zero-GC in animation loop
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._moveDelta = new THREE.Vector3();
        this._desiredCamPos = new THREE.Vector3();
        this._lookTarget = new THREE.Vector3();
        this._charWorldPos = new THREE.Vector3();

        // Plumbob fallback if character not present
        this.initPlumbobFallback();

        // Bind events
        this.bindEvents();

        // Sync initial mode
        this.updateSimsCameraPosition();
        if (this.character) {
            this.character.setVisibility(this.mode === 'sims');
        }
    }

    /**
     * Initializes Plumbob fallback mesh
     */
    initPlumbobFallback() {
        if (this.character) return;
        this.plumbobGroup = new THREE.Group();
        this.plumbobGroup.name = 'sims_plumbob';

        const geo = new THREE.OctahedronGeometry(0.16, 0);
        geo.scale(0.8, 1.7, 0.8);

        const mat = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            emissive: 0x16a34a,
            emissiveIntensity: 0.65,
            roughness: 0.2,
            metalness: 0.1
        });

        this.plumbobMesh = new THREE.Mesh(geo, mat);
        this.plumbobMesh.position.y = 1.95;
        this.plumbobGroup.add(this.plumbobMesh);

        const pLight = new THREE.PointLight(0x22c55e, 0.5, 2.5);
        pLight.position.y = 1.95;
        this.plumbobGroup.add(pLight);

        this.plumbobGroup.visible = false;
        if (this.architecture?.scene) {
            this.architecture.scene.add(this.plumbobGroup);
        }
    }

    bindEvents() {
        this._onKeyDown = this.onKeyDown.bind(this);
        this._onKeyUp = this.onKeyUp.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseDown = this.onMouseDown.bind(this);
        this._onMouseUp = this.onMouseUp.bind(this);
        this._onPointerLockChange = this.onPointerLockChange.bind(this);
        this._onWheel = this.onWheel.bind(this);
        this._onClick = this.onClick.bind(this);
        this._onContextMenu = (e) => e.preventDefault();

        this._onTouchStart = this.onTouchStart.bind(this);
        this._onTouchMove = this.onTouchMove.bind(this);
        this._onTouchEnd = this.onTouchEnd.bind(this);

        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);
            window.addEventListener('mouseup', this._onMouseUp);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('pointerlockchange', this._onPointerLockChange);
        }

        if (this.domElement && typeof this.domElement.addEventListener === 'function') {
            this.domElement.addEventListener('mousedown', this._onMouseDown);
            this.domElement.addEventListener('click', this._onClick);
            this.domElement.addEventListener('wheel', this._onWheel, { passive: false });
            this.domElement.addEventListener('contextmenu', this._onContextMenu);

            this.domElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
            this.domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
            this.domElement.addEventListener('touchend', this._onTouchEnd, { passive: false });
            this.domElement.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
        }
    }

    onKeyDown(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = true;
                this.targetNavPos = null; // Keyboard cancels click navigation
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = true;
                this.targetNavPos = null;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = true;
                this.targetNavPos = null;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                this.targetNavPos = null;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.run = true;
                break;
            case 'Space':
                e.preventDefault();
                this.triggerJump();
                break;
            case 'KeyV':
                this.setMode(this.mode === 'first_person' ? 'sims' : 'first_person');
                break;
        }
    }

    onKeyUp(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.run = false;
                break;
        }
    }

    triggerJump() {
        if (this.isGrounded) {
            this.verticalVelocity = this.jumpForce;
            this.isGrounded = false;
            this.isJumping = true;
        }
    }

    onMouseDown(e) {
        if (e.button === 2) {
            // Right click: start orbit dragging in Sims mode
            this.isOrbitDragging = true;
            this.lastOrbitMouseX = e.clientX;
        }
    }

    onMouseUp(e) {
        if (e.button === 2) {
            this.isOrbitDragging = false;
        }
    }

    onMouseMove(e) {
        if (document.pointerLockElement === this.domElement) {
            // 1st Person look
            const sens = 0.0019;
            this.targetYaw -= e.movementX * sens;
            this.targetPitch -= e.movementY * sens;
            const maxPitch = Math.PI * 0.46;
            this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
        } else if (this.isOrbitDragging && this.mode === 'sims') {
            // Orbit drag in Sims mode
            const dx = e.clientX - this.lastOrbitMouseX;
            this.lastOrbitMouseX = e.clientX;
            this.simsOrbitAngle += dx * 0.007;
            this.updateSimsCameraPosition();
        }
    }

    /**
     * Zoom handler (Mouse Wheel)
     */
    onWheel(e) {
        e.preventDefault();
        if (this.mode === 'sims') {
            const zoomDelta = e.deltaY * 0.0015;
            this.simsZoom = THREE.MathUtils.clamp(this.simsZoom + zoomDelta, 0.5, 1.9);
            this.updateSimsCameraPosition();
        } else {
            // 1st Person FOV zoom
            const fovDelta = e.deltaY * 0.03;
            this.fpFov = THREE.MathUtils.clamp(this.fpFov + fovDelta, 60, 88);
            this.camera.fov = this.fpFov;
            this.camera.updateProjectionMatrix();
        }
    }

    /**
     * Point-and-Click navigation in The Sims mode
     */
    onClick(e) {
        if (this.mode !== 'sims') return;
        if (!this.domElement) return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouseVec, this.camera);

        // Raycast against floor plane and obstacles
        const targetObjects = [];
        if (this.architecture?.floorMesh) targetObjects.push(this.architecture.floorMesh);
        if (this.architecture?.group) targetObjects.push(this.architecture.group);

        const hits = this.raycaster.intersectObjects(targetObjects, true);
        if (hits.length > 0) {
            const hitPoint = hits[0].point;
            // Check within room boundaries
            const targetX = THREE.MathUtils.clamp(hitPoint.x, -2.6, 2.6);
            const targetZ = THREE.MathUtils.clamp(hitPoint.z, -2.1, 2.1);

            this.targetNavPos = new THREE.Vector3(targetX, 0, targetZ);

            if (this.character) {
                this.character.triggerClickMarker(targetX, targetZ);
            }
        }
    }

    onPointerLockChange() {
        this.isPointerLocked = document.pointerLockElement === this.domElement;
        if (this.onLockChangeCallback) {
            this.onLockChangeCallback(this.isPointerLocked);
        }
    }

    requestPointerLock() {
        if (typeof document === 'undefined') return;
        if (this.domElement && document.pointerLockElement !== this.domElement) {
            try {
                this.domElement.requestPointerLock();
            } catch (err) {}
        }
    }

    exitPointerLock() {
        if (typeof document === 'undefined') return;
        if (document.pointerLockElement === this.domElement) {
            document.exitPointerLock();
        }
    }

    onTouchStart(e) {
        const rect = this.domElement.getBoundingClientRect();
        const halfWidth = rect.width / 2;

        if (e.touches.length === 2 && this.mode === 'sims') {
            // Pinch to zoom in Sims mode
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this.touchPinchDist = Math.sqrt(dx * dx + dy * dy);
            return;
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const localX = touch.clientX - rect.left;

            if (localX < halfWidth && this.activeTouchMoveId === null) {
                this.activeTouchMoveId = touch.identifier;
                this.touchMoveOrigin = { x: touch.clientX, y: touch.clientY };
                this.targetNavPos = null;
            } else if (localX >= halfWidth && this.activeTouchLookId === null) {
                this.activeTouchLookId = touch.identifier;
                this.lastTouchLookPos = { x: touch.clientX, y: touch.clientY };
            }
        }
    }

    onTouchMove(e) {
        e.preventDefault();

        // 2-finger pinch zoom
        if (e.touches.length === 2 && this.touchPinchDist !== null && this.mode === 'sims') {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const factor = (this.touchPinchDist - dist) * 0.005;
            this.simsZoom = THREE.MathUtils.clamp(this.simsZoom + factor, 0.5, 1.9);
            this.touchPinchDist = dist;
            this.updateSimsCameraPosition();
            return;
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];

            if (touch.identifier === this.activeTouchMoveId && this.touchMoveOrigin) {
                const dx = touch.clientX - this.touchMoveOrigin.x;
                const dy = touch.clientY - this.touchMoveOrigin.y;
                const maxRadius = 45;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const clamped = Math.min(dist, maxRadius);
                const angle = Math.atan2(dy, dx);

                this.touchMove.x = (Math.cos(angle) * clamped) / maxRadius;
                this.touchMove.z = (Math.sin(angle) * clamped) / maxRadius;
            } else if (touch.identifier === this.activeTouchLookId) {
                const dx = touch.clientX - this.lastTouchLookPos.x;
                const dy = touch.clientY - this.lastTouchLookPos.y;
                this.lastTouchLookPos = { x: touch.clientX, y: touch.clientY };

                if (this.mode === 'sims') {
                    // Touch drag in Sims rotates orbit
                    this.simsOrbitAngle += dx * 0.008;
                    this.updateSimsCameraPosition();
                } else {
                    const touchSens = 0.0035;
                    this.targetYaw -= dx * touchSens;
                    this.targetPitch -= dy * touchSens;
                    const maxPitch = Math.PI * 0.46;
                    this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
                }
            }
        }
    }

    onTouchEnd(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.activeTouchMoveId) {
                this.activeTouchMoveId = null;
                this.touchMove.x = 0;
                this.touchMove.z = 0;
            } else if (touch.identifier === this.activeTouchLookId) {
                this.activeTouchLookId = null;
            }
        }
        if (e.touches.length < 2) {
            this.touchPinchDist = null;
        }
    }

    /**
     * Updates isometric camera position based on orbit angle & zoom
     */
    updateSimsCameraPosition() {
        const radius = 5.2 * this.simsZoom;
        this.simsCamPos.set(
            Math.sin(this.simsOrbitAngle) * radius,
            3.8 * this.simsZoom,
            Math.cos(this.simsOrbitAngle) * radius
        );
    }

    /**
     * Public Zoom Controls
     */
    zoomIn() {
        this.simsZoom = Math.max(0.55, this.simsZoom - 0.15);
        this.updateSimsCameraPosition();
    }

    zoomOut() {
        this.simsZoom = Math.min(1.85, this.simsZoom + 0.15);
        this.updateSimsCameraPosition();
    }

    resetZoom() {
        this.simsZoom = 1.0;
        this.simsOrbitAngle = Math.PI * 0.25;
        this.updateSimsCameraPosition();
    }

    rotateOrbit(deltaRadians) {
        this.simsOrbitAngle += deltaRadians;
        this.updateSimsCameraPosition();
    }

    /**
     * Switch mode with smooth camera animation
     * @param {'first_person'|'sims'} newMode
     */
    setMode(newMode) {
        if (this.mode === newMode) return;
        this.mode = newMode;
        this.targetTransition = newMode === 'sims' ? 1.0 : 0.0;
        this.targetNavPos = null;

        if (newMode === 'sims') {
            this.exitPointerLock();
            this.architecture.setWallCutaway(true);
            if (this.character) {
                this.character.setVisibility(true);
            }
            if (this.plumbobGroup) {
                this.plumbobGroup.visible = true;
            }
        } else {
            this.architecture.setWallCutaway(false);
            if (this.character) {
                this.character.setVisibility(false);
            }
            if (this.plumbobGroup) {
                this.plumbobGroup.visible = false;
            }
        }
    }

    /**
     * Per-frame update step
     * @param {number} dt Delta time in seconds
     */
    update(dt) {
        const delta = Math.min(dt, 0.05);

        // 1. Smoothly interpolate transition progress between 1st person and Sims
        if (Math.abs(this.transitionProgress - this.targetTransition) > 0.001) {
            this.transitionProgress += (this.targetTransition - this.transitionProgress) * (1.0 - Math.exp(-6.0 * delta));
        } else {
            this.transitionProgress = this.targetTransition;
        }

        // 2. Smooth rotation damping (lambda = 28)
        const rotDamp = 1.0 - Math.exp(-28.0 * delta);
        this.yaw += (this.targetYaw - this.yaw) * rotDamp;
        this.pitch += (this.targetPitch - this.pitch) * rotDamp;

        // 3. Movement kinematics (Faster speeds: 3.2m/s walk, 5.8m/s sprint)
        let moveX = 0;
        let moveZ = 0;

        if (this.keys.forward) moveZ -= 1;
        if (this.keys.backward) moveZ += 1;
        if (this.keys.left) moveX -= 1;
        if (this.keys.right) moveX += 1;

        if (Math.abs(this.touchMove.x) > 0.05 || Math.abs(this.touchMove.z) > 0.05) {
            moveX += this.touchMove.x;
            moveZ += this.touchMove.z;
        }

        // Handle Point-and-Click navigation in The Sims mode
        if (this.targetNavPos && this.mode === 'sims' && Math.abs(moveX) < 0.01 && Math.abs(moveZ) < 0.01) {
            const dx = this.targetNavPos.x - this.playerPos.x;
            const dz = this.targetNavPos.z - this.playerPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 0.12) {
                moveX = dx / dist;
                moveZ = dz / dist;
            } else {
                this.targetNavPos = null;
            }
        }

        const isMoving = Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01;
        if (isMoving) {
            const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
            moveX /= len;
            moveZ /= len;
        }

        const speed = this.keys.run ? this.runSpeed : this.walkSpeed;
        const moveDist = speed * delta;

        // Direction calculation
        const sinY = Math.sin(this.yaw);
        const cosY = Math.cos(this.yaw);
        const forwardX = -sinY;
        const forwardZ = -cosY;
        const rightX = cosY;
        const rightZ = -sinY;

        let deltaWorldX = 0;
        let deltaWorldZ = 0;
        let headingAngle = this.yaw;

        if (this.mode === 'first_person') {
            deltaWorldX = (forwardX * -moveZ + rightX * moveX) * moveDist;
            deltaWorldZ = (forwardZ * -moveZ + rightZ * moveX) * moveDist;
            headingAngle = Math.atan2(deltaWorldX, deltaWorldZ);
        } else {
            // In Sims mode, movement follows world axes / click target
            deltaWorldX = moveX * moveDist;
            deltaWorldZ = moveZ * moveDist;
            headingAngle = Math.atan2(deltaWorldX, deltaWorldZ);
        }

        // 4. Resolve horizontal collisions with furniture elevation consideration
        if (isMoving) {
            const res = this.collision.resolveMovement(
                this.playerPos.x,
                this.playerPos.z,
                deltaWorldX,
                deltaWorldZ,
                this.collision.playerRadius,
                this.feetY
            );
            this.targetPlayerPos.x = res.x;
            this.targetPlayerPos.z = res.z;
        }

        // Positional smoothing
        const posDamp = 1.0 - Math.exp(-16.0 * delta);
        this.playerPos.x += (this.targetPlayerPos.x - this.playerPos.x) * posDamp;
        this.playerPos.z += (this.targetPlayerPos.z - this.playerPos.z) * posDamp;

        // 5. Vertical Jump & Gravity Physics
        const groundElevation = this.collision.getGroundElevation(
            this.playerPos.x,
            this.playerPos.z,
            this.collision.playerRadius
        );

        if (!this.isGrounded) {
            this.verticalVelocity -= this.gravity * delta;
            this.feetY += this.verticalVelocity * delta;

            if (this.feetY <= groundElevation) {
                this.feetY = groundElevation;
                this.verticalVelocity = 0;
                this.isGrounded = true;
                this.isJumping = false;
            }

            // Ceiling limit (3.6m room height)
            if (this.feetY + 1.71 > 3.45) {
                this.feetY = 3.45 - 1.71;
                this.verticalVelocity = Math.min(0, this.verticalVelocity);
            }
        } else {
            // If stepped off bed/desk, start falling
            if (this.feetY > groundElevation) {
                this.isGrounded = false;
                this.isJumping = true;
            } else {
                this.feetY = groundElevation;
            }
        }

        // 6. Head Bobbing (only on ground in 1st person)
        if (isMoving && this.isGrounded && this.mode === 'first_person') {
            this.bobIntensity = Math.min(1.0, this.bobIntensity + delta * 6.0);
            this.bobPhase += delta * (speed > 4.0 ? 10.5 : 8.0);
        } else {
            this.bobIntensity = Math.max(0.0, this.bobIntensity - delta * 5.0);
        }
        const bobOffset = Math.sin(this.bobPhase) * 0.02 * this.bobIntensity;
        this.playerPos.y = this.feetY + 1.62 + bobOffset;

        // 7. Update 3D Character (Lera)
        this._charWorldPos.set(this.playerPos.x, this.feetY, this.playerPos.z);
        if (this.character) {
            this.character.update(
                delta,
                this._charWorldPos,
                isMoving,
                speed,
                headingAngle,
                !this.isGrounded,
                this.feetY - groundElevation
            );
        }

        // Update Plumbob fallback if no character
        if (this.plumbobGroup) {
            this.plumbobGroup.position.set(this.playerPos.x, this.feetY, this.playerPos.z);
            if (this.plumbobMesh) {
                this.plumbobMesh.rotation.y += delta * 2.2;
                this.plumbobMesh.position.y = 1.95 + Math.sin(Date.now() * 0.003) * 0.05;
            }
        }

        // 8. Camera Positioning & Blending
        if (this.transitionProgress <= 0.001) {
            // Pure First-Person View
            this.camera.fov = this.fpFov;
            this.camera.position.copy(this.playerPos);

            this._lookTarget.set(
                this.playerPos.x - Math.sin(this.yaw) * Math.cos(this.pitch),
                this.playerPos.y + Math.sin(this.pitch),
                this.playerPos.z - Math.cos(this.yaw) * Math.cos(this.pitch)
            );
            this.camera.lookAt(this._lookTarget);
        } else if (this.transitionProgress >= 0.999) {
            // Pure The Sims Isometric View
            this.camera.fov = 42;
            this.camera.position.copy(this.simsCamPos);
            // Smoothly track Lera in Sims mode
            this.simsLookAt.set(
                this.playerPos.x * 0.35,
                0.9 + this.feetY * 0.5,
                this.playerPos.z * 0.35
            );
            this.camera.lookAt(this.simsLookAt);
        } else {
            // Smooth blended transition
            const t = this.transitionProgress;
            const easeT = t * t * (3 - 2 * t);

            this.camera.fov = THREE.MathUtils.lerp(this.fpFov, 42, easeT);
            this.camera.position.lerpVectors(this.playerPos, this.simsCamPos, easeT);

            this._lookTarget.set(
                this.playerPos.x - Math.sin(this.yaw) * Math.cos(this.pitch),
                this.playerPos.y + Math.sin(this.pitch),
                this.playerPos.z - Math.cos(this.yaw) * Math.cos(this.pitch)
            );
            this._desiredCamPos.lerpVectors(this._lookTarget, this.simsLookAt, easeT);
            this.camera.lookAt(this._desiredCamPos);
        }

        this.camera.updateProjectionMatrix();
    }

    dispose() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this._onKeyDown);
            window.removeEventListener('keyup', this._onKeyUp);
            window.removeEventListener('mouseup', this._onMouseUp);
        }
        if (typeof document !== 'undefined') {
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('pointerlockchange', this._onPointerLockChange);
        }

        if (this.domElement && typeof this.domElement.removeEventListener === 'function') {
            this.domElement.removeEventListener('mousedown', this._onMouseDown);
            this.domElement.removeEventListener('click', this._onClick);
            this.domElement.removeEventListener('wheel', this._onWheel);
            this.domElement.removeEventListener('contextmenu', this._onContextMenu);

            this.domElement.removeEventListener('touchstart', this._onTouchStart);
            this.domElement.removeEventListener('touchmove', this._onTouchMove);
            this.domElement.removeEventListener('touchend', this._onTouchEnd);
            this.domElement.removeEventListener('touchcancel', this._onTouchEnd);
        }

        if (this.plumbobMesh) {
            this.plumbobMesh.geometry.dispose();
            this.plumbobMesh.material.dispose();
        }
    }
}
