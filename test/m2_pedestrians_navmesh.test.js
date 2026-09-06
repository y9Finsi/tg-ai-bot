import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    PETROGRADKA_PEDESTRIANS,
    PETROGRADKA_BUILDING_POLYGONS,
    SOCIAL_HUBS,
    SIDEWALK_NAVMESH_GRAPH,
    AGENT_STATE,
    DIURNAL_PERIODS,
    PROXIMITY_THRESHOLD_METERS,
    GREETING_COOLDOWN_MS,
    SOCIAL_DIALOGUES,
    LERA_3D_CONFIG,
    calculateDistanceMeters,
    calculateBearing,
    computeAABB,
    checkAABBOverlap,
    isPointInPolygon,
    segmentIntersectsSegment,
    segmentIntersectsPolygon,
    distancePointToSegment,
    distanceSegmentToPolygon,
    verifyCollisionTier1,
    verifyCollisionTier2,
    verifyCollisionTier3,
    verifyCollisionTier4,
    verifySegmentCollision,
    verifyRouteAgainstBuildings,
    auditNavMeshCollisions,
    getDiurnalPeriod,
    getDialogueKey,
    interpolatePedestrianPosition,
    checkSocialProximity,
    findNavMeshPath,
    createLeraTransit,
    interpolateTransitPosition
} from '../admin-linear/src/lib/pedestrianData.js';
import {
    PETROGRADKA_CENTER,
    PHYSICAL_STOREFRONTS,
    createGtaCharacterMesh,
    createPhysicalStorefrontMesh,
    updateGtaCharacterAnimation,
    createPedestrianCustomLayer,
    gpsToLocalMeters,
    getMercatorTransformMatrix,
    getModelPathForCharacter,
    modelCache
} from '../admin-linear/src/lib/threePedestrianLayer.js';

