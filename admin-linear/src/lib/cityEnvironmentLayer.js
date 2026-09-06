/**
 * Three.js City Environment: 3D Trees, Street Lamps, and Moving Vehicles
 * Petrogradskaya Side (Петроградская сторона), Saint Petersburg
 *
 * Integrated into Three.js Custom Layer sharing MapLibre GL depth buffer.
 */

import * as THREE from 'three';
import {
    CITY_TREES,
    TREE_SPECIES,
    STREET_LAMPS,
    INITIAL_VEHICLES,
    advanceTraffic
} from './cityEnvironmentData.js';

/**
 * Creates a stylized low-poly 3D tree.
 */
export function createTreeMesh(treeSpec) {
    const group = new THREE.Group();
    group.name = treeSpec.id;

    const species = Object.values(TREE_SPECIES).find(s => s.id === treeSpec.species) || TREE_SPECIES.LINDEN;
    const h = treeSpec.height || species.avgHeight;
    const r = treeSpec.radius || species.radius;

    // 1. Trunk
    const trunkH = h * 0.45;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, trunkH, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: species.trunkColor });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    group.add(trunk);

    // 2. Multi-cluster foliage canopy
    const canopyGroup = new THREE.Group();
    canopyGroup.name = 'canopy';
    canopyGroup.position.y = trunkH;

    const folMat = new THREE.MeshLambertMaterial({
        color: species.foliageColor,
        flatShading: true
    });

    // Main central crown
    const crown1Geo = new THREE.DodecahedronGeometry(r, 1);
    const crown1 = new THREE.Mesh(crown1Geo, folMat);
    crown1.position.y = r * 0.7;
    canopyGroup.add(crown1);

    // Upper secondary puff
    const crown2Geo = new THREE.DodecahedronGeometry(r * 0.75, 1);
    const crown2 = new THREE.Mesh(crown2Geo, folMat);
    crown2.position.set(r * 0.15, r * 1.35, -r * 0.15);
    canopyGroup.add(crown2);

    // Side accent puff
    const crown3Geo = new THREE.DodecahedronGeometry(r * 0.65, 1);
    const crown3 = new THREE.Mesh(crown3Geo, folMat);
    crown3.position.set(-r * 0.3, r * 0.8, r * 0.25);
    canopyGroup.add(crown3);

    group.add(canopyGroup);

    // 3. Contact shadow circle
    const shadowGeo = new THREE.CircleGeometry(r * 1.1, 8);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.32,
        depthWrite: false
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    group.userData = { spec: treeSpec, canopyGroup, baseRotation: treeSpec.rotation || 0 };
    group.rotation.y = treeSpec.rotation || 0;
    group.scale.set(2.0, 2.0, 2.0);

    group.traverse(o => {
        if (o.isMesh) {
            o.frustumCulled = false;
            if (o.material) {
                o.material.side = THREE.DoubleSide;
            }
        }
    });

    return group;
}

/**
 * Creates a cast-iron street lamp with night downward light.
 */
export function createStreetLampMesh(lampSpec) {
    const group = new THREE.Group();
    group.name = lampSpec.id;

    const h = lampSpec.height || 4.8;
    const postMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

    // 1. Post pole
    const postGeo = new THREE.CylinderGeometry(0.06, 0.12, h, 6);
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = h / 2;
    group.add(post);

    // 2. Lantern housing head
    const headGeo = new THREE.BoxGeometry(0.35, 0.45, 0.35);
    const headMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfef08a,
        emissiveIntensity: 0.2
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.name = 'lanternHead';
    head.position.y = h + 0.15;
    group.add(head);

    // 3. Downward volumetric light pool
    const poolGeo = new THREE.CircleGeometry(4.2, 10);
    const poolMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.name = 'lightPool';
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    group.add(pool);

    group.userData = { spec: lampSpec, head, pool };
    group.scale.set(1.4, 1.4, 1.4);

    group.traverse(o => {
        if (o.isMesh) o.frustumCulled = false;
    });

    return group;
}

