/**
 * MapLibre GL CustomLayerInterface: GTA-Style 3D Characters & Procedural Kinematics
 * Petrogradskaya Side (Петроградская сторона), Saint Petersburg
 *
 * Features:
 * 1. MapLibre GL CustomLayerInterface with renderingMode: '3d'.
 * 2. Shared WebGL depth buffer with MapLibre 3d-buildings (natural building occlusion).
 * 3. Local coordinate system anchored at Petrogradka Center [30.3080, 59.9590] (1 unit = 1 meter).
 * 4. Low-Poly GTA-style biped characters for all citizens and Lera:
 *    - Head, Torso, Left/Right Arms (shoulder + elbow), Left/Right Legs (hip + knee).
 *    - Rotating 3D Sims Plumbob octahedron above Lera's head with green emissive glow.
 *    - Directional astronomical ground contact shadows under feet.
 * 5. Procedural Kinematics:
 *    - Anti-phase arm & leg swings (A_walk ≈ 30°).
 *    - Knee flexion in swing phase (A_knee ≈ 37°).
 *    - Pelvis vertical bobbing (A_bob ≈ 0.035m) and torso twist (A_twist ≈ 4.6°).
 *    - 3D yaw orientation following walking direction.
 *    - Waving gesture in GREETING state.
 */

import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
    PETROGRADKA_PEDESTRIANS,
    LERA_3D_CONFIG,
    AGENT_STATE,
    calculateBearing
} from './pedestrianData.js';
import { CityEnvironmentController } from './cityEnvironmentLayer.js';

export const PETROGRADKA_CENTER = [30.3080, 59.9590];

// ============================================================================
// PHYSICAL 3D STOREFRONTS & NIGHT LIGHTING
// ============================================================================

export const PHYSICAL_STOREFRONTS = [
    {
        id: 'storefront_sloy',
        name: 'Кофейня «Слой»',
        coords: [30.312186, 59.961159],
        awningColor: '#d97706',
        glowColor: 0xffedd5,
        nightIntensity: 1.8,
        width: 3.2,
        height: 2.8,
        depth: 1.2
    },
    {
        id: 'storefront_vkusvill',
        name: 'Магазин «ВкусВилл»',
        coords: [30.311316, 59.960614],
        awningColor: '#059669',
        glowColor: 0xdcfce7,
        nightIntensity: 1.6,
        width: 3.5,
        height: 2.8,
        depth: 1.2
    },
    {
        id: 'storefront_showroom',
        name: 'Шоурум на Большом',
        coords: [30.29488, 59.95520],
        awningColor: '#4f46e5',
        glowColor: 0xe0e7ff,
        nightIntensity: 1.5,
        width: 3.0,
        height: 2.8,
        depth: 1.2
    }
];

export function createPhysicalStorefrontMesh(spec) {
    const group = new THREE.Group();
    group.name = spec.id;
    group.userData = { id: spec.id, spec };

    const w = spec.width || 3.0;
    const h = spec.height || 2.8;
    const d = spec.depth || 1.2;

    // 1. Entrance canopy / awning
    const awningGeo = new THREE.BoxGeometry(w + 0.4, 0.18, d + 0.4);
    const awningMat = new THREE.MeshLambertMaterial({ color: spec.awningColor || '#d97706' });
    const awningMesh = new THREE.Mesh(awningGeo, awningMat);
    awningMesh.position.set(0, h, (d + 0.4) / 2);
    awningMesh.rotation.x = 0.08;
    group.add(awningMesh);

    // 2. Translucent glass facade & display window
    const glassGeo = new THREE.BoxGeometry(w, h, 0.08);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.35,
        roughness: 0.1,
        metalness: 0.3
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, h / 2, 0.04);
    group.add(glassMesh);

    // 3. Facade pillars / frame
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const pillarGeo = new THREE.BoxGeometry(0.2, h, 0.2);
    const leftPillar = new THREE.Mesh(pillarGeo, frameMat);
    leftPillar.position.set(-w / 2, h / 2, 0.1);
    const rightPillar = new THREE.Mesh(pillarGeo, frameMat);
    rightPillar.position.set(w / 2, h / 2, 0.1);
    group.add(leftPillar);
    group.add(rightPillar);

    // 4. Night Glow Point Light under the awning
    const glowLight = new THREE.PointLight(spec.glowColor || 0xffedd5, spec.nightIntensity || 1.5, 7.0, 1.8);
    glowLight.position.set(0, h - 0.2, d / 2);
    glowLight.name = 'storefrontLight';
    group.add(glowLight);

    group.traverse(o => {
        if (o.isMesh) {
            o.frustumCulled = false;
        }
    });

    return group;
}

/**
 * Computes Mercator transformation matrix mapping local Three.js coordinates
 * [X meters east, Y meters up, Z meters north] to MapLibre Mercator space.
 * Determinant is strictly positive (+modelScale^3), preserving right-handedness,
 * preventing triangle face culling and depth inversions.
 */
export function getMercatorTransformMatrix(centerLngLat = PETROGRADKA_CENTER) {
    const modelOrigin = maplibregl.MercatorCoordinate.fromLngLat(centerLngLat, 0);
    const modelScale = modelOrigin.meterInMercatorCoordinateUnits();

    // MapLibre Mercator: X = East, Y = South, Z = Up
    // Local Three.js:    X = East, Y = Up,    Z = North
    // X_merc = modelOrigin.x + x * modelScale
    // Y_merc = modelOrigin.y - z * modelScale
    // Z_merc = modelOrigin.z + y * modelScale
    // Det = +modelScale^3 > 0 (Right-handed, positive determinant)
    const matrix = new THREE.Matrix4().set(
        modelScale, 0,          0,           modelOrigin.x,
        0,          0,          -modelScale, modelOrigin.y,
        0,          modelScale, 0,           modelOrigin.z,
        0,          0,          0,           1
    );

    return { matrix, modelOrigin, modelScale };
}

/**
 * Converts GPS [lng, lat] to local Three.js meter coordinates [x, y, z].
 * Local coordinates: X = East, Y = Up, Z = North.
 */
export function gpsToLocalMeters(coords, modelOrigin, modelScale) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(coords, 0);
    const x = (mc.x - modelOrigin.x) / modelScale;
    const z = (modelOrigin.y - mc.y) / modelScale;
    return { x, y: 0.20, z };
}

/**
 * Creates a low-poly GTA-style 3D character mesh with hierarchical skeleton joints.
 *
 * @param {Object} config - character configuration object
 * @returns {THREE.Group} character root group
 */
