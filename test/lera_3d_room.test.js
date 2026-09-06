/**
 * test/lera_3d_room.test.js
 * 
 * Unit and integration tests for Lera's 3D historic apartment:
 * - CollisionSystem (2D AABB & axis-separated sliding plane & obstacle elevations)
 * - RoomArchitectureBuilder (6x5x3.6m proportions, arched window, Sims cutaway)
 * - FurniturePropsBuilder (PBR props, MacBook, bed, lamps, shadows)
 * - SkylineEnvironment (Petersburg dynamic sky, rooftops, shadows)
 * - LeraCharacter (3D normcore avatar, walk/idle/jump animations, Plumbob)
 * - CameraController (Higher speeds, Space jumps, Sims point-and-click, zoom, orbit)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { CollisionSystem } from '../admin-linear/src/lib/threeRoom/CollisionSystem.js';
import { SkylineEnvironment } from '../admin-linear/src/lib/threeRoom/SkylineEnvironment.js';
import { RoomArchitectureBuilder } from '../admin-linear/src/lib/threeRoom/RoomArchitectureBuilder.js';
import { FurniturePropsBuilder } from '../admin-linear/src/lib/threeRoom/FurniturePropsBuilder.js';
import { LeraCharacter } from '../admin-linear/src/lib/threeRoom/LeraCharacter.js';
import { CameraController } from '../admin-linear/src/lib/threeRoom/CameraController.js';

test('3D Room - CollisionSystem & Sliding Kinematics & Elevations', async (t) => {
    const collision = new CollisionSystem();

    await t.test('center of room (0, 0.5) is collision-free', () => {
        assert.equal(collision.isColliding(0, 0.5), false);
    });

    await t.test('detects collision with outer walls', () => {
        // West wall at -3.0m
        assert.equal(collision.isColliding(-2.9, 0), true);
        // East wall at +3.0m
        assert.equal(collision.isColliding(2.9, 0), true);
        // North wall at -2.5m
        assert.equal(collision.isColliding(0, -2.4), true);
        // South wall at +2.5m
        assert.equal(collision.isColliding(0, 2.4), true);
    });

    await t.test('detects collision with furniture AABBs (desk and bed)', () => {
        // Inside work desk area (minX: -2.55, minZ: -2.48, maxX: -1.05, maxZ: -1.35)
        assert.equal(collision.isColliding(-1.8, -1.9), true);
        // Inside bed area (minX: 0.55, minZ: -2.48, maxX: 2.65, maxZ: -0.38)
        assert.equal(collision.isColliding(1.6, -1.4), true);
    });

    await t.test('getGroundElevation correctly returns obstacle heights', () => {
        // Floor elevation is 0
        assert.equal(collision.getGroundElevation(0, 0.5), 0);
        // Bed top elevation is 0.55m
        assert.equal(collision.getGroundElevation(1.6, -1.4), 0.55);
        // Desk top elevation is 0.75m
        assert.equal(collision.getGroundElevation(-1.8, -1.9), 0.75);
    });

    await t.test('allows horizontal movement over obstacles when player feet are elevated', () => {
        // When feet are on bed (feetY = 0.55), horizontal movement inside bed AABB does not collide
        assert.equal(collision.isColliding(1.6, -1.4, 0.28, 0.55), false);
    });

    await t.test('resolveMovement clamps movement at wall boundary without NaN', () => {
        const curX = 2.5;
        const curZ = 0;
        const res = collision.resolveMovement(curX, curZ, 1.0, 0);
        assert.ok(!Number.isNaN(res.x), 'res.x should not be NaN');
        assert.ok(res.collidedX, 'Should detect collision on X');
        assert.ok(res.x <= 2.72, `res.x ${res.x} exceeds wall limit 2.72`);
        assert.ok(res.x > 2.0, 'res.x should stay reasonably close to wall');
    });

    await t.test('resolveMovement enables axis-separated sliding along obstacles', () => {
        const curX = -1.8;
        const curZ = -0.9;
        const res = collision.resolveMovement(curX, curZ, -0.3, -0.6);

        assert.ok(!Number.isNaN(res.x) && !Number.isNaN(res.z), 'Coordinates must be valid numbers');
        assert.ok(res.collidedZ, 'Should detect collision on Z with desk');
        assert.equal(res.x, curX - 0.3, 'X movement should slide freely without sticking');
    });
});

test('3D Room - RoomArchitectureBuilder Geometry & Sims Cutaway', async (t) => {
    const scene = new THREE.Scene();
    const builder = new RoomArchitectureBuilder(scene);

    await t.test('adds architecture group to scene with floor, walls and window', () => {
        const arch = scene.getObjectByName('room_architecture');
        assert.ok(arch, 'room_architecture group must be in scene');
        assert.ok(arch.children.length >= 4, `Expected >= 4 structural groups, got ${arch.children.length}`);
    });

    await t.test('setWallCutaway toggles south wall and ceiling for The Sims view', () => {
        builder.setWallCutaway(true);
        assert.equal(builder.southWallGroup.visible, false);
        assert.equal(builder.ceilingMesh.visible, false);

        builder.setWallCutaway(false);
        assert.equal(builder.southWallGroup.visible, true);
        assert.equal(builder.ceilingMesh.visible, true);
    });

    builder.dispose();
});

test('3D Room - FurniturePropsBuilder & Contact Shadows', async (t) => {
    const scene = new THREE.Scene();
    const furniture = new FurniturePropsBuilder(scene);

    await t.test('adds furniture group to scene with props', () => {
        const group = scene.getObjectByName('room_furniture');
        assert.ok(group, 'room_furniture group must be in scene');
        assert.ok(group.children.length >= 8, `Expected >= 8 furniture groups/shadows, got ${group.children.length}`);
    });

    await t.test('instantiates light references for floor lamp, nightstand, and macbook', () => {
        assert.ok(furniture.lampLight, 'lampLight must be instantiated');
        assert.ok(furniture.nightstandLight, 'nightstandLight must be instantiated');
        assert.ok(furniture.macbookGlow, 'macbookGlow must be instantiated');
        assert.equal(furniture.lampLight.isPointLight, true);
    });

    furniture.dispose();
});

test('3D Room - LeraCharacter Avatar & Kinematics', async (t) => {
    const scene = new THREE.Scene();
    const character = new LeraCharacter(scene);

    await t.test('instantiates character hierarchy with pelvis, limbs, and Plumbob', () => {
        const charGroup = scene.getObjectByName('lera_character');
        assert.ok(charGroup, 'lera_character group must be in scene');
        assert.ok(character.pelvis, 'pelvis must exist');
        assert.ok(character.plumbobMesh, 'plumbobMesh must exist');
    });

    await t.test('setVisibility toggles avatar in scene', () => {
        character.setVisibility(true);
        assert.equal(character.group.visible, true);
        character.setVisibility(false);
        assert.equal(character.group.visible, false);
    });

    await t.test('update step animates walking and jump poses without NaN', () => {
        const pos = new THREE.Vector3(0, 0, 0);
        // Walking
        character.update(0.016, pos, true, 3.2, 0.5, false, 0);
        assert.ok(!Number.isNaN(character.walkPhase));
        // Jumping
        character.update(0.016, pos, true, 3.2, 0.5, true, 0.6);
        assert.equal(character.leftLeg.rotation.x, -0.45);
    });

    character.dispose();
});

test('3D Room - SkylineEnvironment & Petersburg Lighting', async (t) => {
    const scene = new THREE.Scene();
    const skyline = new SkylineEnvironment(scene);

    await t.test('adds skyline environment and directional sun with shadow map', () => {
        const group = scene.getObjectByName('skyline_environment');
        assert.ok(group, 'skyline_environment must be in scene');
        assert.ok(skyline.sunLight, 'sunLight must exist');
        assert.equal(skyline.sunLight.castShadow, true);
        assert.equal(skyline.sunLight.shadow.mapSize.width, 1024);
    });

    await t.test('updateSun adapts to night, dawn and day states', () => {
        skyline.updateSun({ isNight: true, elevation: -15, phase: 'night' });
        assert.equal(skyline.sunLight.color.getHexString(), '818cf8');

        skyline.updateSun({ isNight: false, elevation: 5, phase: 'dawn' });
        assert.equal(skyline.sunLight.color.getHexString(), 'fdba74');

        skyline.updateSun({ isNight: false, elevation: 35, phase: 'day' });
        assert.equal(skyline.sunLight.color.getHexString(), 'fffbeb');
    });

    skyline.dispose();
});

test('3D Room - CameraController & Speed, Jumps, Sims Navigation & Zoom', async (t) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1.33, 0.08, 50.0);
    const collision = new CollisionSystem();
    const arch = new RoomArchitectureBuilder(scene);
    const character = new LeraCharacter(scene);

    const controller = new CameraController(camera, null, collision, arch, character);

    await t.test('has faster walk (3.2m/s) and sprint (5.8m/s) speeds', () => {
        assert.equal(controller.walkSpeed, 3.2);
        assert.equal(controller.runSpeed, 5.8);
    });

    await t.test('triggerJump initiates vertical jump with positive velocity', () => {
        assert.equal(controller.isGrounded, true);
        controller.triggerJump();
        assert.equal(controller.isGrounded, false);
        assert.equal(controller.isJumping, true);
        assert.ok(controller.verticalVelocity > 0, 'Vertical velocity must be positive on jump');

        // Physics step pulls player back to ground via gravity
        controller.update(0.4); // advance 400ms
        assert.ok(!Number.isNaN(controller.playerPos.y));
    });

    await t.test('zoomIn, zoomOut, and resetZoom adjust Sims zoom level', () => {
        const initialZoom = controller.simsZoom;
        controller.zoomOut();
        assert.ok(controller.simsZoom > initialZoom, 'Zoom out should increase distance');

        controller.zoomIn();
        controller.zoomIn();
        assert.ok(controller.simsZoom < initialZoom, 'Zoom in should decrease distance');

        controller.resetZoom();
        assert.equal(controller.simsZoom, 1.0);
    });

    await t.test('Point-and-Click navigation moves player towards targetNavPos in Sims mode', () => {
        controller.setMode('sims');
        controller.playerPos.set(0, 0, 0);
        controller.targetPlayerPos.set(0, 0, 0);

        // Click destination at (1.0, 0, 1.0)
        controller.targetNavPos = new THREE.Vector3(1.0, 0, 1.0);
        controller.update(0.05);

        // Player should have moved closer to (1.0, 1.0)
        assert.ok(controller.playerPos.x > 0.01, 'Player should move towards target X');
        assert.ok(controller.playerPos.z > 0.01, 'Player should move towards target Z');
    });

    controller.dispose();
    character.dispose();
    arch.dispose();
});
