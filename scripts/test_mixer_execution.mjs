import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Setup fake DOM parser for GLTFLoader in Node if needed, or use node-three-gltf
// We can test the track retargeting logic directly!

function retargetClip(clip, hasMixamoPrefix) {
    const cloned = clip.clone();
    const filteredTracks = [];

    for (const track of cloned.tracks) {
        if (!track.name.endsWith('.quaternion')) continue;
        const clonedTrack = track.clone();
        if (!hasMixamoPrefix) {
            // Strip mixamorig: or mixamorig prefix
            clonedTrack.name = clonedTrack.name.replace(/^mixamorig:?/i, '');
        } else {
            // Ensure format is mixamorig:Name (matching the target model)
            // Let's see if target model has mixamorig:Name or mixamorigName
            if (!clonedTrack.name.startsWith('mixamorig:')) {
                clonedTrack.name = clonedTrack.name.replace(/^mixamorig/i, 'mixamorig:');
            }
        }
        filteredTracks.push(clonedTrack);
    }
    cloned.tracks = filteredTracks;
    return cloned;
}

console.log('Testing retargeting logic...');