export function createGtaCharacterMesh(config) {
    const root = new THREE.Group();
    root.name = `char_${config.id}`;
    root.userData = { id: config.id, config };
    root.scale.set(3.5, 3.5, 3.5); // Scaled for authentic GTA/Sims street-level visibility

    const spec = config.model3d || {
        skinColor: '#f5d0b5',
        hairColor: '#271b12',
        hairStyle: 'short',
        jacketColor: '#3b82f6',
        pantsColor: '#1e293b',
        shoeColor: '#ffffff'
    };

    // 1. Directional Contact Ground Shadow Disc
    const shadowGeo = new THREE.CircleGeometry(0.35, 20);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x05070a,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    shadowMesh.name = 'shadow';
    root.add(shadowMesh);

    // 2. Pelvis Root (vertical bobbing joint)
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.85;
    pelvis.name = 'pelvis';
    root.add(pelvis);

    // Shared Materials
    const skinMat = new THREE.MeshLambertMaterial({ color: spec.skinColor || '#f5d0b5' });
    const jacketMat = new THREE.MeshLambertMaterial({ color: spec.jacketColor || '#3b82f6' });
    const pantsMat = new THREE.MeshLambertMaterial({ color: spec.pantsColor || '#1e293b' });
    const shoeMat = new THREE.MeshLambertMaterial({ color: spec.shoeColor || '#ffffff' });
    const hairMat = new THREE.MeshLambertMaterial({ color: spec.hairColor || '#271b12' });

    // 3. Torso (with counter-twist rotation)
    const torso = new THREE.Group();
    torso.name = 'torso';
    torso.position.y = 0;
    pelvis.add(torso);

    const torsoGeo = new THREE.BoxGeometry(0.38, 0.52, 0.22);
    const torsoMesh = new THREE.Mesh(torsoGeo, jacketMat);
    torsoMesh.position.y = 0.26;
    torso.add(torsoMesh);

    // 4. Head Group (head cube + hair/hat + face details)
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.52;
    headGroup.name = 'head';
    torso.add(headGroup);

    const headGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.14;
    headGroup.add(headMesh);

    // Hair / Hat Mesh
    if (spec.hairStyle === 'cap') {
        const capGeo = new THREE.BoxGeometry(0.26, 0.08, 0.26);
        const capMesh = new THREE.Mesh(capGeo, hairMat);
        capMesh.position.set(0, 0.24, 0);
        headGroup.add(capMesh);

        const visorGeo = new THREE.BoxGeometry(0.24, 0.02, 0.10);
        const visorMesh = new THREE.Mesh(visorGeo, hairMat);
        visorMesh.position.set(0, 0.20, 0.16);
        headGroup.add(visorMesh);
    } else {
        const hairGeo = new THREE.BoxGeometry(
            0.26,
            spec.hairStyle === 'long' ? 0.26 : (spec.hairStyle === 'bob' ? 0.18 : 0.10),
            0.26
        );
        const hairMesh = new THREE.Mesh(hairGeo, hairMat);
        hairMesh.position.set(0, 0.22, spec.hairStyle === 'long' ? -0.02 : 0);
        headGroup.add(hairMesh);
    }

    // 5. 3D Sims Plumbob (for Lera)
    let plumbobMesh = null;
    let plumbobGroup = null;
    if (config.isLera || config.id === 'lera' || spec.hasPlumbob) {
        plumbobGroup = new THREE.Group();
        plumbobGroup.position.y = 0.75;
        plumbobGroup.name = 'plumbob';

        const plumbobGeo = new THREE.OctahedronGeometry(0.18, 0);
        plumbobGeo.scale(0.9, 1.9, 0.9);

        const plumbobMat = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            emissive: 0x16a34a,
            emissiveIntensity: 1.2,
            roughness: 0.1,
            metalness: 0.2
        });

        plumbobMesh = new THREE.Mesh(plumbobGeo, plumbobMat);
        plumbobGroup.add(plumbobMesh);
        headGroup.add(plumbobGroup);
    }

    // 6. Left Arm & Shoulder Pivot
    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(0.24, 0.46, 0);
    leftShoulder.name = 'leftShoulder';
    torso.add(leftShoulder);

    const upperArmGeo = new THREE.BoxGeometry(0.10, 0.24, 0.10);
    const leftUpperArm = new THREE.Mesh(upperArmGeo, jacketMat);
    leftUpperArm.position.set(0, -0.12, 0);
    leftShoulder.add(leftUpperArm);

    const leftElbow = new THREE.Group();
    leftElbow.position.set(0, -0.24, 0);
    leftElbow.name = 'leftElbow';
    leftShoulder.add(leftElbow);

    const forearmGeo = new THREE.BoxGeometry(0.09, 0.22, 0.09);
    const leftForearm = new THREE.Mesh(forearmGeo, skinMat);
    leftForearm.position.set(0, -0.11, 0);
    leftElbow.add(leftForearm);

    // 7. Right Arm & Shoulder Pivot
    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(-0.24, 0.46, 0);
    rightShoulder.name = 'rightShoulder';
    torso.add(rightShoulder);

    const rightUpperArm = new THREE.Mesh(upperArmGeo, jacketMat);
    rightUpperArm.position.set(0, -0.12, 0);
    rightShoulder.add(rightUpperArm);

    const rightElbow = new THREE.Group();
    rightElbow.position.set(0, -0.24, 0);
    rightElbow.name = 'rightElbow';
    rightShoulder.add(rightElbow);

    const rightForearm = new THREE.Mesh(forearmGeo, skinMat);
    rightForearm.position.set(0, -0.11, 0);
    rightElbow.add(rightForearm);

    // Accessories
    if (spec.accessory === 'coffee') {
        const cupGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.10, 8);
        const cupMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const cup = new THREE.Mesh(cupGeo, cupMat);
        cup.position.set(0, -0.20, 0.06);
        cup.rotation.x = Math.PI / 4;
        rightElbow.add(cup);
    } else if (spec.accessory === 'camera') {
        const camGeo = new THREE.BoxGeometry(0.12, 0.08, 0.06);
        const camMat = new THREE.MeshLambertMaterial({ color: 0x18181b });
        const camera = new THREE.Mesh(camGeo, camMat);
        camera.position.set(0, 0.20, 0.14);
        torso.add(camera);
    } else if (spec.accessory === 'flowers') {
        const flowerGeo = new THREE.ConeGeometry(0.09, 0.20, 6);
        const flowerMat = new THREE.MeshLambertMaterial({ color: 0xf43f5e });
        const flowers = new THREE.Mesh(flowerGeo, flowerMat);
        flowers.position.set(0, -0.18, 0.07);
        flowers.rotation.x = Math.PI / 3;
        rightElbow.add(flowers);
    } else if (spec.accessory === 'headphones') {
        const hpMat = new THREE.MeshLambertMaterial({ color: 0x09090b });
        const earGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8);
        earGeo.rotateZ(Math.PI / 2);
        const earL = new THREE.Mesh(earGeo, hpMat);
        earL.position.set(0.14, 0.14, 0);
        const earR = new THREE.Mesh(earGeo, hpMat);
        earR.position.set(-0.14, 0.14, 0);
        headGroup.add(earL);
        headGroup.add(earR);
    }

    // 8. Left Leg with Hip & Knee Pivots
    const leftHip = new THREE.Group();
    leftHip.position.set(0.12, 0, 0);
    leftHip.name = 'leftHip';
    pelvis.add(leftHip);

    const upperLegGeo = new THREE.BoxGeometry(0.14, 0.40, 0.14);
    const leftUpperLeg = new THREE.Mesh(upperLegGeo, pantsMat);
    leftUpperLeg.position.set(0, -0.20, 0);
    leftHip.add(leftUpperLeg);

    const leftKnee = new THREE.Group();
    leftKnee.position.set(0, -0.40, 0);
    leftKnee.name = 'leftKnee';
    leftHip.add(leftKnee);

    const lowerLegGeo = new THREE.BoxGeometry(0.12, 0.38, 0.12);
    const leftLowerLeg = new THREE.Mesh(lowerLegGeo, pantsMat);
    leftLowerLeg.position.set(0, -0.19, 0);
    leftKnee.add(leftLowerLeg);

    const shoeGeo = new THREE.BoxGeometry(0.13, 0.08, 0.18);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.38, 0.03);
    leftKnee.add(leftShoe);

    // 9. Right Leg with Hip & Knee Pivots
    const rightHip = new THREE.Group();
    rightHip.position.set(-0.12, 0, 0);
    rightHip.name = 'rightHip';
    pelvis.add(rightHip);

    const rightUpperLeg = new THREE.Mesh(upperLegGeo, pantsMat);
    rightUpperLeg.position.set(0, -0.20, 0);
    rightHip.add(rightUpperLeg);

    const rightKnee = new THREE.Group();
    rightKnee.position.set(0, -0.40, 0);
    rightKnee.name = 'rightKnee';
    rightHip.add(rightKnee);

    const rightLowerLeg = new THREE.Mesh(lowerLegGeo, pantsMat);
    rightLowerLeg.position.set(0, -0.19, 0);
    rightKnee.add(rightLowerLeg);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.38, 0.03);
    rightKnee.add(rightShoe);

    // Rig references dictionary on root for fast procedural animation
    root.joints = {
        pelvis,
        torso,
        head: headGroup,
        leftShoulder,
        leftElbow,
        rightShoulder,
        rightElbow,
        leftHip,
        leftKnee,
        rightHip,
        rightKnee,
        shadow: shadowMesh,
        plumbob: plumbobMesh,
        plumbobGroup
    };

    root.scale.set(3.5, 3.5, 3.5);

    root.traverse(o => {
        if (o.isMesh) {
            o.frustumCulled = false;
            if (o.material) {
                o.material.side = THREE.DoubleSide;
            }
        }
    });

    return root;
}

