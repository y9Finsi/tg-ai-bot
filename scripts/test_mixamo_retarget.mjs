import fs from 'fs';

// Read JSON chunk of xbot.glb and lera.glb and citizen_male.glb
function readGltfJson(file) {
    const buf = fs.readFileSync('admin-linear/public/models/' + file);
    const jsonLen = buf.readUInt32LE(12);
    return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}

const xbot = readGltfJson('xbot.glb');
const lera = readGltfJson('lera.glb');
const male = readGltfJson('citizen_male.glb');

console.log('xbot animation names:', xbot.animations.map(a => a.name));

// Check track target node names in xbot
const xbotNodeNames = xbot.nodes.map(n => n.name);
const leraNodeNames = lera.nodes.map(n => n.name);
const maleNodeNames = male.nodes.map(n => n.name);

console.log('Sample xbot nodes:', xbotNodeNames.slice(0, 15));
console.log('Sample lera nodes:', leraNodeNames.slice(0, 15));
console.log('Sample male nodes:', maleNodeNames.slice(0, 15));

// Check matching names
const walkAnim = xbot.animations.find(a => a.name === 'walk');
console.log('Walk channels count:', walkAnim.channels.length);

const walkTargetNodes = walkAnim.channels.map(ch => {
    const nodeIdx = ch.target.node;
    return xbot.nodes[nodeIdx].name;
});

console.log('First 10 walk target nodes in xbot:', walkTargetNodes.slice(0, 10));

const matchLera = walkTargetNodes.filter(name => leraNodeNames.includes(name));
console.log(`Lera matches ${matchLera.length} of ${walkTargetNodes.length} walk target nodes directly!`);

// For male (without mixamorig prefix)
const matchMale = walkTargetNodes.filter(name => {
    const clean = name.replace(/^mixamorig:?/i, '');
    return maleNodeNames.includes(clean) || maleNodeNames.includes(name);
});
console.log(`Male matches ${matchMale.length} of ${walkTargetNodes.length} walk target nodes after prefix strip!`);
