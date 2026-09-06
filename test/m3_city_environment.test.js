import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
    CITY_TREES,
    TREE_SPECIES,
    STREET_LAMPS,
    TRAFFIC_SPLINES,
    INITIAL_VEHICLES,
    advanceTraffic
} from '../admin-linear/src/lib/cityEnvironmentData.js';

import {
    createTreeMesh,
    createStreetLampMesh,
    createVehicleMesh,
    CityEnvironmentController
} from '../admin-linear/src/lib/cityEnvironmentLayer.js';

test('M3 City Environment - 3D Trees Data & Distribution', async (t) => {
    await t.test('contains at least 180 trees across gardens and avenues', () => {
        assert.ok(CITY_TREES.length >= 180, `Expected >= 180 trees, got ${CITY_TREES.length}`);
    });

    await t.test('all trees are strictly within Petrogradka geographic bounds', () => {
        CITY_TREES.forEach(tree => {
            const [lng, lat] = tree.coords;
            assert.ok(lng >= 30.28 && lng <= 30.33, `Tree ${tree.id} lng ${lng} out of range`);
            assert.ok(lat >= 59.95 && lat <= 59.97, `Tree ${tree.id} lat ${lat} out of range`);
        });
    });

    await t.test('all trees reference valid botanical species', () => {
        const validSpecies = Object.values(TREE_SPECIES).map(s => s.id);
        CITY_TREES.forEach(tree => {
            assert.ok(validSpecies.includes(tree.species), `Tree ${tree.id} has invalid species ${tree.species}`);
            assert.ok(tree.height >= 2.0 && tree.height <= 12.0, `Tree ${tree.id} height ${tree.height} unrealistic`);
        });
    });
});

test('M3 City Environment - Street Lamps & Illumination Grid', async (t) => {
    await t.test('contains at least 150 cast-iron street lamps', () => {
        assert.ok(STREET_LAMPS.length >= 150, `Expected >= 150 lamps, got ${STREET_LAMPS.length}`);
    });

    await t.test('street lamps follow Petrogradka avenues with realistic dimensions', () => {
        STREET_LAMPS.forEach(lamp => {
            const [lng, lat] = lamp.coords;
            assert.ok(lng >= 30.28 && lng <= 30.33, `Lamp ${lamp.id} lng out of bounds`);
            assert.ok(lat >= 59.95 && lat <= 59.97, `Lamp ${lamp.id} lat out of bounds`);
            assert.ok(lamp.height >= 4.0 && lamp.height <= 6.0, `Lamp ${lamp.id} height unrealistic`);
        });
    });
});

test('M3 City Environment - Dynamic Traffic & Intelligent Driver Model (IDM)', async (t) => {
    await t.test('initializes traffic fleet with taxis, sedans, and azure bus', () => {
        assert.ok(INITIAL_VEHICLES.length >= 6, `Expected >= 6 vehicles, got ${INITIAL_VEHICLES.length}`);
        const types = new Set(INITIAL_VEHICLES.map(v => v.type));
        assert.ok(types.has('taxi'), 'Fleet missing taxi');
        assert.ok(types.has('sedan'), 'Fleet missing sedan');
        assert.ok(types.has('bus'), 'Fleet missing bus');
    });

    await t.test('advanceTraffic smoothly moves vehicles along splines without NaN', () => {
        let fleet = [...INITIAL_VEHICLES];
        for (let step = 0; step < 100; step++) {
            fleet = advanceTraffic(fleet, 33);
        }

        fleet.forEach(v => {
            assert.ok(!Number.isNaN(v.coords[0]), `Vehicle ${v.id} lng is NaN`);
            assert.ok(!Number.isNaN(v.coords[1]), `Vehicle ${v.id} lat is NaN`);
            assert.ok(!Number.isNaN(v.bearing), `Vehicle ${v.id} bearing is NaN`);
            assert.ok(v.currentSpeed >= 0, `Vehicle ${v.id} speed is negative`);
        });
    });

    await t.test('IDM car-following maintains safe gap when following leading car', () => {
        const testVehicles = [
            {
                id: 'lead_car',
                routeKey: 'BOLSHOY_EASTBOUND',
                type: 'sedan',
                speedMps: 3.0,
                progress: 0.50,
                coords: [30.300, 59.958],
                bearing: 45
            },
            {
                id: 'follow_car',
                routeKey: 'BOLSHOY_EASTBOUND',
                type: 'taxi',
                speedMps: 12.0,
                progress: 0.493, // ~9.8m behind lead car
                coords: [30.299, 59.957],
                bearing: 45
            }
        ];

        let fleet = testVehicles;
        for (let i = 0; i < 20; i++) {
            fleet = advanceTraffic(fleet, 33);
        }

        const follower = fleet.find(v => v.id === 'follow_car');
        assert.ok(follower.currentSpeed < 12.0, `Follower failed to decelerate: ${follower.currentSpeed}`);
    });
});