/**
 * Updates procedural kinematics of a 3D character group.
 *
 * @param {THREE.Group} characterGroup
 * @param {string} state - WALKING | IDLE_STOP | GREETING
 * @param {number} speed - current walking speed in m/s
 * @param {number} gaitPhase - gait cycle phase in radians
 * @param {number} bearingDeg - compass bearing in degrees
 * @param {number} timeMs - current timestamp in ms
 * @param {boolean} isGreeting - whether character is actively greeting
 * @param {Object} [sunData] - astronomical sun lighting data
 */
export function updateGtaCharacterAnimation(characterGroup, state, speed, gaitPhase, bearingDeg, timeMs, isGreeting, sunData) {
    if (!characterGroup || !characterGroup.joints) return;

    const j = characterGroup.joints;

    // 1. 3D Heading Yaw Rotation
    // In local coordinates (+Z = North, +X = East):
    // Bearing 0 (North) -> yaw = 0
    // Bearing 90 (East) -> yaw = +PI/2
    // Bearing 180 (South) -> yaw = PI
    // Bearing 270 (West) -> yaw = -PI/2
    const targetYaw = (bearingDeg * Math.PI) / 180;

    // Smooth shortest-arc yaw interpolation
    let diff = targetYaw - characterGroup.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    characterGroup.rotation.y += diff * 0.2;

    // 2. Plumbob Spin & Hover (Lera)
    if (j.plumbob && j.plumbobGroup) {
        j.plumbob.rotation.y = (timeMs * 0.003) % (Math.PI * 2);
        if (j.plumbobGroup.parent === characterGroup) {
            j.plumbobGroup.position.y = 1.48 + 0.05 * Math.sin(timeMs * 0.004);
        } else {
            j.plumbobGroup.position.y = 0.65 + 0.04 * Math.sin(timeMs * 0.004);
        }
    }

    // 3. Directional Contact Ground Shadow
    if (j.shadow) {
        const sunElev = Math.max(10, sunData?.elevation ?? 35);
        const shadowLength = Math.min(2.5, 1.0 / Math.tan((sunElev * Math.PI) / 180));
        j.shadow.scale.set(1.0, shadowLength, 1.0);
        if (sunData?.azimuth !== undefined) {
            j.shadow.rotation.z = (sunData.azimuth * Math.PI) / 180;
        }
    }

    // 4. Procedural Kinematics
    const A_walk = 0.52;  // ~30 degrees
    const A_knee = 0.65;  // ~37 degrees
    const A_arm  = 0.40;  // ~23 degrees
    const A_bob  = 0.035; // 3.5 cm
    const A_twist = 0.08; // ~4.6 degrees

    if (isGreeting || state === AGENT_STATE.GREETING) {
        // GREETING STATE: wave right arm vigorously, face greeting partner
        j.rightShoulder.rotation.x = -2.2;
        j.rightShoulder.rotation.z = -0.3 + 0.35 * Math.sin(timeMs * 0.008);
        j.rightElbow.rotation.x = -0.5;

        j.leftShoulder.rotation.x *= 0.8;
        j.leftShoulder.rotation.z *= 0.8;

        j.head.rotation.z = 0.12; // Friendly head tilt
        j.head.rotation.y = 0.15 * Math.sin(timeMs * 0.004);

        // Stand or slight step
        j.leftHip.rotation.x *= 0.8;
        j.rightHip.rotation.x *= 0.8;
        j.leftKnee.rotation.x *= 0.8;
        j.rightKnee.rotation.x *= 0.8;
        j.pelvis.position.y = 0.85;
        j.torso.rotation.y = 0;
    } else if (state === AGENT_STATE.IDLE_STOP || speed < 0.05) {
        // IDLE_STOP STATE: idle breathing, head looking around storefront/park
        j.leftHip.rotation.x = 0;
        j.rightHip.rotation.x = 0;
        j.leftKnee.rotation.x = 0;
        j.rightKnee.rotation.x = 0;
        j.leftShoulder.rotation.x = 0;
        j.leftShoulder.rotation.z = 0;
        j.rightShoulder.rotation.x = 0;
        j.rightShoulder.rotation.z = 0;
        j.rightElbow.rotation.x = 0;

        j.pelvis.position.y = 0.85;
        j.torso.position.y = 0.008 * Math.sin(timeMs * 0.003); // gentle breathing
        j.torso.rotation.y = 0;
        j.head.rotation.y = 0.25 * Math.sin(timeMs * 0.0015); // look left and right
        j.head.rotation.z = 0;
    } else {
        // WALKING STATE: full dynamic biped locomotion
        const phi = gaitPhase;

        // Anti-phase hips
        j.leftHip.rotation.x = A_walk * Math.sin(phi);
        j.rightHip.rotation.x = -A_walk * Math.sin(phi);

        // Knee flexion in swing phase
        j.leftKnee.rotation.x = Math.max(0, -Math.sin(phi)) * A_knee;
        j.rightKnee.rotation.x = Math.max(0, Math.sin(phi)) * A_knee;

        // Anti-phase arms
        j.leftShoulder.rotation.x = -A_arm * Math.sin(phi);
        j.leftShoulder.rotation.z = 0.05;
        j.rightShoulder.rotation.x = A_arm * Math.sin(phi);
        j.rightShoulder.rotation.z = -0.05;
        j.rightElbow.rotation.x = 0;

        // Pelvis vertical bobbing
        j.pelvis.position.y = 0.85 + Math.abs(Math.sin(phi)) * A_bob;

        // Torso twist counteracting hips
        j.torso.rotation.y = A_twist * Math.sin(phi);
        j.head.rotation.y = -A_twist * 0.5 * Math.sin(phi);
        j.head.rotation.z = 0;
    }

    // 5. Authentic Skeletal Kinematics for Humanoid SkinnedMesh models
    const hb = characterGroup.userData.humanBones;
    if (hb) {
        if (isGreeting || state === AGENT_STATE.GREETING) {
            // GREETING STATE: right arm friendly wave, left arm resting by side, gentle head nod
            if (hb.RightArm && hb.RightArm.userData.restQuaternion) {
                hb.RightArm.quaternion.copy(hb.RightArm.userData.restQuaternion);
                hb.RightArm.rotateX(0.35); // raise arm
                hb.RightArm.rotateZ(-0.6 + 0.35 * Math.sin(timeMs * 0.008)); // wave hand
            }
            if (hb.LeftArm && hb.LeftArm.userData.restQuaternion) {
                hb.LeftArm.quaternion.copy(hb.LeftArm.userData.restQuaternion);
                hb.LeftArm.rotateX(1.31); // arm down along torso
                hb.LeftArm.rotateZ(0.04);
            }
            if (hb.LeftForeArm && hb.LeftForeArm.userData.restQuaternion) {
                hb.LeftForeArm.quaternion.copy(hb.LeftForeArm.userData.restQuaternion);
                hb.LeftForeArm.rotateX(0.2);
            }
            if (hb.RightForeArm && hb.RightForeArm.userData.restQuaternion) {
                hb.RightForeArm.quaternion.copy(hb.RightForeArm.userData.restQuaternion);
                hb.RightForeArm.rotateX(0.5);
            }
            if (hb.Head && hb.Head.userData.restQuaternion) {
                hb.Head.quaternion.copy(hb.Head.userData.restQuaternion);
                hb.Head.rotateZ(0.12);
                hb.Head.rotateY(0.15 * Math.sin(timeMs * 0.004));
            }
            if (hb.LeftUpLeg && hb.LeftUpLeg.userData.restQuaternion) hb.LeftUpLeg.quaternion.copy(hb.LeftUpLeg.userData.restQuaternion);
            if (hb.RightUpLeg && hb.RightUpLeg.userData.restQuaternion) hb.RightUpLeg.quaternion.copy(hb.RightUpLeg.userData.restQuaternion);
            if (hb.LeftLeg && hb.LeftLeg.userData.restQuaternion) hb.LeftLeg.quaternion.copy(hb.LeftLeg.userData.restQuaternion);
            if (hb.RightLeg && hb.RightLeg.userData.restQuaternion) hb.RightLeg.quaternion.copy(hb.RightLeg.userData.restQuaternion);
        } else if (state === AGENT_STATE.IDLE_STOP || speed < 0.05) {
            // IDLE_STOP STATE: arms relaxed by sides, gentle breathing & looking around
            if (hb.Spine && hb.Spine.userData.restQuaternion) {
                hb.Spine.quaternion.copy(hb.Spine.userData.restQuaternion);
                hb.Spine.rotateX(0.015 * Math.sin(timeMs * 0.0025));
            }
            if (hb.Head && hb.Head.userData.restQuaternion) {
                hb.Head.quaternion.copy(hb.Head.userData.restQuaternion);
                hb.Head.rotateY(0.20 * Math.sin(timeMs * 0.0012));
                hb.Head.rotateZ(0.04 * Math.cos(timeMs * 0.0018));
            }
            if (hb.LeftArm && hb.LeftArm.userData.restQuaternion) {
                hb.LeftArm.quaternion.copy(hb.LeftArm.userData.restQuaternion);
                hb.LeftArm.rotateX(1.31 + 0.02 * Math.sin(timeMs * 0.0025));
                hb.LeftArm.rotateZ(0.04);
            }
            if (hb.RightArm && hb.RightArm.userData.restQuaternion) {
                hb.RightArm.quaternion.copy(hb.RightArm.userData.restQuaternion);
                hb.RightArm.rotateX(1.31 + 0.02 * Math.sin(timeMs * 0.0025));
                hb.RightArm.rotateZ(-0.04);
            }
            if (hb.LeftForeArm && hb.LeftForeArm.userData.restQuaternion) {
                hb.LeftForeArm.quaternion.copy(hb.LeftForeArm.userData.restQuaternion);
                hb.LeftForeArm.rotateX(0.18);
            }
            if (hb.RightForeArm && hb.RightForeArm.userData.restQuaternion) {
                hb.RightForeArm.quaternion.copy(hb.RightForeArm.userData.restQuaternion);
                hb.RightForeArm.rotateX(0.18);
            }
            if (hb.LeftUpLeg && hb.LeftUpLeg.userData.restQuaternion) hb.LeftUpLeg.quaternion.copy(hb.LeftUpLeg.userData.restQuaternion);
            if (hb.RightUpLeg && hb.RightUpLeg.userData.restQuaternion) hb.RightUpLeg.quaternion.copy(hb.RightUpLeg.userData.restQuaternion);
            if (hb.LeftLeg && hb.LeftLeg.userData.restQuaternion) hb.LeftLeg.quaternion.copy(hb.LeftLeg.userData.restQuaternion);
            if (hb.RightLeg && hb.RightLeg.userData.restQuaternion) hb.RightLeg.quaternion.copy(hb.RightLeg.userData.restQuaternion);
        } else {
            // WALKING STATE: full dynamic biped locomotion synchronized to speed
            const phi = gaitPhase;
            const hipSwing = A_walk * Math.sin(phi);

            // Alternating hips swing forward/back
            if (hb.LeftUpLeg && hb.LeftUpLeg.userData.restQuaternion) {
                hb.LeftUpLeg.quaternion.copy(hb.LeftUpLeg.userData.restQuaternion);
                hb.LeftUpLeg.rotateX(hipSwing);
            }
            if (hb.RightUpLeg && hb.RightUpLeg.userData.restQuaternion) {
                hb.RightUpLeg.quaternion.copy(hb.RightUpLeg.userData.restQuaternion);
                hb.RightUpLeg.rotateX(-hipSwing);
            }

            // Knee flexion in swing phase (bends backwards)
            if (hb.LeftLeg && hb.LeftLeg.userData.restQuaternion) {
                const kneeBend = Math.max(0, -Math.sin(phi)) * A_knee;
                hb.LeftLeg.quaternion.copy(hb.LeftLeg.userData.restQuaternion);
                hb.LeftLeg.rotateX(-kneeBend);
            }
            if (hb.RightLeg && hb.RightLeg.userData.restQuaternion) {
                const kneeBend = Math.max(0, Math.sin(phi)) * A_knee;
                hb.RightLeg.quaternion.copy(hb.RightLeg.userData.restQuaternion);
                hb.RightLeg.rotateX(-kneeBend);
            }

            // Natural arm swing counter-balancing leg movement (hanging down, swinging along Z)
            if (hb.LeftArm && hb.LeftArm.userData.restQuaternion) {
                hb.LeftArm.quaternion.copy(hb.LeftArm.userData.restQuaternion);
                hb.LeftArm.rotateX(1.31);
                hb.LeftArm.rotateZ(A_arm * Math.sin(phi));
            }
            if (hb.RightArm && hb.RightArm.userData.restQuaternion) {
                hb.RightArm.quaternion.copy(hb.RightArm.userData.restQuaternion);
                hb.RightArm.rotateX(1.31);
                hb.RightArm.rotateZ(-A_arm * Math.sin(phi));
            }

            if (hb.LeftForeArm && hb.LeftForeArm.userData.restQuaternion) {
                hb.LeftForeArm.quaternion.copy(hb.LeftForeArm.userData.restQuaternion);
                hb.LeftForeArm.rotateX(0.25);
            }
            if (hb.RightForeArm && hb.RightForeArm.userData.restQuaternion) {
                hb.RightForeArm.quaternion.copy(hb.RightForeArm.userData.restQuaternion);
                hb.RightForeArm.rotateX(0.25);
            }

            // Torso twist counteracting hips
            if (hb.Spine && hb.Spine.userData.restQuaternion) {
                hb.Spine.quaternion.copy(hb.Spine.userData.restQuaternion);
                hb.Spine.rotateY(A_twist * Math.sin(phi));
            }
            if (hb.Head && hb.Head.userData.restQuaternion) {
                hb.Head.quaternion.copy(hb.Head.userData.restQuaternion);
                hb.Head.rotateY(-A_twist * 0.5 * Math.sin(phi));
            }
        }
    }
}

