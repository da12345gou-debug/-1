import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { MorphingTree } from './MorphingTree';
import { TreeState } from '../types';

interface SceneProps {
  treeState: TreeState;
}

export const Scene: React.FC<SceneProps> = ({ treeState }) => {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: false, toneMappingExposure: 1.5 }}
      shadows
    >
      <PerspectiveCamera makeDefault position={[0, 2, 20]} fov={45} />
      <OrbitControls 
        enablePan={false} 
        minDistance={8} 
        maxDistance={30}
        autoRotate={treeState === TreeState.TREE_SHAPE}
        autoRotateSpeed={0.5}
      />

      {/* Lighting - Dramatic and Warm */}
      <ambientLight intensity={0.2} color="#001100" />
      <spotLight 
        position={[10, 20, 10]} 
        angle={0.3} 
        penumbra={1} 
        intensity={2} 
        color="#fff0d0" 
        castShadow 
      />
      <pointLight position={[-10, 5, -10]} intensity={1} color="#0f5c42" />
      
      {/* Environment for Reflections */}
      <Environment preset="city" />
      
      {/* Background Ambience */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      {/* The Core Content */}
      <MorphingTree treeState={treeState} />

      {/* Post Processing for the "Cinematic Glow" */}
      <EffectComposer disableNormalPass>
        <Bloom 
          luminanceThreshold={0.8} 
          mipmapBlur 
          intensity={1.5} 
          radius={0.4} 
        />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
        <Noise opacity={0.02} />
      </EffectComposer>
    </Canvas>
  );
};