test('M3 City Environment - Three.js Mesh Construction & Controller Lifecycle', async (t) => {
    await t.test('createTreeMesh creates complete hierarchy with trunk, canopy, and contact shadow', () => {
        const tree = createTreeMesh({
            id: 'test_tree',
            coords: [30.3080, 59.9590],
            species: 'linden',
            height: 7.5,
            radius: 2.8
        });

        assert.ok(tree instanceof THREE.Group, 'Tree mesh should be a THREE.Group');
        assert.ok(tree.getObjectByName('canopy'), 'Tree should have canopy child group');
        assert.ok(tree.children.length >= 3, 'Tree should contain trunk, canopy, and contact shadow');
    });

    await t.test('createStreetLampMesh creates post, lanternHead, and lightPool', () => {
        const lamp = createStreetLampMesh({
            id: 'test_lamp',
            coords: [30.3080, 59.9590],
            height: 4.8
        });

        assert.ok(lamp instanceof THREE.Group, 'Lamp mesh should be a THREE.Group');
        assert.ok(lamp.getObjectByName('lanternHead'), 'Lamp should have lanternHead');
        assert.ok(lamp.getObjectByName('lightPool'), 'Lamp should have lightPool');
    });

    await t.test('createVehicleMesh creates body, cabin, wheels, and headlights with beam', () => {
        const taxi = createVehicleMesh({
            id: 'test_taxi',
            type: 'taxi',
            color: '#facc15',
            hasTaxiSign: true,
            length: 4.6,
            width: 1.85,
            height: 1.45
        });

        assert.ok(taxi instanceof THREE.Group, 'Vehicle mesh should be a THREE.Group');
        const hl = taxi.getObjectByName('headlights');
        assert.ok(hl, 'Vehicle should have headlights group');
        assert.ok(hl.getObjectByName('beam'), 'Vehicle headlights should have volumetric beam');
    });

    await t.test('CityEnvironmentController manages lifecycle and day/night updates', () => {
        const scene = new THREE.Scene();
        const fakeGpsToLocal = () => ({ x: 10, y: 0, z: 20 });

        const controller = new CityEnvironmentController(scene, fakeGpsToLocal, { x: 0, y: 0 }, 1);
        assert.ok(controller.treeMeshes.length >= 180, 'Controller did not instantiate trees');
        assert.ok(controller.lampMeshes.length >= 150, 'Controller did not instantiate lamps');
        assert.ok(controller.vehicleMeshes.size >= 6, 'Controller did not instantiate vehicles');

        // Test update at night
        controller.update(33, { elevation: -15, phase: 'night' }, 1000);
        const firstLamp = controller.lampMeshes[0];
        assert.ok(firstLamp.userData.head.material.emissiveIntensity > 0.5, 'Lamps should glow at night');
        assert.ok(firstLamp.userData.pool.material.opacity > 0.2, 'Light pools should appear at night');

        // Test update at noon
        controller.update(33, { elevation: 45, phase: 'day' }, 2000);
        assert.equal(firstLamp.userData.head.material.emissiveIntensity, 0.0, 'Lamps should be off during day');
        assert.equal(firstLamp.userData.pool.material.opacity, 0.0, 'Light pools should be off during day');

        // Test dispose
        controller.dispose();
        assert.equal(controller.treeMeshes.length, 0, 'Trees should be disposed');
        assert.equal(controller.lampMeshes.length, 0, 'Lamps should be disposed');
        assert.equal(controller.vehicleMeshes.size, 0, 'Vehicles should be disposed');
    });
});