/**
 * Creates a low-poly vehicle mesh (taxi, bus, sedan) with headlights.
 */
export function createVehicleMesh(spec) {
    const group = new THREE.Group();
    group.name = spec.id;

    const w = spec.width || 1.85;
    const l = spec.length || 4.6;
    const h = spec.height || 1.45;
    const bodyColor = new THREE.Color(spec.color || '#facc15');

    // 1. Lower chassis body
    const bodyGeo = new THREE.BoxGeometry(w, h * 0.55, l);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = (h * 0.55) / 2 + 0.2;
    group.add(body);

    // 2. Cabin / Roof with tinted glass
    const cabinL = spec.type === 'bus' ? l * 0.85 : l * 0.52;
    const cabinH = spec.type === 'bus' ? h * 0.5 : h * 0.45;
    const cabinW = w * 0.88;
    const cabinGeo = new THREE.BoxGeometry(cabinW, cabinH, cabinL);
    const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.2,
        metalness: 0.6
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.y = h * 0.55 + cabinH / 2 + 0.18;
    cabin.position.z = spec.type === 'bus' ? 0 : -0.2;
    group.add(cabin);

    // 3. Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x09090b });
    const wheelX = w / 2;
    const wheelZ = l * 0.32;
    const wheelY = 0.28;

    [
        [-wheelX, wheelY, wheelZ],
        [wheelX, wheelY, wheelZ],
        [-wheelX, wheelY, -wheelZ],
        [wheelX, wheelY, -wheelZ]
    ].forEach(([wx, wy, wz]) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, wy, wz);
        group.add(wheel);
    });

    // 4. Taxi checker roof sign
    if (spec.hasTaxiSign) {
        const signGeo = new THREE.BoxGeometry(0.5, 0.18, 0.25);
        const signMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xfacc15,
            emissiveIntensity: 0.8
        });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.y = h * 0.55 + cabinH + 0.28;
        sign.position.z = -0.2;
        group.add(sign);
    }

    // 5. Forward Headlights & Beams
    const hlGroup = new THREE.Group();
    hlGroup.name = 'headlights';

    const hlLampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hlGeo = new THREE.SphereGeometry(0.12, 6, 6);

    const leftHl = new THREE.Mesh(hlGeo, hlLampMat);
    leftHl.position.set(-w * 0.36, 0.45, l / 2 + 0.05);
    hlGroup.add(leftHl);

    const rightHl = new THREE.Mesh(hlGeo, hlLampMat);
    rightHl.position.set(w * 0.36, 0.45, l / 2 + 0.05);
    hlGroup.add(rightHl);

    // Volumetric forward beam cone
    const beamGeo = new THREE.ConeGeometry(2.4, 9.0, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0xfffbeb,
        transparent: true,
        opacity: 0.0, // dynamically modulated by sun elevation
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'beam';
    beam.rotation.x = -Math.PI / 2 + 0.08;
    beam.position.set(0, 0.45, l / 2 + 4.5);
    hlGroup.add(beam);

    group.add(hlGroup);
    group.userData = { spec, hlGroup, beamMat, leftHl, rightHl };
    group.scale.set(1.8, 1.8, 1.8);

    group.traverse(o => {
        if (o.isMesh) {
            o.frustumCulled = false;
            if (o.material) {
                o.material.side = THREE.DoubleSide;
            }
        }
    });

    return group;
}

/**
 * City Environment Controller managing trees, lamps, and traffic.
 */
export class CityEnvironmentController {
    constructor(scene, gpsToLocalFn, modelOrigin, modelScale) {
        this.scene = scene;
        this.gpsToLocal = gpsToLocalFn;
        this.modelOrigin = modelOrigin;
        this.modelScale = modelScale;

        this.treeMeshes = [];
        this.lampMeshes = [];
        this.vehicleMeshes = new Map();
        this.vehicles = [...INITIAL_VEHICLES];

        this.initTrees();
        this.initLamps();
        this.initVehicles();
    }

