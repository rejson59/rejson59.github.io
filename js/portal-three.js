/* A self-contained, low-draw-call Three.js world for the existing portal.
   The HTML controls and CSS loading tunnel work even if WebGL is unavailable. */
import * as THREE from './vendor/three/three.module.min.js';

const host = document.getElementById('three-scene');
const notice = document.getElementById('scene-status');
if (host) {
  try { createWorld(host); }
  catch (error) {
    host.replaceChildren();
    document.body.classList.remove('three-ready');
    document.body.classList.add('three-fallback');
    if (notice) notice.textContent = 'Scena 3D jest niedostępna. Możesz nadal wejść do projektu.';
    console.warn('Portal 3D unavailable:', error);
  }
}

function createWorld(host) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080d20, 0.025);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 1.6, 13);
  camera.lookAt(0, 1, -8);
  scene.add(new THREE.HemisphereLight(0xa3e9ff, 0x231e49, 1.45));
  const warm = new THREE.DirectionalLight(0xffa4ad, 2.1); warm.position.set(-8, 8, 6); scene.add(warm);
  const cold = new THREE.DirectionalLight(0x6ff3ff, 2.6); cold.position.set(8, 5, 1); scene.add(cold);
  const glow = new THREE.PointLight(0x7bcfff, 85, 30); glow.position.set(0, 3, -2); scene.add(glow);

  // A black opening, not a flat image. Fragments move away from it on entry.
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7.2), new THREE.MeshBasicMaterial({ color: 0x010207 }));
  opening.position.set(0, 1, -8.5); scene.add(opening);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x080f20, roughness: 0.42, metalness: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -4.8; scene.add(floor);

  // One instanced draw for the solids, one for their luminous inlaid edges.
  const count = 72, blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.56 });
  const blocks = new THREE.InstancedMesh(blockGeometry, blockMaterial, count);
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const stripes = new THREE.InstancedMesh(blockGeometry, stripeMaterial, count);
  blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stripes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blocks.frustumCulled = false; stripes.frustumCulled = false;
  scene.add(blocks, stripes);
  const colors = [0x326079, 0x4f8ba0, 0x585078, 0x945b75, 0x397489, 0x83a5ad, 0x525d84];
  const lineColors = [0x79e6f6, 0xf9a5b8, 0x91c7ff];
  let seed = 40571;
  function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  const fragments = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    // Larger pieces occupy the foreground, leaving a clear dark center.
    const z = -16 + rand() * 20;
    const x = side * (2.9 + rand() * (z > -4 ? 7.5 : 5.7));
    const y = -3.8 + rand() * 10;
    const width = 0.35 + rand() * 1.35;
    const height = 1.5 + rand() * 5.2;
    const depth = 0.3 + rand() * 1.3;
    const tilt = side * (0.12 + rand() * 0.48);
    fragments.push({ side, x, y, z, width, height, depth, tilt, phase: rand() * Math.PI * 2, speed: 0.32 + rand() * 0.33 });
    blocks.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    stripes.setColorAt(i, new THREE.Color(lineColors[i % lineColors.length]));
  }
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  if (stripes.instanceColor) stripes.instanceColor.needsUpdate = true;
  const matrixObject = new THREE.Object3D();
  function updateFragments(time, openingAmount) {
    fragments.forEach((f, i) => {
      const drift = Math.sin(time * f.speed + f.phase);
      const x = f.x + f.side * openingAmount * (2.8 + Math.abs(f.z) * 0.05) + drift * .18;
      const y = f.y + drift * 0.32;
      matrixObject.position.set(x, y, f.z);
      matrixObject.rotation.set(0.06 * drift, 0.16 * f.side, f.tilt + drift * 0.075 + f.side * openingAmount * 0.22);
      matrixObject.scale.set(f.width, f.height, f.depth); matrixObject.updateMatrix();
      blocks.setMatrixAt(i, matrixObject.matrix);
      // Offset within each shard's local space so the inlay moves with it.
      matrixObject.translateX(f.width * 0.37);
      matrixObject.translateZ(f.depth * 0.51);
      matrixObject.scale.set(0.025, f.height * 0.82, 0.025); matrixObject.updateMatrix();
      stripes.setMatrixAt(i, matrixObject.matrix);
    });
    blocks.instanceMatrix.needsUpdate = true; stripes.instanceMatrix.needsUpdate = true;
  }

  // Faceted crystals are separate 3D objects, not a background texture.
  const crystalGeometry = new THREE.IcosahedronGeometry(1, 0);
  const crystalEdges = new THREE.EdgesGeometry(crystalGeometry);
  const crystalMaterials = [
    new THREE.MeshStandardMaterial({ color:0x55bbd0, emissive:0x0b3d56, metalness:0.48, roughness:0.25 }),
    new THREE.MeshStandardMaterial({ color:0xd18ca9, emissive:0x3b1237, metalness:0.45, roughness:0.3 }),
    new THREE.MeshStandardMaterial({ color:0x929cdb, emissive:0x20245e, metalness:0.5, roughness:0.25 })
  ];
  const crystalEdgeMaterial = new THREE.LineBasicMaterial({ color:0xc6f6ff, transparent:true, opacity:0.55 });
  const crystals = [];
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const crystal = new THREE.Group();
    crystal.add(new THREE.Mesh(crystalGeometry, crystalMaterials[i % crystalMaterials.length]));
    crystal.add(new THREE.LineSegments(crystalEdges, crystalEdgeMaterial));
    const size = 0.35 + rand() * 0.7;
    crystal.scale.set(size * .7, size * (1.7 + rand()), size * .7);
    const base = { x:side * (3.6 + rand() * 5), y:-2 + rand() * 7, z:-11 + rand() * 15, side, phase:rand() * 6 };
    crystal.position.set(base.x, base.y, base.z); scene.add(crystal); crystals.push({ crystal, base });
  }
  // Ribbons cross the space in depth, rather than forming another flat ring.
  const ribbonGroup = new THREE.Group(); scene.add(ribbonGroup);
  const ribbonGeometries = [], ribbonMaterials = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, height = 3.2 + i * .45;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 12, height + 2, 5), new THREE.Vector3(side * 7, height, 0),
      new THREE.Vector3(side * 3, height + .4, -6), new THREE.Vector3(-side * 3, height + 1.2, -15),
      new THREE.Vector3(-side * 10, height + .2, -25)
    ]);
    const geometry = new THREE.TubeGeometry(curve, 48, .025 + i * .003, 4, false);
    const material = new THREE.MeshBasicMaterial({ color:i % 3 === 0 ? 0xffaac8 : 0x7ce8f5, transparent:true, opacity:.68 });
    ribbonGeometries.push(geometry); ribbonMaterials.push(material); ribbonGroup.add(new THREE.Mesh(geometry, material));
  }

  // A few sparse stars appear in front of and behind the architecture.
  const starCount = 420, vertices = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    vertices[i * 3] = (rand() - 0.5) * 45;
    vertices[i * 3 + 1] = (rand() - 0.35) * 25;
    vertices[i * 3 + 2] = -44 + rand() * 48;
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xb6e9ff, size: 0.045, transparent: true, opacity: 0.8, depthWrite: false })); scene.add(stars);

  // Perspective guide lights on the floor reinforce physical depth without a texture or postprocessing.
  const segments = [];
  for (let i = -6; i <= 6; i++) { segments.push(i * 2.2, -4.77, 14, i * 0.7, -4.77, -25); }
  for (let i = 0; i < 20; i++) { const z = 10 - i * 2.15; const half = 7 + i * 0.25; segments.push(-half, -4.77, z, half, -4.77, z); }
  const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  const floorLines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0x4b93ab, transparent: true, opacity: 0.24 })); scene.add(floorLines);

  let raf = 0, last = null, elapsed = 0, flightTime = 0, flying = document.body.classList.contains('is-travelling'), pointerX = 0, pointerY = 0, active = true;
  const motion = () => !document.body.classList.contains('motion-off');
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (!raf && active) renderer.render(scene, camera);
  }
  function render(now) {
    raf = 0;
    if (!active || document.visibilityState === 'hidden' || !motion()) { last = null; return; }
    const delta = last === null ? 0 : Math.max(0, (now - last) / 1000);
    last = now; elapsed += delta;
    if (flying) flightTime += delta;
    const progress = flying ? Math.min(flightTime / 2.5, 1) : 0;
    const ease = progress * progress * (3 - 2 * progress);
    updateFragments(elapsed, ease);
    crystals.forEach(({ crystal, base }) => {
      crystal.position.x = base.x + base.side * ease * 3;
      crystal.position.y = base.y + Math.sin(elapsed * .45 + base.phase) * .23;
      crystal.rotation.y = elapsed * .28 + base.phase;
      crystal.rotation.z = Math.sin(elapsed * .32 + base.phase) * .25;
    });
    ribbonGroup.rotation.z = Math.sin(elapsed * .22) * .04;
    camera.position.x += ((flying ? 0 : pointerX * 0.75 + Math.sin(elapsed * .24) * .15) - camera.position.x) * 0.045;
    camera.position.y += ((1.6 + (flying ? 0 : pointerY * 0.35)) - camera.position.y) * 0.045;
    camera.position.z = 13 - ease * 19;
    camera.lookAt(0, 1, -8.5);
    stars.rotation.y = elapsed * 0.006;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }
  function start() { if (!raf && active && motion() && document.visibilityState !== 'hidden') { last = null; raf = requestAnimationFrame(render); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = null; }
  function reset() {
    flying = false; flightTime = 0; pointerX = 0; pointerY = 0;
    camera.position.set(0, 1.6, 13); camera.lookAt(0, 1, -8.5);
    updateFragments(elapsed, 0); if (active) renderer.render(scene, camera); start();
  }
  document.addEventListener('rj-portal-motion', () => {
    if (motion()) start(); else { stop(); reset(); stop(); }
  });
  document.addEventListener('rj-portal-flight', () => { flying = true; flightTime = 0; start(); });
  document.addEventListener('rj-portal-reset', reset);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop(); else start(); });
  window.addEventListener('pointermove', event => {
    if (!motion() || flying) return;
    pointerX = Math.max(-1, Math.min(1, event.clientX / Math.max(innerWidth, 1) * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, 1 - event.clientY / Math.max(innerHeight, 1) * 2));
  });
  window.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
  window.addEventListener('pointercancel', () => { pointerX = 0; pointerY = 0; });
  window.addEventListener('resize', resize);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); active = false; stop(); renderer.domElement.style.visibility = 'hidden';
    document.body.classList.remove('three-ready'); document.body.classList.add('three-fallback');
    if (notice) notice.textContent = 'Scena 3D jest niedostępna. Możesz nadal wejść do projektu.';
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    active = true; renderer.domElement.style.visibility = ''; document.body.classList.remove('three-fallback');
    document.body.classList.add('three-ready'); if (notice) notice.textContent = '';
    resize(); reset();
  });
  window.addEventListener('pagehide', event => {
    stop();
    if (!event.persisted) {
      active = false; renderer.dispose(); blockGeometry.dispose(); blockMaterial.dispose(); stripeMaterial.dispose();
      starGeometry.dispose(); stars.material.dispose(); lineGeometry.dispose(); floorLines.material.dispose();
      floor.geometry.dispose(); floor.material.dispose(); opening.geometry.dispose(); opening.material.dispose();
      crystalGeometry.dispose(); crystalEdges.dispose(); crystalMaterials.forEach(material => material.dispose()); crystalEdgeMaterial.dispose();
      ribbonGeometries.forEach(geometry => geometry.dispose()); ribbonMaterials.forEach(material => material.dispose());
    }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { active = true; reset(); } });
  // Small diagnostic surface; no tracking or device performance scoring.
  window.RJPortal3D = Object.freeze({ state: () => ({ available: active, moving: !!raf, flying, cameraZ: camera.position.z, cameraX: camera.position.x, fragments: count }) });
  updateFragments(0, 0); resize(); renderer.render(scene, camera);
  document.body.classList.add('three-ready');
  if (notice) notice.textContent = '';
  start();
}