// Global GLTF Model Cache (loads each distinct URL exactly once)
export const modelCache = new Map();
const pendingModelLoads = new Map();

export function loadGltfModelCached(url) {
    if (modelCache.has(url)) {
        return Promise.resolve(modelCache.get(url));
    }
    if (pendingModelLoads.has(url)) {
        return pendingModelLoads.get(url);
    }
    const loader = new GLTFLoader();
    const p = new Promise((resolve, reject) => {
        loader.load(
            url,
            (gltf) => {
                modelCache.set(url, gltf);
                pendingModelLoads.delete(url);
                resolve(gltf);
            },
            undefined,
            (err) => {
                pendingModelLoads.delete(url);
                reject(err);
            }
        );
    });
    pendingModelLoads.set(url, p);
    return p;
}

export function getModelPathForCharacter(id) {
    const lower = String(id || '').toLowerCase();
    if (lower === 'lera') return '/models/lera.glb';
    if (lower === 'nastya') return '/models/nastya.glb';
    if (lower === 'max') return '/models/max.glb';

    // Парни ('dmitriy', 'mikhail', 'ilya', 'artem', 'gleb', 'sergey')
    const male = ['dmitriy', 'dmitry', 'mikhail', 'ilya', 'artem', 'gleb', 'sergey'];
    if (male.includes(lower)) return '/models/citizen_male.glb';

    // Девушки ('alina', 'polina', 'sofia', 'sofia_artem', 'ekaterina', 'varvara')
    const female = ['alina', 'polina', 'sofia', 'sofia_artem', 'ekaterina', 'varvara'];
    if (female.includes(lower)) return '/models/citizen_female.glb';

    return '/models/citizen_male.glb';
}

