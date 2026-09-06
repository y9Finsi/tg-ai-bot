/**
 * Pure JavaScript 2D Force-Directed Graph Physics Engine.
 * Supports Coulomb node repulsion, Hooke spring link attraction, center gravity,
 * velocity damping, and interactive coordinate pinning.
 */

export function initNodePositions(nodes, width = 720, height = 460) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;
    const count = nodes.length;

    return nodes.map((node, index) => {
        const angle = count > 1 ? (index / count) * 2 * Math.PI : 0;
        const x = node.x ?? (cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20);
        const y = node.y ?? (cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20);
        return {
            ...node,
            x,
            y,
            vx: node.vx ?? 0,
            vy: node.vy ?? 0,
            fx: node.fx ?? null,
            fy: node.fy ?? null
        };
    });
}

export function stepSimulation(nodes, edges, options = {}) {
    const {
        width = 720,
        height = 460,
        repulsion = 4500,
        springLength = 110,
        springStrength = 0.045,
        gravity = 0.025,
        damping = 0.85,
        dt = 1.0
    } = options;

    const cx = width / 2;
    const cy = height / 2;
    const nodeMap = new Map();

    const currentNodes = nodes.map(n => {
        const copy = { ...n };
        nodeMap.set(String(copy.id ?? copy.key), copy);
        return copy;
    });

    // 1. Center Gravity
    for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        if (node.fx !== null && node.fx !== undefined) continue;

        const dx = cx - node.x;
        const dy = cy - node.y;
        node.vx += dx * gravity * dt;
        node.vy += dy * gravity * dt;
    }

    // 2. Coulomb Repulsion between all node pairs
    for (let i = 0; i < currentNodes.length; i++) {
        for (let j = i + 1; j < currentNodes.length; j++) {
            const n1 = currentNodes[i];
            const n2 = currentNodes[j];

            let dx = n2.x - n1.x;
            let dy = n2.y - n1.y;
            let distSq = dx * dx + dy * dy;
            if (distSq < 1) {
                dx = (Math.random() - 0.5) * 2;
                dy = (Math.random() - 0.5) * 2;
                distSq = dx * dx + dy * dy + 1;
            }

            const dist = Math.sqrt(distSq);
            const force = (repulsion / (distSq + 120)) * dt;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (n1.fx === null || n1.fx === undefined) {
                n1.vx -= fx;
                n1.vy -= fy;
            }
            if (n2.fx === null || n2.fx === undefined) {
                n2.vx += fx;
                n2.vy += fy;
            }
        }
    }

    // 3. Hooke Spring Attraction on Edges
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const sourceId = String(edge.source ?? edge.from ?? edge.source_id ?? edge.source?.id);
        const targetId = String(edge.target ?? edge.to ?? edge.target_id ?? edge.target?.id);

        const source = nodeMap.get(sourceId);
        const target = nodeMap.get(targetId);

        if (!source || !target || source === target) continue;

        let dx = target.x - source.x;
        let dy = target.y - source.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.1) dist = 0.1;

        const displacement = dist - springLength;
        const force = displacement * springStrength * dt;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (source.fx === null || source.fx === undefined) {
            source.vx += fx;
            source.vy += fy;
        }
        if (target.fx === null || target.fx === undefined) {
            target.vx -= fx;
            target.vy -= fy;
        }
    }

    // 4. Position update & velocity damping
    let maxMovement = 0;
    const padding = 35;

    for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];

        if (node.fx !== null && node.fx !== undefined) {
            node.x = node.fx;
            node.y = node.fy;
            node.vx = 0;
            node.vy = 0;
            continue;
        }

        node.vx *= damping;
        node.vy *= damping;

        // Cap speed to avoid explosions
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (speed > 25) {
            node.vx = (node.vx / speed) * 25;
            node.vy = (node.vy / speed) * 25;
        }

        const moveX = node.vx * dt;
        const moveY = node.vy * dt;
        node.x += moveX;
        node.y += moveY;

        // Boundary containment
        if (node.x < padding) { node.x = padding; node.vx *= -0.2; }
        if (node.x > width - padding) { node.x = width - padding; node.vx *= -0.2; }
        if (node.y < padding) { node.y = padding; node.vy *= -0.2; }
        if (node.y > height - padding) { node.y = height - padding; node.vy *= -0.2; }

        const move = Math.sqrt(moveX * moveX + moveY * moveY);
        if (move > maxMovement) maxMovement = move;
    }

    return { nodes: currentNodes, maxMovement };
}
