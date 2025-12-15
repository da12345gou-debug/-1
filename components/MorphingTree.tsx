import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState, ParticleData } from '../types';
import { ANIMATION_SPEED, COLORS } from '../constants';

interface MorphingTreeProps {
  treeState: TreeState;
}

// Reusable math for generating positions
const getRandomPointInSphere = (radius: number): [number, number, number] => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(Math.random()) * radius;
  const sinPhi = Math.sin(phi);
  return [
    r * sinPhi * Math.cos(theta),
    r * sinPhi * Math.sin(theta),
    r * Math.cos(phi)
  ];
};

const getConePoint = (h: number, maxR: number, yNorm: number): [number, number, number] => {
  // yNorm is 0 (bottom) to 1 (top)
  const y = (yNorm - 0.5) * h; // Center vertically
  const r = maxR * (1 - yNorm);
  const theta = Math.random() * Math.PI * 2;
  return [
    r * Math.cos(theta),
    y,
    r * Math.sin(theta)
  ];
};

export const MorphingTree: React.FC<MorphingTreeProps> = ({ treeState }) => {
  const needleRef = useRef<THREE.InstancedMesh>(null);
  const ornamentRef = useRef<THREE.InstancedMesh>(null);

  const NEEDLE_COUNT = 1800;
  const ORNAMENT_COUNT = 150;
  const TREE_HEIGHT = 12;
  const TREE_RADIUS = 4;
  const SCATTER_RADIUS = 15;

  // --- Data Generation ---

  const needlesData = useMemo(() => {
    const data: ParticleData[] = [];
    for (let i = 0; i < NEEDLE_COUNT; i++) {
      // Tree Shape: Distributed densely
      const yNorm = Math.pow(Math.random(), 0.8); // Bias slightly towards bottom
      const treePos = getConePoint(TREE_HEIGHT, TREE_RADIUS, yNorm);
      
      // Scatter Shape
      const scatterPos = getRandomPointInSphere(SCATTER_RADIUS);

      data.push({
        scatterPosition: scatterPos,
        treePosition: treePos,
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
        scale: 0.5 + Math.random() * 0.8,
        speed: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2
      });
    }
    return data;
  }, []);

  const ornamentsData = useMemo(() => {
    const data: ParticleData[] = [];
    for (let i = 0; i < ORNAMENT_COUNT; i++) {
      // Tree Shape: On surface of cone mostly
      const yNorm = Math.random();
      // Ensure on surface by not multiplying r by random factor, just using maxR at that height
      const y = (yNorm - 0.5) * TREE_HEIGHT;
      const r = TREE_RADIUS * (1 - yNorm) + 0.2; // +0.2 to pop out slightly
      const theta = Math.random() * Math.PI * 2 + (yNorm * 10); // Spiral effect
      const treePos: [number, number, number] = [
        r * Math.cos(theta),
        y,
        r * Math.sin(theta)
      ];

      const scatterPos = getRandomPointInSphere(SCATTER_RADIUS);

      data.push({
        scatterPosition: scatterPos,
        treePosition: treePos,
        rotation: [0, 0, 0],
        scale: 1 + Math.random() * 0.5,
        speed: 0.1 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2
      });
    }
    return data;
  }, []);

  // --- Animation Loop ---

  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Track current interpolation factor (0 = scattered, 1 = tree)
  const currentProgress = useRef(0);
  
  useFrame((state, delta) => {
    const targetProgress = treeState === TreeState.TREE_SHAPE ? 1 : 0;
    
    // Smooth dampening for the progress variable
    currentProgress.current = THREE.MathUtils.lerp(
      currentProgress.current,
      targetProgress,
      delta * ANIMATION_SPEED
    );

    const t = currentProgress.current;
    // Ease out elastic for a "snap" feel, or smoothstep for elegance. 
    // Let's use smoothstep for elegance.
    const easedT = THREE.MathUtils.smoothstep(t, 0, 1);

    // Animate Needles
    if (needleRef.current) {
      needlesData.forEach((particle, i) => {
        const { scatterPosition, treePosition, rotation, scale, speed, phase } = particle;

        // Current Position interpolation
        const x = THREE.MathUtils.lerp(scatterPosition[0], treePosition[0], easedT);
        const y = THREE.MathUtils.lerp(scatterPosition[1], treePosition[1], easedT);
        const z = THREE.MathUtils.lerp(scatterPosition[2], treePosition[2], easedT);

        // Add idle float noise (more intense when scattered)
        const time = state.clock.elapsedTime;
        const floatFactor = (1 - easedT) * 1.5 + 0.2; // Float more when scattered
        const noiseX = Math.sin(time * speed + phase) * floatFactor;
        const noiseY = Math.cos(time * speed * 0.8 + phase) * floatFactor;

        dummy.position.set(x + noiseX, y + noiseY, z);
        
        // Rotate needles to point outwards when in tree mode, random when scattered
        if (t > 0.8) {
             // Look at center (approximate) but inverted so they point out
             dummy.lookAt(0, y, 0);
             dummy.rotateY(Math.PI); // Point out
        } else {
             dummy.rotation.set(
                 rotation[0] + time * 0.1, 
                 rotation[1] + time * 0.1, 
                 rotation[2]
            );
        }

        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        needleRef.current!.setMatrixAt(i, dummy.matrix);
      });
      needleRef.current.instanceMatrix.needsUpdate = true;
    }

    // Animate Ornaments
    if (ornamentRef.current) {
      ornamentsData.forEach((particle, i) => {
        const { scatterPosition, treePosition, scale, speed, phase } = particle;

        const x = THREE.MathUtils.lerp(scatterPosition[0], treePosition[0], easedT);
        const y = THREE.MathUtils.lerp(scatterPosition[1], treePosition[1], easedT);
        const z = THREE.MathUtils.lerp(scatterPosition[2], treePosition[2], easedT);

        const time = state.clock.elapsedTime;
        const floatFactor = (1 - easedT) * 2.0 + 0.1;
        
        dummy.position.set(
            x + Math.sin(time * speed + phase) * floatFactor, 
            y + Math.cos(time * speed + phase) * floatFactor, 
            z
        );
        dummy.rotation.set(0, time * 0.2, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        ornamentRef.current!.setMatrixAt(i, dummy.matrix);
      });
      ornamentRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Needles: Deep Emerald, Rough but slightly metallic */}
      <instancedMesh ref={needleRef} args={[undefined, undefined, NEEDLE_COUNT]}>
        <coneGeometry args={[0.1, 0.8, 4]} /> 
        <meshStandardMaterial 
          color={COLORS.EMERALD_DARK} 
          roughness={0.4} 
          metalness={0.6}
          emissive={COLORS.EMERALD_LIGHT}
          emissiveIntensity={0.2}
        />
      </instancedMesh>

      {/* Ornaments: High Gloss Gold */}
      <instancedMesh ref={ornamentRef} args={[undefined, undefined, ORNAMENT_COUNT]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial 
          color={COLORS.GOLD_METALLIC} 
          roughness={0.05} 
          metalness={1} 
          envMapIntensity={2}
        />
      </instancedMesh>
    </group>
  );
};