export function retargetMixamoClip(clip, hasMixamoPrefix = false) {
    const cloned = clip.clone();
    const filteredTracks = [];

    for (const track of cloned.tracks) {
        // Отбрасываем .scale и .position треки: при ретаргетинге они разрушают скелет
        // и растягивают вершины меша в гигантские шипы («монстры» в небо).
        if (!track.name.endsWith('.quaternion')) continue;

        const clonedTrack = track.clone();
        if (!hasMixamoPrefix) {
            // Приводим имена треков к чистому названию кости (Hips, Spine, LeftUpLeg и т.д.)
            clonedTrack.name = clonedTrack.name.replace(/^mixamorig:?/i, '');
        } else {
            if (clonedTrack.name.startsWith('mixamorig:')) {
                clonedTrack.name = clonedTrack.name.replace(/^mixamorig:/, 'mixamorig');
            }
        }
        filteredTracks.push(clonedTrack);
    }

    cloned.tracks = filteredTracks;
    return cloned;
}

let mixamoAnimationsCache = null;
let mixamoAnimationsPromise = null;

export function getMixamoAnimationClips() {
    if (mixamoAnimationsCache) return Promise.resolve(mixamoAnimationsCache);
    if (mixamoAnimationsPromise) return mixamoAnimationsPromise;

    mixamoAnimationsPromise = loadGltfModelCached('/models/soldier.glb').then(gltf => {
        const rawClips = gltf.animations || [];
        const result = {};

        rawClips.forEach(clip => {
            const retargeted = retargetMixamoClip(clip, false);
            const lower = clip.name.toLowerCase();
            result[lower] = retargeted;
            result[clip.name] = retargeted;
        });

        // Set up aliases for dialogue / greeting states
        if (result['idle'] && !result['agree']) {
            const agreeClip = result['idle'].clone();
            agreeClip.name = 'agree';
            result['agree'] = agreeClip;
        }

        mixamoAnimationsCache = result;
        return mixamoAnimationsCache;
    }).catch(err => {
        console.warn('[GLTF] Failed to load soldier.glb for shared animations:', err);
        return {};
    });

    return mixamoAnimationsPromise;
}

function scaleModelToIsometricHeight(model, targetHeight = 2.4) {
    let minY = Infinity, maxY = -Infinity;
    model.traverse(o => {
        if (o.isMesh && o.geometry) {
            if (!o.geometry.boundingBox) {
                o.geometry.computeBoundingBox();
            }
            const bb = o.geometry.boundingBox;
            if (bb && isFinite(bb.min.y) && isFinite(bb.max.y)) {
                if (bb.min.y < minY) minY = bb.min.y;
                if (bb.max.y > maxY) maxY = bb.max.y;
            }
        }
    });

    const naturalHeight = (maxY > minY && (maxY - minY) > 0.3) ? (maxY - minY) : 1.8;
    const s = targetHeight / naturalHeight;
    model.scale.set(s, s, s);
}

/**
 * Применяет цветовую вариативность к клонированным материалам персонажей.
 */