describe('Milestone M2: GTA 3D Characters, Zero-Collision NavMesh & Social AI', () => {

    // ========================================================================
    // 1. ZERO-COLLISION NAVMESH & GEOMETRY VERIFICATION
    // ========================================================================
    describe('1. Zero-Collision Sidewalk NavMesh Graph', () => {
        it('T1.1: NavMesh graph has 0 node collisions and 0 edge collisions against all building footprints', () => {
            const audit = auditNavMeshCollisions(SIDEWALK_NAVMESH_GRAPH, PETROGRADKA_BUILDING_POLYGONS);
            assert.equal(audit.ok, true, 'NavMesh graph audit must pass');
            assert.equal(audit.nodeCollisions, 0, 'No NavMesh nodes may intersect buildings');
            assert.equal(audit.edgeCollisions, 0, 'No NavMesh edges may pierce buildings');
        });

        it('T1.2: All 10 citizens achieve 0 building collisions across all 4 tiers (with 0.8m clearance buffer)', () => {
            assert.equal(PETROGRADKA_PEDESTRIANS.length, 10, 'Must have exactly 10 citizens');

            for (const citizen of PETROGRADKA_PEDESTRIANS) {
                const res = verifyRouteAgainstBuildings(citizen.waypoints, PETROGRADKA_BUILDING_POLYGONS, { clearanceMeters: 0.8 });
                assert.equal(res.ok, true, `Citizen ${citizen.id} (${citizen.name}) route failed collision check`);
                assert.equal(res.collisions, 0, `Citizen ${citizen.id} had ${res.collisions} collisions: ${JSON.stringify(res.details)}`);
            }
        });

        it('T1.3: Snapped social hub coordinates are within 15 meters of specified hub coordinates', () => {
            for (const [key, hub] of Object.entries(SOCIAL_HUBS)) {
                const dist = calculateDistanceMeters(hub.coords, hub.snappedCoords);
                assert.ok(
                    dist <= 15.0,
                    `Hub ${key} snapped coords ${JSON.stringify(hub.snappedCoords)} are ${dist.toFixed(2)}m from target (must be <= 15m)`
                );
            }
        });
    });

    // ========================================================================
    // 2. 4-TIER COLLISION VERIFICATION ENGINE
    // ========================================================================
    describe('2. 4-Tier Collision Verification Algorithm', () => {
        const samplePoly = [
            [30.3100, 59.9600],
            [30.3110, 59.9600],
            [30.3110, 59.9610],
            [30.3100, 59.9610]
        ];

        it('T2.1: Tier 1 - AABB pre-filter correctly identifies disjoint and overlapping boxes', () => {
            const polyAABB = computeAABB(samplePoly);
            assert.equal(polyAABB[0], 30.3100);
            assert.equal(polyAABB[1], 59.9600);
            assert.equal(polyAABB[2], 30.3110);
            assert.equal(polyAABB[3], 59.9610);

            // Completely outside segment
            const outsideSegAABB = computeAABB([[30.3200, 59.9700], [30.3210, 59.9710]]);
            assert.equal(checkAABBOverlap(outsideSegAABB, polyAABB), false);
            assert.equal(verifyCollisionTier1(outsideSegAABB, polyAABB), false);

            // Overlapping segment
            const insideSegAABB = computeAABB([[30.3105, 59.9605], [30.3108, 59.9608]]);
            assert.equal(checkAABBOverlap(insideSegAABB, polyAABB), true);
            assert.equal(verifyCollisionTier1(insideSegAABB, polyAABB), true);
        });

        it('T2.2: Tier 2 - Jordan Point-in-Polygon ray casting detects interior vs exterior points', () => {
            const insidePoint = [30.3105, 59.9605];
            const outsidePoint = [30.3120, 59.9605];

            assert.equal(isPointInPolygon(insidePoint, samplePoly), true, 'Inside point should be detected');
            assert.equal(isPointInPolygon(outsidePoint, samplePoly), false, 'Outside point should not be detected');

            assert.equal(verifyCollisionTier2([insidePoint], samplePoly), false, 'Tier 2 should fail if point inside');
            assert.equal(verifyCollisionTier2([outsidePoint], samplePoly), true, 'Tier 2 should pass if points outside');
        });

        it('T2.3: Tier 3 - 2D line segment-polygon intersection detects edge piercing', () => {
            const p1Crossing = [30.3090, 59.9605];
            const p2Crossing = [30.3120, 59.9605];
            assert.equal(segmentIntersectsPolygon(p1Crossing, p2Crossing, samplePoly), true);
            assert.equal(verifyCollisionTier3(p1Crossing, p2Crossing, samplePoly), false);

            const p1Clean = [30.3080, 59.9605];
            const p2Clean = [30.3090, 59.9605];
            assert.equal(segmentIntersectsPolygon(p1Clean, p2Clean, samplePoly), false);
            assert.equal(verifyCollisionTier3(p1Clean, p2Clean, samplePoly), true);
        });

        it('T2.4: Tier 4 - Clearance buffer calculates metric distance to polygon boundary', () => {
            const p1 = [30.3090, 59.9600];
            const p2 = [30.3090, 59.9610];
            const dist = distanceSegmentToPolygon(p1, p2, samplePoly);
            assert.ok(dist > 50, `Distance should be ~55 meters, got ${dist}`);

            // Passes clearance test
            assert.equal(verifyCollisionTier4(p1, p2, samplePoly, 0.8), true);

            // Point right next to boundary (<0.5m)
            const nearPt = [30.309999, 59.9605];
            const nearDist = distancePointToSegment(nearPt, samplePoly[0], samplePoly[3]);
            assert.ok(nearDist < 0.5, `Near point distance should be <0.5m, got ${nearDist}`);
        });
    });

    // ========================================================================
    // 3. LOW-POLY GTA 3D CHARACTER RIG & SIMS PLUMBOB
    // ========================================================================
    describe('3. GTA 3D Character Rigging & Sims Plumbob', () => {
        it('T3.1: createGtaCharacterMesh builds 12-joint hierarchical biped rig with ground shadow', () => {
            const citizen = PETROGRADKA_PEDESTRIANS[0];
            const mesh = createGtaCharacterMesh(citizen);

            assert.ok(mesh instanceof THREE.Group, 'Must return a THREE.Group');
            assert.equal(mesh.name, `char_${citizen.id}`);
            assert.ok(mesh.joints, 'Must provide joints reference dictionary');

            const j = mesh.joints;
            assert.ok(j.pelvis instanceof THREE.Group, 'Must have pelvis joint');
            assert.ok(j.torso instanceof THREE.Group, 'Must have torso joint');
            assert.ok(j.head instanceof THREE.Group, 'Must have head joint');
            assert.ok(j.leftShoulder instanceof THREE.Group, 'Must have left shoulder joint');
            assert.ok(j.leftElbow instanceof THREE.Group, 'Must have left elbow joint');
            assert.ok(j.rightShoulder instanceof THREE.Group, 'Must have right shoulder joint');
            assert.ok(j.rightElbow instanceof THREE.Group, 'Must have right elbow joint');
            assert.ok(j.leftHip instanceof THREE.Group, 'Must have left hip joint');
            assert.ok(j.leftKnee instanceof THREE.Group, 'Must have left knee joint');
            assert.ok(j.rightHip instanceof THREE.Group, 'Must have right hip joint');
            assert.ok(j.rightKnee instanceof THREE.Group, 'Must have right knee joint');
            assert.ok(j.shadow instanceof THREE.Mesh, 'Must have ground contact shadow mesh');

            // Citizen must NOT have a plumbob
            assert.equal(j.plumbob, null, 'Citizen should not have a plumbob');
        });

        it('T3.2: Lera mesh has rotating emerald Sims Plumbob octahedron above head', () => {
            const leraMesh = createGtaCharacterMesh(LERA_3D_CONFIG);
            assert.ok(leraMesh.joints.plumbob instanceof THREE.Mesh, 'Lera must have a plumbob mesh');
            assert.ok(leraMesh.joints.plumbobGroup instanceof THREE.Group, 'Lera must have plumbobGroup');

            const plumbobMesh = leraMesh.joints.plumbob;
            assert.ok(plumbobMesh.geometry instanceof THREE.OctahedronGeometry, 'Plumbob must be an octahedron');
            assert.equal(plumbobMesh.material.emissive.getHex(), 0x16a34a, 'Plumbob must have green emerald emissive glow');
        });

        it('T3.3: Plumbob also instantiates when config.isLera = true or config.id = "lera"', () => {
            const customLera = createGtaCharacterMesh({ id: 'lera', isLera: true, model3d: {} });
            assert.ok(customLera.joints.plumbob !== null, 'Must have plumbob when id is lera');
        });

        it('T3.4: Kinematics: Walking, Idle Stop, and Greeting states animate limbs and yaw', () => {
            const citizen = PETROGRADKA_PEDESTRIANS[0];
            const mesh = createGtaCharacterMesh(citizen);

            // 1. Walking state
            updateGtaCharacterAnimation(mesh, AGENT_STATE.WALKING, 1.3, Math.PI / 4, 90, 1000, false);
            assert.ok(Math.abs(mesh.joints.leftHip.rotation.x) > 0.1, 'Left hip should rotate during walk');
            assert.ok(Math.abs(mesh.joints.rightHip.rotation.x) > 0.1, 'Right hip should rotate during walk');
            assert.ok(Math.abs(mesh.joints.leftShoulder.rotation.x) > 0.05, 'Left shoulder should swing during walk');
            assert.ok(Math.abs(mesh.joints.pelvis.position.y - 0.85) > 0.01, 'Pelvis should bob vertically during walk');

            // 2. Idle Stop state
            updateGtaCharacterAnimation(mesh, AGENT_STATE.IDLE_STOP, 0, 0, 90, 2000, false);
            assert.equal(mesh.joints.leftHip.rotation.x, 0, 'Left hip must be stationary during idle');
            assert.equal(mesh.joints.rightHip.rotation.x, 0, 'Right hip must be stationary during idle');

            // 3. Greeting state: right arm raised and waving
            updateGtaCharacterAnimation(mesh, AGENT_STATE.GREETING, 0.1, 0, 180, 3000, true);
            assert.ok(mesh.joints.rightShoulder.rotation.x < -1.5, 'Right shoulder should be raised high for wave gesture');
            assert.ok(Math.abs(mesh.joints.head.rotation.z) > 0.05, 'Head should tilt friendly during greeting');
        });
    });

    // ========================================================================
    // 4. DIURNAL SCHEDULES & AGENT MULTI-STATE SIMULATION
    // ========================================================================
    describe('4. Diurnal Routine Schedules & Interpolation', () => {
        it('T4.1: getDiurnalPeriod accurately segments 24h cycle into 4 periods', () => {
            assert.equal(getDiurnalPeriod(8.5), DIURNAL_PERIODS.MORNING);
            assert.equal(getDiurnalPeriod(14.0), DIURNAL_PERIODS.AFTERNOON);
            assert.equal(getDiurnalPeriod(19.5), DIURNAL_PERIODS.EVENING);
            assert.equal(getDiurnalPeriod(23.5), DIURNAL_PERIODS.NIGHT);
            assert.equal(getDiurnalPeriod(4.0), DIURNAL_PERIODS.NIGHT);
        });

        it('T4.2: interpolatePedestrianPosition modulates speed, thoughts, and actions by simHour', () => {
            const alina = PETROGRADKA_PEDESTRIANS.find(p => p.id === 'alina');
            assert.ok(alina, 'Must find Alina');

            // Morning evaluation
            const posMorning = interpolatePedestrianPosition(alina, 5000, { simHour: 9.0 });
            assert.equal(posMorning.diurnalPeriod, DIURNAL_PERIODS.MORNING);
            assert.equal(posMorning.action, 'Спешит в СПбГИК на пары');
            assert.ok(posMorning.speed > alina.speed, 'Morning speed should be boosted');

            // Evening evaluation
            const posEvening = interpolatePedestrianPosition(alina, 5000, { simHour: 19.0 });
            assert.equal(posEvening.diurnalPeriod, DIURNAL_PERIODS.EVENING);
            assert.equal(posEvening.action, 'Гуляет у Австрийской площади');
        });

        it('T4.3: Agent state machine transitions between WALKING and IDLE_STOP pauses', () => {
            const dmitry = PETROGRADKA_PEDESTRIANS.find(p => p.id === 'dmitry');
            const posWalk = interpolatePedestrianPosition(dmitry, 10000);
            assert.equal(posWalk.state, AGENT_STATE.WALKING);

            // During pause window in cycle (e.g. at 42 seconds of 45-second cycle)
            const posIdle = interpolatePedestrianPosition(dmitry, 42000 - dmitry.timeOffsetMs);
            assert.equal(posIdle.state, AGENT_STATE.IDLE_STOP);
            assert.equal(posIdle.speed, 0);
        });
    });

    // ========================================================================
    // 5. SOCIAL AI & PROXIMITY DETECTION
    // ========================================================================
    describe('5. Social AI Proximity & Dialogue System', () => {
        it('T5.1: checkSocialProximity detects agents within 15 meters and triggers dialogues', () => {
            const alinaState = {
                id: 'alina',
                coords: [30.31077, 59.96019] // Austrian Square
            };
            const varvaraState = {
                id: 'varvara',
                coords: [30.31078, 59.96020] // ~1.5 meters away
            };

            const cooldowns = new Map();
            const greetings = checkSocialProximity([alinaState, varvaraState], null, cooldowns, 10000);

            assert.equal(greetings.length, 1, 'Should trigger exactly 1 greeting');
            assert.equal(greetings[0].idA, 'alina');
            assert.equal(greetings[0].idB, 'varvara');
            assert.equal(greetings[0].dialogueA, 'Варя, какие нежные тюльпаны!');
            assert.equal(greetings[0].dialogueB, 'Спасибо, Алина, это сорт из Голландии 🌷');
            assert.ok(greetings[0].distanceMeters <= 15.0);
        });

        it('T5.2: checkSocialProximity respects 30-second cooldown per agent pair', () => {
            const alinaState = { id: 'alina', coords: [30.31077, 59.96019] };
            const varvaraState = { id: 'varvara', coords: [30.31078, 59.96020] };

            const cooldowns = new Map();
            const g1 = checkSocialProximity([alinaState, varvaraState], null, cooldowns, 10000);
            assert.equal(g1.length, 1);

            // Immediate second check within cooldown window
            const g2 = checkSocialProximity([alinaState, varvaraState], null, cooldowns, 15000);
            assert.equal(g2.length, 0, 'Must not fire dialogue within cooldown');

            // Check after cooldown expiry (35 seconds later)
            const g3 = checkSocialProximity([alinaState, varvaraState], null, cooldowns, 10000 + GREETING_COOLDOWN_MS + 1000);
            assert.equal(g3.length, 1, 'Must fire dialogue after cooldown expires');
        });

        it('T5.3: Lera interacts with citizens when in proximity', () => {
            const dmitryState = { id: 'dmitry', coords: [30.312186, 59.961159] };
            const leraState = { coords: [30.312190, 59.961162] };

            const cooldowns = new Map();
            const greetings = checkSocialProximity([dmitryState], leraState, cooldowns, 20000);
            assert.equal(greetings.length, 1);
            assert.ok(greetings[0].dialogueA.includes('миндальные круассаны') || greetings[0].dialogueB.includes('миндальные круассаны'));
        });
    });

    // ========================================================================
    // 6. PHYSICAL 3D STOREFRONTS & NIGHT GLOW
    // ========================================================================
    describe('6. Physical 3D Storefronts & Night Glow', () => {
        it('T6.1: PHYSICAL_STOREFRONTS defines «Слой», «ВкусВилл», and Showroom', () => {
            assert.equal(PHYSICAL_STOREFRONTS.length, 3);
            const ids = PHYSICAL_STOREFRONTS.map(s => s.id);
            assert.ok(ids.includes('storefront_sloy'), 'Must have Cafe Sloy');
            assert.ok(ids.includes('storefront_vkusvill'), 'Must have VkusVill');
            assert.ok(ids.includes('storefront_showroom'), 'Must have Showroom');
        });

        it('T6.2: createPhysicalStorefrontMesh creates awning, glass facade, pillars and PointLight', () => {
            const sfSpec = PHYSICAL_STOREFRONTS[0];
            const mesh = createPhysicalStorefrontMesh(sfSpec);

            assert.ok(mesh instanceof THREE.Group);
            assert.equal(mesh.name, sfSpec.id);

            const light = mesh.getObjectByName('storefrontLight');
            assert.ok(light instanceof THREE.PointLight, 'Storefront must have a PointLight');
            assert.equal(light.intensity, sfSpec.nightIntensity);
        });
    });

    // ========================================================================
    // 7. DYNAMIC RAYCASTER HITBOX TRACKING & CUSTOM LAYER
    // ========================================================================
    describe('7. CustomLayer Interface & Dynamic Hitbox Raycaster', () => {
        it('T7.1: createPedestrianCustomLayer exposes custom layer interface with 3D renderingMode', () => {
            const layer = createPedestrianCustomLayer();
            assert.equal(layer.id, '3d-pedestrians');
            assert.equal(layer.type, 'custom');
            assert.equal(layer.renderingMode, '3d');
            assert.equal(typeof layer.onAdd, 'function');
            assert.equal(typeof layer.render, 'function');
            assert.equal(typeof layer.updateCharacters, 'function');
            assert.equal(typeof layer.raycastCharacter, 'function');
        });

        it('T7.2: raycastCharacter tracks dynamic mesh.userData.currentCoords', () => {
            const layer = createPedestrianCustomLayer();
            const mockMap = {
                getCanvas: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
                project: (coords) => ({ x: (coords[0] - 30.308) * 10000 + 500, y: (coords[1] - 59.959) * 10000 + 500 }),
                triggerRepaint: () => {}
            };

            layer.onAdd(mockMap, {});

            const mesh = layer.getMesh('alina');
            assert.ok(mesh, 'Must find Alina mesh');

            // Move Alina to dynamic location
            mesh.userData.currentCoords = [30.31077, 59.96019];

            const screen = mockMap.project([30.31077, 59.96019]);
            const hit = layer.raycastCharacter({ x: screen.x, y: screen.y - 25 }, 30);
            assert.equal(hit, 'alina', 'Raycaster must find character at dynamic currentCoords');
        });

        it('T7.3: updateCharacters triggers onSocialInteraction callback upon greeting', () => {
            let callbackFired = false;
            let pairA = null;
            let pairB = null;

            const layer = createPedestrianCustomLayer({
                onSocialInteraction: (idA, idB, greeting) => {
                    callbackFired = true;
                    pairA = idA;
                    pairB = idB;
                }
            });

            const mockMap = {
                getCanvas: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
                project: (coords) => ({ x: 500, y: 500 }),
                triggerRepaint: () => {}
            };
            layer.onAdd(mockMap, {});

            const mockGreetings = [{
                idA: 'dmitry',
                idB: 'lera',
                dialogueA: 'Привет',
                dialogueB: 'Привет',
                expiresAt: Date.now() + 5000
            }];

            layer.updateCharacters([], null, null, mockGreetings);
            assert.equal(callbackFired, true, 'onSocialInteraction callback must be triggered');
            assert.equal(pairA, 'dmitry');
            assert.equal(pairB, 'lera');
        });
    });

    // ========================================================================
    // 8. 3D GLTF MODEL DISPATCHER & INTEGRITY
    // ========================================================================
    describe('8. 3D GLTF Models & Citizen Demographics Routing', () => {
        it('T8.1: getModelPathForCharacter maps Lera, Nastya, Max, male and female citizens correctly', () => {
            assert.equal(getModelPathForCharacter('lera'), '/models/lera.glb');
            assert.equal(getModelPathForCharacter('nastya'), '/models/nastya.glb');
            assert.equal(getModelPathForCharacter('max'), '/models/max.glb');

            // Males
            ['dmitriy', 'dmitry', 'mikhail', 'ilya', 'artem', 'gleb', 'sergey'].forEach(id => {
                assert.equal(getModelPathForCharacter(id), '/models/citizen_male.glb', `Character ${id} must map to citizen_male.glb`);
            });

            // Females
            ['alina', 'polina', 'sofia', 'ekaterina', 'varvara'].forEach(id => {
                assert.equal(getModelPathForCharacter(id), '/models/citizen_female.glb', `Character ${id} must map to citizen_female.glb`);
            });
        });

        it('T8.2: modelCache is an instantiated Map', () => {
            assert.ok(modelCache instanceof Map, 'modelCache must be a Map');
        });
    });

    // ========================================================================
    // 9. SIDEWALK NAVMESH PATHFINDING & LERA TRANSIT ENGINE
    // ========================================================================
    describe('9. Sidewalk NavMesh Pathfinding & Lera Transit Engine', () => {
        it('T9.1: findNavMeshPath finds collision-free route between Lera home and Cafe Sloy', () => {
            const homeCoords = [30.3049, 59.9589];
            const sloyCoords = [30.312186, 59.961159];

            const path = findNavMeshPath(homeCoords, sloyCoords);
            assert.ok(path.length >= 3, `Expected at least 3 waypoints, got ${path.length}`);
            assert.deepEqual(path[0], homeCoords);
            assert.deepEqual(path[path.length - 1], sloyCoords);

            // Audit route segments against building polygons
            const routeCheck = verifyRouteAgainstBuildings(path, PETROGRADKA_BUILDING_POLYGONS);
            assert.equal(routeCheck.ok, true, `Route from home to Sloy has collisions: ${JSON.stringify(routeCheck.details)}`);
        });

        it('T9.2: createLeraTransit constructs mission with valid distance, segments and duration', () => {
            const transit = createLeraTransit('petrogradka_home', 'cafe_sloy', 20, {
                targetName: 'Кофейня «Слой»',
                targetAction: 'Иду за кофе ☕'
            });

            assert.equal(transit.from, 'petrogradka_home');
            assert.equal(transit.to, 'cafe_sloy');
            assert.equal(transit.targetName, 'Кофейня «Слой»');
            assert.equal(transit.targetAction, 'Иду за кофе ☕');
            assert.ok(transit.totalDistance > 500, `Expected distance > 500m, got ${transit.totalDistance}`);
            assert.ok(transit.segments.length > 0);
            assert.equal(transit.durationSec, 20);
        });

        it('T9.3: interpolateTransitPosition smoothly tracks progress and finishes at target', () => {
            const transit = createLeraTransit('petrogradka_home', 'cafe_sloy', 20);
            const t0 = transit.startTime;

            // Start: progress ~0
            const pStart = interpolateTransitPosition(transit, t0);
            assert.equal(pStart.progress, 0);
            assert.equal(pStart.isFinished, false);
            assert.ok(pStart.speed > 0);

            // Midpoint: progress ~0.5
            const pMid = interpolateTransitPosition(transit, t0 + 10000);
            assert.ok(pMid.progress >= 0.48 && pMid.progress <= 0.52);
            assert.equal(pMid.isFinished, false);
            assert.ok(pMid.speed > 0);
            assert.ok(!Number.isNaN(pMid.coords[0]));
            assert.ok(!Number.isNaN(pMid.coords[1]));

            // Finish: progress 1.0
            const pEnd = interpolateTransitPosition(transit, t0 + 25000);
            assert.equal(pEnd.progress, 1.0);
            assert.equal(pEnd.isFinished, true);
            assert.equal(pEnd.speed, 0);
            assert.deepEqual(pEnd.coords, transit.targetPos);
        });
    });
});