    initTrees() {
        CITY_TREES.forEach(spec => {
            const mesh = createTreeMesh(spec);
            const local = this.gpsToLocal(spec.coords, this.modelOrigin, this.modelScale);
            mesh.position.set(local.x, 0.05, local.z);
            this.scene.add(mesh);
            this.treeMeshes.push(mesh);
        });
    }

    initLamps() {
        STREET_LAMPS.forEach(spec => {
            const mesh = createStreetLampMesh(spec);
            const local = this.gpsToLocal(spec.coords, this.modelOrigin, this.modelScale);
            mesh.position.set(local.x, 0.05, local.z);
            this.scene.add(mesh);
            this.lampMeshes.push(mesh);
        });
    }

    initVehicles() {
        this.vehicles = advanceTraffic(this.vehicles, 0);
        this.vehicles.forEach(spec => {
            const mesh = createVehicleMesh(spec);
            if (spec.coords) {
                const local = this.gpsToLocal(spec.coords, this.modelOrigin, this.modelScale);
                mesh.position.set(local.x, 0.08, local.z);
            }
            this.vehicleMeshes.set(spec.id, mesh);
            this.scene.add(mesh);
        });
    }

    update(deltaMs = 33, sunData = null, nowMs = Date.now()) {
        const isNight = sunData ? (sunData.elevation <= 0 || sunData.phase === 'night') : false;
        const isSunset = sunData ? (sunData.phase === 'golden_hour' || sunData.phase === 'twilight') : false;

        // 1. Wind sway for trees (gentle sinusoidal wobble on canopy)
        const windTime = nowMs * 0.0022;
        this.treeMeshes.forEach(tree => {
            const canopy = tree.userData.canopyGroup;
            if (canopy) {
                const phase = tree.position.x * 0.05 + tree.position.z * 0.05;
                canopy.rotation.z = Math.sin(windTime + phase) * 0.045;
                canopy.rotation.x = Math.cos(windTime * 0.8 + phase) * 0.03;
            }
        });

        // 2. Street lamps night glow
        const lampIntensity = isNight ? 0.95 : (isSunset ? 0.45 : 0.0);
        const poolOpacity = isNight ? 0.35 : (isSunset ? 0.15 : 0.0);
        this.lampMeshes.forEach(lamp => {
            if (lamp.userData.head) {
                lamp.userData.head.material.emissiveIntensity = lampIntensity;
            }
            if (lamp.userData.pool) {
                lamp.userData.pool.material.opacity = poolOpacity;
            }
        });

        // 3. Traffic simulation with IDM advance & headlights
        this.vehicles = advanceTraffic(this.vehicles, deltaMs);
        const headlightBeamOpacity = isNight ? 0.28 : (isSunset ? 0.12 : 0.0);

        this.vehicles.forEach(v => {
            const mesh = this.vehicleMeshes.get(v.id);
            if (!mesh) return;

            const local = this.gpsToLocal(v.coords, this.modelOrigin, this.modelScale);
            mesh.position.set(local.x, 0.08, local.z);

            // Rotate vehicle along travel bearing
            const rad = ((v.bearing || 0) * Math.PI) / 180;
            mesh.rotation.y = rad;

            // Headlight beam illumination
            if (mesh.userData.beamMat) {
                mesh.userData.beamMat.opacity = headlightBeamOpacity;
            }
        });
    }

    dispose() {
        this.treeMeshes.forEach(m => this.scene.remove(m));
        this.lampMeshes.forEach(m => this.scene.remove(m));
        this.vehicleMeshes.forEach(m => this.scene.remove(m));
        this.treeMeshes = [];
        this.lampMeshes = [];
        this.vehicleMeshes.clear();
    }
}