function applyCharacterMaterialTint(mat, charId, config = {}) {
    const id = String(charId || '').toLowerCase();

    // Если у материала есть диффузная текстура (Michelle и ReadyPlayerMe) — сохраняем её!
    if (mat.map) {
        mat.color.set(0xffffff);
        return;
    }

    // 1. Настя: мягкие розово-теплые тона
    if (id === 'nastya') {
        if (mat.name?.includes('HighLimbs') || mat.name?.includes('Body') || mat.name === 'Mesh.001') {
            mat.color.set('#f472b6');
        } else if (mat.name?.includes('Joints') || mat.name === 'Mesh') {
            mat.color.set('#fda4af');
        }
        return;
    }

    // 2. Макс: стильный графитово-синий
    if (id === 'max') {
        if (mat.name?.includes('Body') || mat.name === 'Mesh.001') {
            mat.color.set('#1e293b');
        }
        return;
    }

    // 3. Лера: оригинальные цвета
    if (id === 'lera') {
        return;
    }

    // 4. Горожане Петроградки: вариативность цветов одежды по конфигурации
    const jacketColor = config.model3d?.jacketColor;
    const pantsColor = config.model3d?.pantsColor;

    if (jacketColor) {
        const tint = new THREE.Color(jacketColor);
        if (mat.name?.includes('Body') || mat.name?.includes('HighLimbs') || mat.name === 'Mesh.001') {
            mat.color.lerp(tint, 0.7);
        }
    }

    if (pantsColor) {
        const tint = new THREE.Color(pantsColor);
        if (mat.name?.includes('Joints') || mat.name === 'Mesh') {
            mat.color.lerp(tint, 0.6);
        }
    }
}

/**
 * Находит подходящий AnimationAction для стейт-машины персонажа
 */
function findActionForState(actions, state) {
    if (!actions) return null;

    if (state === AGENT_STATE.GREETING) {
        return actions['agree'] || actions['talk'] || actions['wave'] || actions['idle'] || null;
    }
    if (state === AGENT_STATE.WALKING) {
        return actions['walk'] || actions['run'] || null;
    }
    return actions['idle'] || Object.values(actions)[0] || null;
}

/**
 * Плавный кроссфейд между анимациями персонажа (0.3s) и синхронизация темпа шага
 */
export function updateCharacterAnimationState(group, targetState, speed = 1.2, fadeDuration = 0.3) {
    const animState = group?.userData?.animState;
    if (!animState || !animState.actions) return;

    const nextAction = findActionForState(animState.actions, targetState);
    if (!nextAction) return;

    // Синхронизируем частоту шагов с фактической скоростью передвижения
    if (targetState === AGENT_STATE.WALKING) {
        const strideScale = Math.max(0.65, Math.min(1.8, (speed || 1.2) * 0.95));
        if (animState.actions.walk) animState.actions.walk.timeScale = strideScale;
        if (animState.actions.run) animState.actions.run.timeScale = strideScale;
    } else {
        if (animState.actions.walk) animState.actions.walk.timeScale = 1.0;
        if (animState.actions.idle) animState.actions.idle.timeScale = 0.9;
        if (animState.actions.agree) animState.actions.agree.timeScale = 1.0;
    }

    if (animState.currentState !== targetState || animState.currentAction !== nextAction) {
        if (animState.currentAction && animState.currentAction !== nextAction) {
            nextAction.reset();
            nextAction.enabled = true;
            nextAction.play();
            animState.currentAction.crossFadeTo(nextAction, fadeDuration, true);
        } else {
            nextAction.play();
        }
        animState.currentAction = nextAction;
        animState.currentState = targetState;
    }
}

/**
 * Клонирует SkinnedMesh через SkeletonUtils и привязывает его к группе персонажа с ретаргетингом анимаций
 */
export function attachGltfToCharacter(group, charId, config, cachedGltf) {
    if (!group || !cachedGltf?.scene) return;
    if (group.getObjectByName('gltf_model')) return;

    // Клонируем сцену через SkeletonUtils для корректного инстансирования костей
    const clonedScene = SkeletonUtils.clone(cachedGltf.scene);

    // Кэшируем кости гуманоидного скелета и сохраняем нативные rest-кватернионы
    // Важно: нормализуем имена костей, убирая префикс mixamorig:
    // чтобы Three.js PropertyBinding безошибочно сопоставлял треки анимаций (Hips, Spine и т.д.)
    const humanBones = {};
    clonedScene.traverse(o => {
        if (o.isBone && o.name) {
            o.userData.restQuaternion = o.quaternion.clone();
            const clean = o.name.replace(/^mixamorig:?/i, '');
            o.name = clean;
            humanBones[clean] = o;
        }
    });
    group.userData.humanBones = humanBones;

    scaleModelToIsometricHeight(clonedScene, 2.8);
    clonedScene.position.y = 0.02;
    clonedScene.name = 'gltf_model';

    // Клонируем материалы и применяем цветовую вариативность
    clonedScene.traverse(o => {
        if (o.isMesh) {
            o.frustumCulled = false;
            if (o.material) {
                if (Array.isArray(o.material)) {
                    o.material = o.material.map(m => m.clone());
                } else {
                    o.material = o.material.clone();
                }
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(mat => {
                    mat.side = THREE.DoubleSide;
                    applyCharacterMaterialTint(mat, charId, config);
                });
            }
        }
    });

    group.add(clonedScene);
    group.scale.set(1.0, 1.0, 1.0);

    // Инициализируем AnimationMixer на клонированной сцене
    const mixer = new THREE.AnimationMixer(clonedScene);
    group.userData.mixer = mixer;

    // Скрываем процедурные меши biped rig, сохраняя тень и пламбоб (для Леры)
    if (group.joints) {
        const j = group.joints;
        if (j.pelvis) {
            j.pelvis.visible = false;
        }
        if (charId === 'lera' && j.plumbobGroup) {
            j.plumbobGroup.visible = true;
            group.add(j.plumbobGroup);
            j.plumbobGroup.position.set(0, 3.1, 0);
        }
    }

    // SkinnedMesh bones are driven dynamically with authentic kinematics in updateGtaCharacterAnimation
}

/**
 * Creates the MapLibre GL CustomLayerInterface for 3D pedestrian rendering.
 *
 * @param {Object} options - callbacks and configuration
 * @returns {Object} MapLibre CustomLayer object
 */
