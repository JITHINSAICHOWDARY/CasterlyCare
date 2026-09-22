import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// Real anatomical layers as the login page's cursor-reactive centerpiece: a
// skeleton (BodyParts3D/Z-Anatomy, via BodyExplorer, CC BY-SA) plus a
// cardiovascular system (Anatria-3D, CC BY-SA 4.0) — see footer credit.
// Cursor speed drives spin (fidget-spinner momentum); prefers-reduced-motion
// gets a static frame, no listeners, no render loop.
// Real anatomical colours, not a stylized/monochrome palette: arteries red,
// veins blue, heart deep red — the way an actual medical reference looks.
// Vessel nodes are individually named ("...artery", "...vein", "Left atrium", …),
// so each type gets its real colour instead of one flat tone.
function classifyVesselColor(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('vein') || n.includes('venous') || n.includes('venule') || n.includes('sinus')) return 0x2a5ba8; // vein — blue
  if (n.includes('atrium') || n.includes('ventricle') || n.includes('valve') || n.includes('heart')) return 0x9c2b2b; // heart muscle — deep red
  return 0xc8342a; // artery / unlabeled trunk — red
}

// Near-opaque, not the ~0.72-0.75 this had for the old dark stage — that
// translucency read as a deliberate "glowing scan" against near-black, but
// against the bright sky it just looks faded, with sky-blue bleeding
// through the bone. A real anatomical reference is solid, not a ghost.
const SKELETON_LAYER = { url: '/models/skeleton.glb', color: () => 0xe8dcc4, opacity: 0.96 }; // bone — ivory
const CARDIOVASCULAR_LAYER = { url: '/models/cardiovascular.glb', color: classifyVesselColor, opacity: 0.94 };

export default function AnatomyModel({ className }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 1.22, 5.0); // closer again (zoom) + raised further so the skull keeps its headroom margin

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Capped at 1x, not 2x — this now runs alongside CloudSky's own WebGL
    // canvas on the same page, and doubling both at once was the main
    // source of the lag.
    renderer.setPixelRatio(1);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaee2ec, 0.7);
    fill.position.set(-4, -1, 4);
    scene.add(fill);

    const group = new THREE.Group();
    group.position.x = -0.61; // rescaled to match the same apparent screen position at the new camera distance (z: 6.0 -> 5.0)
    scene.add(group);

    // The cardiovascular layer ships Draco-compressed (KHR_draco_mesh_compression,
    // required) — without this, GLTFLoader silently fails to produce geometry for it.
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    let disposed = false;

    function loadGltf(url) {
      return new Promise((resolve, reject) => loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject));
    }

    // Real anatomical colours, not a stylized/hologram palette — matches how
    // an actual medical reference looks.
    function paint(model, color, opacity) {
      const loadedAt = performance.now();
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.material = new THREE.MeshPhysicalMaterial({
          color: color(node.name),
          transparent: true,
          opacity: reduceMotion ? opacity : 0,
          roughness: 0.35,
          metalness: 0.05,
          clearcoat: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        node.userData.targetOpacity = opacity;
        node.userData.loadedAt = loadedAt;
      });
      group.add(model);
      if (reduceMotion) renderer.render(scene, camera);
    }

    // Compute a scale/center that fits a model to a known standing height and centers it.
    function fitTransform(model) {
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const scale = 5.2 / (size.y || 1);
      return { scale, center };
    }

    function applyTransform(model, { scale, center }) {
      model.scale.setScalar(scale);
      model.position.sub(center.clone().multiplyScalar(scale));
    }

    async function loadAll() {
      const skeletonPromise = loadGltf(SKELETON_LAYER.url)
        .then((model) => {
          if (disposed) return;
          // BodyExplorer's converter left this Z-up (verified against the
          // glb's own accessor bounds), with no corrective transform.
          model.rotation.x = -Math.PI / 2;
          applyTransform(model, fitTransform(model));
          paint(model, SKELETON_LAYER.color, SKELETON_LAYER.opacity);
        })
        .catch((err) => console.warn('Anatomy layer failed to load:', SKELETON_LAYER.url, err)); // eslint-disable-line no-console

      const cardioPromise = loadGltf(CARDIOVASCULAR_LAYER.url)
        .then((cardio) => {
          if (disposed) return;
          applyTransform(cardio, fitTransform(cardio));
          paint(cardio, CARDIOVASCULAR_LAYER.color, CARDIOVASCULAR_LAYER.opacity);
        })
        .catch((err) => console.warn('Anatomy layer failed to load:', CARDIOVASCULAR_LAYER.url, err)); // eslint-disable-line no-console

      await Promise.all([skeletonPromise, cardioPromise]);
    }

    loadAll();

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Fidget-spinner mechanic: the model's spin SETS to the cursor's current
    // speed (px/ms, not just raw distance moved — a slow drag across the
    // whole screen must not spin as hard as a quick short flick), then coasts
    // and decays back toward a gentle idle spin once the cursor stops/leaves.
    const idleSpinSpeed = 0.03;
    const maxSpinSpeed = 0.75;
    const flickSensitivity = 0.32; // rad/frame per px/ms of cursor speed
    const coastFriction = 0.978;
    let spinVelocity = idleSpinSpeed;
    let lastPointerX = null;
    let lastPointerT = null;
    let targetTilt = 0;

    function onPointerMove(e) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const now = performance.now();
      if (lastPointerX !== null && lastPointerT !== null) {
        const dt = now - lastPointerT;
        if (dt > 0) {
          const speedPxPerMs = (x - lastPointerX) / dt;
          const target = Math.max(-maxSpinSpeed, Math.min(maxSpinSpeed, speedPxPerMs * flickSensitivity));
          // Light smoothing only to absorb per-event timing jitter, not to add lag.
          spinVelocity += (target - spinVelocity) * 0.5;
        }
      }
      lastPointerX = x;
      lastPointerT = now;
      targetTilt = (((e.clientY - rect.top) / rect.height) * 2 - 1) * -0.3;
    }
    function onPointerLeave() {
      lastPointerX = null;
      lastPointerT = null;
      targetTilt = 0;
    }

    let raf = null;
    let tilt = 0;

    function frame(t) {
      raf = requestAnimationFrame(frame);
      // Decay toward the idle speed each frame — the "coast" after a flick.
      spinVelocity = idleSpinSpeed + (spinVelocity - idleSpinSpeed) * coastFriction;
      tilt = targetTilt;
      group.rotation.y += spinVelocity;
      group.rotation.x = tilt;
      group.traverse((node) => {
        if (node.isMesh && node.userData.loadedAt) {
          const target = node.userData.targetOpacity;
          node.material.opacity = Math.min(target, ((t - node.userData.loadedAt) / 500) * target);
        }
      });
      renderer.render(scene, camera);
    }

    if (reduceMotion) {
      group.rotation.set(0.03, -0.35, 0);
      renderer.render(scene, camera); // layers not loaded yet; each load callback re-renders once it arrives
    } else {
      container.addEventListener('pointermove', onPointerMove, { passive: true });
      container.addEventListener('pointerleave', onPointerLeave, { passive: true });
      raf = requestAnimationFrame(frame);
    }

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      ro.disconnect();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      scene.traverse((node) => {
        if (node.isMesh) {
          node.geometry.dispose();
          node.material.dispose();
        }
      });
      renderer.dispose();
      dracoLoader.dispose();
    };
  }, []);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
