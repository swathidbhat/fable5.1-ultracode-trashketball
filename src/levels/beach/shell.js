// The house itself: floor, walls, ceiling, timber beams, the window wall with its bronze mullions and
// faint glass, the sheer curtain, fireplace chunk, wall art, kitchen island, and the deck outside.
// Art doc 03 sections 3.1 and 3.2. Static parts go into material buckets (one mesh per material).
import * as THREE from 'three';
import { boxCollider } from '../util.js';
import { ATLAS, atlasUV, remapUV } from './textures.js';
import { rbox, placed, grainUV, tint, shadowMesh, mergeAll } from './geo.js';

export const MULLION_X = [-6, -3.6, -1.2, 1.2, 3.6, 6];

const WALL = { tag: 'wall', restitution: 0.40, friction: 0.30, rollDamping: 2.5 };

export function buildShell({ mats, buckets, statics, colliders }) {
  // ---- floor and ceiling (own meshes: the floor is the clearcoat oak, the ceiling never casts) ----
  const floor = shadowMesh(new THREE.PlaneGeometry(12, 9), mats.oak, false, true);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -0.5);
  floor.name = 'floor';
  statics.add(floor);

  const ceiling = shadowMesh(new THREE.PlaneGeometry(12, 9), mats.ceiling, false, true);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 5.5, -0.5);
  ceiling.name = 'ceiling';
  statics.add(ceiling);

  // ---- limewash plaster: side walls, back wall, fireplace chunk, roof overhang, deck plinth ----
  const wallSide = new THREE.PlaneGeometry(9, 5.5);
  const wallBack = new THREE.PlaneGeometry(12, 5.5);
  buckets.add('plaster', placed(wallSide, -6, 2.75, -0.5, 0, Math.PI / 2, 0));
  buckets.add('plaster', placed(wallSide, 6, 2.75, -0.5, 0, -Math.PI / 2, 0));
  buckets.add('plaster', placed(wallBack, 0, 2.75, 4, 0, Math.PI, 0));
  wallSide.dispose(); wallBack.dispose();
  buckets.add('plaster', placed(new THREE.BoxGeometry(0.5, 5.5, 2.4), 5.75, 2.75, -2.5));      // fireplace chunk
  buckets.add('plaster', placed(new THREE.BoxGeometry(13, 0.35, 2.2), 0, 5.675, -6.1));       // roof overhang
  buckets.add('plaster', placed(new THREE.BoxGeometry(12, 0.6, 3.3), 0, -0.42, -6.65));       // deck plinth block
  buckets.add('props', tint(placed(new THREE.BoxGeometry(0.3, 0.5, 1.2), 5.5, 0.55, -2.5), 0x151413)); // firebox

  colliders.boxes.push(
    boxCollider(-6.12, 0, -5, -6.0, 5.5, 4, WALL),
    boxCollider(6.0, 0, -5, 6.12, 5.5, 4, WALL),
    boxCollider(-6, 0, 4.0, 6, 5.5, 4.12, WALL),
    boxCollider(5.35, 0, -3.7, 6.0, 5.5, -1.3, WALL),
    boxCollider(-6, 5.5, -5, 6, 5.62, 4, { tag: 'ceiling', restitution: 0.35, friction: 0.30, rollDamping: 2.5 }),
  );

  // ---- bleached timber: spine + five cross beams, wall-art frame, island body ----
  buckets.add('timber', grainUV(placed(new THREE.BoxGeometry(0.30, 0.42, 9), 0, 5.29, -0.5), 'z', 0.5, 2.0));
  for (const z of [-4.2, -2.2, -0.2, 1.8, 3.8]) {
    buckets.add('timber', grainUV(placed(new THREE.BoxGeometry(12, 0.30, 0.22), 0, 5.35, z), 'x', 0.5, 2.0));
  }

  // ---- window wall: mullions, transom, sill, head (bronze), glass, curtain ----
  const mullion = new THREE.BoxGeometry(0.08, 5.5, 0.14);
  for (const x of MULLION_X) {
    buckets.add('bronze', placed(mullion, x, 2.75, -5));
    colliders.boxes.push(boxCollider(x - 0.04, 0, -5.07, x + 0.04, 5.5, -4.93,
      { tag: 'mullion', restitution: 0.55, friction: 0.20, rollDamping: 2.5 }));
  }
  mullion.dispose();
  const rail = new THREE.BoxGeometry(12, 0.06, 0.14);
  buckets.add('bronze', placed(rail, 0, 3.4, -5));    // transom
  buckets.add('bronze', placed(rail, 0, 0.03, -5));   // sill
  buckets.add('bronze', placed(rail, 0, 5.47, -5));   // head
  rail.dispose();
  colliders.boxes.push(boxCollider(-6, 3.37, -5.07, 6, 3.43, -4.93,
    { tag: 'mullion', restitution: 0.55, friction: 0.20, rollDamping: 2.5 }));
  colliders.boxes.push(boxCollider(-6, 0, -5.12, 6, 5.5, -5.0,
    { tag: 'window', restitution: 0.62, friction: 0.10, rollDamping: 2.0 }));

  buckets.add('glass', placed(new THREE.PlaneGeometry(12, 5.5), 0, 2.75, -5));
  buckets.add('glass', placed(new THREE.PlaneGeometry(12, 1.05), 0, 0.525, -8.2));           // balustrade
  buckets.add('bronze', placed(new THREE.CylinderGeometry(0.02, 0.02, 12, 12), 0, 1.06, -8.2, 0, 0, Math.PI / 2)); // rail

  const curtainGeo = new THREE.PlaneGeometry(1.6, 5.4, 12, 40);
  const curtain = new THREE.Mesh(curtainGeo, mats.curtain);
  curtain.position.set(-5.0, 2.7, -4.7);
  curtain.name = 'curtain';
  curtain.castShadow = false;
  curtain.receiveShadow = false;
  curtain.frustumCulled = false;
  statics.add(curtain);
  const curtainBase = new Float32Array(curtainGeo.attributes.position.array);

  // ---- deck (ipe-toned timber, boards running toward the sea) ----
  const deck = shadowMesh(grainUV(new THREE.BoxGeometry(12, 0.12, 3.2), 'z', 0.5, 2.0), mats.deck, true, true);
  deck.position.set(0, -0.06, -6.6);
  deck.name = 'deck';
  statics.add(deck);

  // ---- wall art on the left wall: atlas canvas in an oak frame ----
  const art = placed(new THREE.PlaneGeometry(1.6, 1.2), -5.955, 2.1, -1.0, 0, Math.PI / 2, 0);
  remapUV(art, atlasUV(ATLAS.art));
  buckets.add('atlas', art);
  const frameH = new THREE.BoxGeometry(0.05, 0.03, 1.66);
  const frameV = new THREE.BoxGeometry(0.05, 1.26, 0.03);
  buckets.add('timber', grainUV(placed(frameH, -5.97, 2.715, -1.0), 'z', 0.3, 2.0));
  buckets.add('timber', grainUV(placed(frameH, -5.97, 1.485, -1.0), 'z', 0.3, 2.0));
  buckets.add('timber', grainUV(placed(frameV, -5.97, 2.1, -0.185), 'y', 0.3, 2.0));
  buckets.add('timber', grainUV(placed(frameV, -5.97, 2.1, -1.815), 'y', 0.3, 2.0));
  frameH.dispose(); frameV.dispose();

  // ---- kitchen island behind the player: oak slat body, marble top ----
  buckets.add('timber', grainUV(placed(new THREE.BoxGeometry(2.4, 0.9, 0.9), 0.3, 0.45, 1.4), 'y', 0.2, 1.0));
  buckets.add('marbleStd', placed(rbox(2.5, 0.04, 1.0, 0.01), 0.3, 0.92, 1.4));
  colliders.boxes.push(boxCollider(-0.9, 0, 0.95, 1.5, 0.94, 1.85,
    { tag: 'island', restitution: 0.50, friction: 0.30, rollDamping: 2.5 }));

  return { curtain, curtainBase };
}

// Sheer curtain sway (art doc section 6.3): more movement toward the top. Called every frame.
export function swayCurtain(curtain, base, t) {
  const arr = curtain.geometry.attributes.position.array;
  for (let i = 0, n = arr.length; i < n; i += 3) {
    const y = base[i + 1];
    const w = 0.5 + 0.5 * (y + 2.7) / 5.4;
    arr[i] = base[i] + 0.03 * Math.sin(y * 2.2 + t * 1.3) * w;
    arr[i + 2] = base[i + 2] + 0.05 * Math.sin(y * 1.1 + t * 0.9) * w;
  }
  curtain.geometry.attributes.position.needsUpdate = true;
}

// Unused-export guard for tree shakers: mergeAll is re-exported for helpers that build on the shell.
export { mergeAll };