export function createPedestrianCustomLayer(options = {}) {
    let map = null;
    let gl = null;
    let scene = null;
    let camera = null;
    let renderer = null;

    let transformMatrix = null;
    let modelOrigin = null;
    let modelScale = null;

    const characterMeshes = new Map(); // id -> THREE.Group
    const storefrontMeshes = new Map(); // id -> THREE.Group
    let cityEnvController = null;
    let activeGreetings = [];
    let sunData = null;

    const layer = {
        id: '3d-pedestrians',
        type: 'custom',
        renderingMode: '3d',
        _characterMeshes: characterMeshes,

        onAdd(mapInstance, glContext) {
            map = mapInstance;
            gl = glContext;

            // Setup local coordinate anchor
            const transform = getMercatorTransformMatrix(PETROGRADKA_CENTER);
            transformMatrix = transform.matrix;
            modelOrigin = transform.modelOrigin;
            modelScale = transform.modelScale;

            // Initialize Three.js Scene & Camera
            scene = new THREE.Scene();
            camera = new THREE.Camera();
            camera.matrixAutoUpdate = false;
            layer._scene = scene;
            layer._characterMeshes = characterMeshes;
            layer._camera = camera;

            // Setup Lighting matching astronomical SPb ambiance
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
            scene.add(ambientLight);

            const sunLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
            sunLight.position.set(50, 100, 50);
            sunLight.name = 'sunLight';
            scene.add(sunLight);

            const skyBounce = new THREE.HemisphereLight(0xb4c6e7, 0x334155, 0.4);
            scene.add(skyBounce);

            // Initialize WebGL Renderer sharing MapLibre GL canvas & depth buffer
            if (!gl && map && typeof map.getCanvas === 'function') {
                const cvs = map.getCanvas();
                gl = cvs?.getContext('webgl2') || cvs?.getContext('webgl');
            }

            if (gl && typeof gl.getContextAttributes === 'function') {
                try {
                    renderer = new THREE.WebGLRenderer({
                        canvas: map?.getCanvas ? map.getCanvas() : undefined,
                        context: gl,
                        antialias: true
                    });
                    renderer.autoClear = false;
                } catch (e) {
                    renderer = null;
                }
            }

            // Instantiate all 10 GTA citizen meshes
            PETROGRADKA_PEDESTRIANS.forEach(ped => {
                const mesh = createGtaCharacterMesh(ped);
                mesh.userData.currentCoords = ped.waypoints?.[0] || PETROGRADKA_CENTER;
                characterMeshes.set(ped.id, mesh);
                scene.add(mesh);
            });

            // Instantiate Lera's 3D mesh with Plumbob
            const leraMesh = createGtaCharacterMesh(LERA_3D_CONFIG);
            leraMesh.userData.currentCoords = PETROGRADKA_CENTER;
            characterMeshes.set('lera', leraMesh);
            scene.add(leraMesh);

            // Instantiate 3D Physical Storefronts
            PHYSICAL_STOREFRONTS.forEach(sf => {
                const sfGroup = createPhysicalStorefrontMesh(sf);
                const local = gpsToLocalMeters(sf.coords, modelOrigin, modelScale);
                sfGroup.position.set(local.x, 0.05, local.z);
                storefrontMeshes.set(sf.id, sfGroup);
                scene.add(sfGroup);
            });

            // Instantiate City Environment: Trees, Street Lamps, and Moving Traffic
            try {
                cityEnvController = new CityEnvironmentController(scene, gpsToLocalMeters, modelOrigin, modelScale);
            } catch (envErr) {
                console.warn('Failed to initialize CityEnvironmentController:', envErr);
            }

            // Load real 3D GLTF/GLB models for Lera and citizens with caching
            if (typeof window !== 'undefined') {
                try {
                    // Preload shared Mixamo animation library
                    getMixamoAnimationClips();

                    // 1. Load Lera's 3D model (models/lera.glb)
                    loadGltfModelCached(getModelPathForCharacter('lera')).then((gltf) => {
                        const leraGroup = characterMeshes.get('lera');
                        if (leraGroup) {
                            attachGltfToCharacter(leraGroup, 'lera', LERA_3D_CONFIG, gltf);
                        }
                    }).catch((err) => {
                        console.warn('[GLTF] Failed to load lera.glb, using low-poly fallback:', err);
                    });

                    // 2. Load Citizen 3D models for all pedestrians with caching
                    PETROGRADKA_PEDESTRIANS.forEach(ped => {
                        const modelPath = getModelPathForCharacter(ped.id);
                        loadGltfModelCached(modelPath).then((gltf) => {
                            const group = characterMeshes.get(ped.id);
                            if (group) {
                                attachGltfToCharacter(group, ped.id, ped, gltf);
                            }
                        }).catch((err) => {
                            console.warn(`[GLTF] Failed to load ${modelPath} for ${ped.id}:`, err);
                        });
                    });
                } catch (e) {
                    console.warn('[GLTF] Loader init notice:', e);
                }
            }
        },

        render(glContext, matrix) {
            if (!glContext || !scene || !camera || !transformMatrix) return;

            // MapLibre 6+ passes an object with defaultProjectionData.mainMatrix
            const rawMatrix = (matrix && matrix.defaultProjectionData?.mainMatrix)
                || (matrix && matrix.mainMatrix)
                || (Array.isArray(matrix) || (matrix && matrix.BYTES_PER_ELEMENT) ? matrix : null);

            if (!rawMatrix) {
                return;
            }

            if (!renderer) {
                try {
                    renderer = new THREE.WebGLRenderer({
                        canvas: map?.getCanvas ? map.getCanvas() : undefined,
                        context: glContext,
                        antialias: true
                    });
                    renderer.autoClear = false;
                } catch (e) {
                    return;
                }
            }

            const cvs = map?.getCanvas ? map.getCanvas() : null;
            if (cvs && renderer) {
                renderer.setSize(cvs.width, cvs.height, false);
                renderer.setViewport(0, 0, cvs.width, cvs.height);
            }

            // Multiply MapLibre projection matrix by local Mercator transform
            const projMat = new THREE.Matrix4().fromArray(rawMatrix);
            camera.projectionMatrix = projMat.multiply(transformMatrix);
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

            // Disable frustum culling on all scene meshes to prevent MapLibre Mercator clipping
            scene.traverse(o => {
                if (o.isMesh) {
                    o.frustumCulled = false;
                }
            });

            // Ensure WebGL depth testing and disable back-face culling for Three.js overlay
            if (glContext.disable) glContext.disable(glContext.CULL_FACE);
            if (glContext.enable) glContext.enable(glContext.DEPTH_TEST);
            if (glContext.depthFunc) glContext.depthFunc(glContext.LEQUAL);

            // Reset Three.js WebGL state and render shared depth buffer
            renderer.resetState();
            renderer.render(scene, camera);

            layer._renderCalls = (layer._renderCalls || 0) + 1;
            layer._lastRenderInfo = {
                calls: renderer.info.render.calls,
                triangles: renderer.info.render.triangles
            };

            if (map) {
                map.triggerRepaint();
            }
        },

        onRemove() {
            if (cityEnvController) {
                cityEnvController.dispose();
                cityEnvController = null;
            }
            if (renderer) {
                renderer.dispose();
            }
            characterMeshes.clear();
            storefrontMeshes.clear();
        },

        // --- Custom Layer Public API ---

        /**
         * Updates all character 3D positions, kinematics, and orientation.
         */
        updateCharacters(pedestrianStates, leraState, currentSunData, greetings = [], nowMs = Date.now()) {
            if (!modelOrigin || !modelScale) return;
            sunData = currentSunData;
            activeGreetings = greetings;

            // Trigger social interaction dialogue bubbles callback
            if (options.onSocialInteraction && greetings && greetings.length > 0) {
                greetings.forEach(g => {
                    options.onSocialInteraction(g.idA, g.idB, g);
                });
            }

            // Update City Environment (Trees wind sway, Street lamps glow, Vehicle traffic & headlights)
            if (cityEnvController) {
                cityEnvController.update(33, currentSunData, nowMs);
            }

            // Update Directional Sun Light
            if (scene && currentSunData) {
                const sunLight = scene.getObjectByName('sunLight');
                if (sunLight && currentSunData.sunVector) {
                    sunLight.position.set(
                        currentSunData.sunVector[0] * 100,
                        currentSunData.sunVector[2] * 100,
                        currentSunData.sunVector[1] * 100
                    );
                    sunLight.intensity = Math.max(0.1, currentSunData.intensity || 1.0);
                }
            }

            // Update physical storefront lighting (day/night glow)
            const isNightOrDusk = currentSunData ? (currentSunData.elevation < 8 || currentSunData.isNight) : false;
            storefrontMeshes.forEach(sfGroup => {
                const light = sfGroup.getObjectByName('storefrontLight');
                const spec = sfGroup.userData?.spec;
                if (light && spec) {
                    light.intensity = isNightOrDusk ? spec.nightIntensity : 0.15;
                }
            });

            // 1. Update Citizens
            pedestrianStates.forEach(pos => {
                let mesh = characterMeshes.get(pos.id);
                if (!mesh) {
                    mesh = createGtaCharacterMesh(pos);
                    mesh.userData.currentCoords = pos.coords;
                    characterMeshes.set(pos.id, mesh);
                    scene.add(mesh);
                    if (typeof window !== 'undefined') {
                        const mPath = getModelPathForCharacter(pos.id);
                        loadGltfModelCached(mPath).then(gltf => {
                            attachGltfToCharacter(mesh, pos.id, pos, gltf);
                        }).catch(e => console.warn(e));
                    }
                }

                mesh.userData.currentCoords = pos.coords;

                const local = gpsToLocalMeters(pos.coords, modelOrigin, modelScale);
                mesh.position.set(local.x, 0.05, local.z);

                const greetInfo = activeGreetings.find(g => (g.idA === pos.id || g.idB === pos.id) && g.expiresAt > nowMs);
                const isGreeting = Boolean(greetInfo);
                const greetBearing = greetInfo ? (greetInfo.idA === pos.id ? greetInfo.bearingA : greetInfo.bearingB) : undefined;

                // State machine: greeting -> talk/agree/wave, moving -> walk, paused -> idle
                const targetAnimState = isGreeting || pos.state === AGENT_STATE.GREETING
                    ? AGENT_STATE.GREETING
                    : (pos.speed > 0.05 ? AGENT_STATE.WALKING : AGENT_STATE.IDLE_STOP);

                updateCharacterAnimationState(mesh, targetAnimState, pos.speed, 0.25);

                updateGtaCharacterAnimation(
                    mesh,
                    isGreeting ? AGENT_STATE.GREETING : pos.state,
                    pos.speed,
                    pos.gaitPhase,
                    greetBearing !== undefined ? greetBearing : pos.bearing,
                    nowMs,
                    isGreeting,
                    sunData
                );
            });

            // 2. Update Lera
            if (leraState && leraState.coords) {
                const leraMesh = characterMeshes.get('lera');
                if (leraMesh) {
                    leraMesh.userData.currentCoords = leraState.coords;

                    const local = gpsToLocalMeters(leraState.coords, modelOrigin, modelScale);
                    leraMesh.position.set(local.x, 0.05, local.z);

                    const greetInfo = activeGreetings.find(g => (g.idA === 'lera' || g.idB === 'lera') && g.expiresAt > nowMs);
                    const isGreeting = Boolean(greetInfo);
                    const greetBearing = greetInfo ? (greetInfo.idA === 'lera' ? greetInfo.bearingA : greetInfo.bearingB) : undefined;
                    const leraBearing = greetBearing !== undefined ? greetBearing : (leraState.bearing !== undefined ? leraState.bearing : 180);
                    const leraSpeed = leraState.inTransit ? 1.4 : 0;
                    const leraPhase = leraSpeed > 0 ? (nowMs / 300) : 0;

                    const leraTargetAnim = isGreeting
                        ? AGENT_STATE.GREETING
                        : (leraSpeed > 0.05 ? AGENT_STATE.WALKING : AGENT_STATE.IDLE_STOP);

                    updateCharacterAnimationState(leraMesh, leraTargetAnim, leraSpeed, 0.25);

                    updateGtaCharacterAnimation(
                        leraMesh,
                        isGreeting ? AGENT_STATE.GREETING : (leraSpeed > 0 ? AGENT_STATE.WALKING : AGENT_STATE.IDLE_STOP),
                        leraSpeed,
                        leraPhase,
                        leraBearing,
                        nowMs,
                        isGreeting,
                        sunData
                    );
                }
            }

            // 3. Advance Skeletal Animations for GLTF Models (with accurate deltaSec)
            let deltaSec = 0.033;
            if (layer._lastAnimTimeMs && nowMs > layer._lastAnimTimeMs) {
                deltaSec = Math.min(0.1, Math.max(0.001, (nowMs - layer._lastAnimTimeMs) / 1000));
            }
            layer._lastAnimTimeMs = nowMs;

            characterMeshes.forEach(mesh => {
                const mixer = mesh.userData.animState?.mixer || mesh.userData.mixer;
                if (mixer) {
                    mixer.update(deltaSec);
                }
            });
        },

        /**
         * Returns screen coordinates of character heads for projecting Linear UI speech bubbles.
         */
        getCharacterScreenPositions(pedestrianStates, leraState) {
            if (!map) return [];

            const positions = [];

            (pedestrianStates || []).forEach(ped => {
                const screenPoint = map.project(ped.coords);
                positions.push({
                    id: ped.id,
                    name: ped.name,
                    x: screenPoint.x,
                    y: screenPoint.y - 48, // projected above head
                    state: ped.state,
                    thought: ped.thought,
                    coords: ped.coords
                });
            });

            if (leraState && leraState.coords) {
                const screenPoint = map.project(leraState.coords);
                positions.push({
                    id: 'lera',
                    name: 'Лера',
                    x: screenPoint.x,
                    y: screenPoint.y - 56, // above Plumbob
                    state: leraState.inTransit ? AGENT_STATE.WALKING : AGENT_STATE.IDLE_STOP,
                    thought: '✨',
                    coords: leraState.coords
                });
            }

            return positions;
        },

        /**
         * Raycasts mouse click point against dynamic 3D character hitboxes.
         */
        raycastCharacter(point, hitRadiusPx = 28) {
            if (!map) return null;

            // Screen-space proximity detection to projected current character coordinates
            let bestChar = null;
            let bestDist = hitRadiusPx;

            characterMeshes.forEach((mesh, id) => {
                const coords = mesh.userData.currentCoords || mesh.userData.config?.waypoints?.[0] || PETROGRADKA_CENTER;
                const pos = gpsToLocalMeters(coords, modelOrigin, modelScale);
                // check distance to projected screen point
                const screen = map.project(coords);
                const dist = Math.hypot(screen.x - point.x, (screen.y - 25) - point.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestChar = id;
                }
            });

            return bestChar;
        },

        getMesh(id) {
            return characterMeshes.get(id);
        },

        getStorefrontMesh(id) {
            return storefrontMeshes.get(id);
        },

        getStorefronts() {
            return Array.from(storefrontMeshes.values());
        },

        getCityEnvironment() {
            return cityEnvController;
        }
    };

    return layer;
}

export default createPedestrianCustomLayer;
