/**
 * CollisionSystem.js
 * 
 * 2D Continuous AABB & Capsule collision detection for Lera's room.
 * Implements axis-separated sliding movement (Axis-Separated Sliding Plane)
 * to prevent sticking to corners, walls and furniture.
 * Supports vertical obstacle heights and jumping onto furniture (bed, desk, etc.).
 */

export class CollisionSystem {
    constructor(options = {}) {
        this.playerRadius = options.playerRadius ?? 0.28;
        
        // Room perimeter bounds (Room is 6.0m wide by 5.0m deep, centered at 0,0)
        this.roomBounds = {
            minX: -3.0,
            maxX: 3.0,
            minZ: -2.5,
            maxZ: 2.5
        };

        // Static obstacle AABBs with heights [minX, minZ, maxX, maxZ, height, name]
        this.obstacles = [
            // Work Desk (North-West corner)
            { minX: -2.55, minZ: -2.48, maxX: -1.05, maxZ: -1.35, height: 0.75, name: 'desk' },
            // Bed + Headboard (North-East zone)
            { minX: 0.55, minZ: -2.48, maxX: 2.65, maxZ: -0.38, height: 0.55, name: 'bed' },
            // Bedside table (next to bed)
            { minX: 0.10, minZ: -2.48, maxX: 0.55, maxZ: -2.00, height: 0.52, name: 'bedside_table' },
            // Wardrobe Rail (South-East corner)
            { minX: 1.65, minZ: 0.65, maxX: 2.75, maxZ: 1.65, height: 1.60, name: 'wardrobe_rail' },
            // Bookshelf (West wall)
            { minX: -2.85, minZ: -0.60, maxX: -2.25, maxZ: 0.60, height: 1.80, name: 'bookshelf' },
            // Vintage Floor Lamp (South-West corner)
            { minX: -2.55, minZ: 0.85, maxX: -2.15, maxZ: 1.25, height: 1.65, name: 'floor_lamp' },
            // Armchair / Pouf (South-West chill corner)
            { minX: -1.95, minZ: 1.15, maxX: -1.25, maxZ: 1.85, height: 0.45, name: 'armchair' }
        ];
    }

    /**
     * Checks if a point (x, z) with player radius collides with any obstacle
     * @param {number} x
     * @param {number} z
     * @param {number} [radius]
     * @param {number} [feetY] Player feet elevation above floor
     */
    isColliding(x, z, radius = this.playerRadius, feetY = 0) {
        // Room boundary check
        if (
            x - radius < this.roomBounds.minX ||
            x + radius > this.roomBounds.maxX ||
            z - radius < this.roomBounds.minZ ||
            z + radius > this.roomBounds.maxZ
        ) {
            return true;
        }

        // Obstacles check (circle vs AABB)
        for (let i = 0; i < this.obstacles.length; i++) {
            const obs = this.obstacles[i];
            // If feet are cleanly above obstacle top, no horizontal collision
            if (feetY >= obs.height - 0.05) continue;

            if (this.circleIntersectsAABB(x, z, radius, obs)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Test circle intersection against axis-aligned box
     */
    circleIntersectsAABB(cx, cz, r, box) {
        const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
        const distX = cx - closestX;
        const distZ = cz - closestZ;
        return (distX * distX + distZ * distZ) < (r * r);
    }

    /**
     * Calculates the ground / obstacle surface height directly under player's feet
     * @param {number} x
     * @param {number} z
     * @param {number} [radius]
     * @returns {number} Elevation in meters (0 for floor, >0 for on top of bed/desk)
     */
    getGroundElevation(x, z, radius = this.playerRadius) {
        let maxElevation = 0;
        for (let i = 0; i < this.obstacles.length; i++) {
            const obs = this.obstacles[i];
            if (this.circleIntersectsAABB(x, z, radius, obs)) {
                if (obs.height > maxElevation) {
                    maxElevation = obs.height;
                }
            }
        }
        return maxElevation;
    }

    /**
     * Resolves movement with independent axis sliding.
     * Prevents sticking to walls and furniture while moving diagonally.
     *
     * @param {number} curX Current X position
     * @param {number} curZ Current Z position
     * @param {number} deltaX Attempted X displacement
     * @param {number} deltaZ Attempted Z displacement
     * @param {number} [radius] Optional player radius override
     * @param {number} [feetY] Optional player feet height above floor
     * @returns {{x: number, z: number, collidedX: boolean, collidedZ: boolean}}
     */
    resolveMovement(curX, curZ, deltaX, deltaZ, radius = this.playerRadius, feetY = 0) {
        const safetyMargin = 0.005;
        let targetX = curX + deltaX;
        let targetZ = curZ + deltaZ;
        let collidedX = false;
        let collidedZ = false;

        // 1. Resolve X movement while keeping current Z
        if (Math.abs(deltaX) > 0.0001) {
            // Room X boundaries
            if (targetX - radius < this.roomBounds.minX) {
                targetX = this.roomBounds.minX + radius + safetyMargin;
                collidedX = true;
            } else if (targetX + radius > this.roomBounds.maxX) {
                targetX = this.roomBounds.maxX - radius - safetyMargin;
                collidedX = true;
            }

            // Obstacles X resolution
            for (let i = 0; i < this.obstacles.length; i++) {
                const obs = this.obstacles[i];
                if (feetY >= obs.height - 0.05) continue;

                if (this.circleIntersectsAABB(targetX, curZ, radius, obs)) {
                    collidedX = true;
                    if (deltaX > 0) {
                        targetX = obs.minX - radius - safetyMargin;
                    } else {
                        targetX = obs.maxX + radius + safetyMargin;
                    }
                }
            }
        }

        // 2. Resolve Z movement using the resolved X position
        if (Math.abs(deltaZ) > 0.0001) {
            // Room Z boundaries
            if (targetZ - radius < this.roomBounds.minZ) {
                targetZ = this.roomBounds.minZ + radius + safetyMargin;
                collidedZ = true;
            } else if (targetZ + radius > this.roomBounds.maxZ) {
                targetZ = this.roomBounds.maxZ - radius - safetyMargin;
                collidedZ = true;
            }

            // Obstacles Z resolution
            for (let i = 0; i < this.obstacles.length; i++) {
                const obs = this.obstacles[i];
                if (feetY >= obs.height - 0.05) continue;

                if (this.circleIntersectsAABB(targetX, targetZ, radius, obs)) {
                    collidedZ = true;
                    if (deltaZ > 0) {
                        targetZ = obs.minZ - radius - safetyMargin;
                    } else {
                        targetZ = obs.maxZ + radius + safetyMargin;
                    }
                }
            }
        }

        return {
            x: targetX,
            z: targetZ,
            collidedX,
            collidedZ
        };
    }
}
