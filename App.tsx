import React, { useState } from 'react';
import { Scene } from './components/Scene';
import { UIOverlay } from './components/UIOverlay';
import { TreeState } from './types';

function App() {
  const [treeState, setTreeState] = useState<TreeState>(TreeState.TREE_SHAPE);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Scene Layer */}
      <div className="absolute inset-0 z-0">
        <Scene treeState={treeState} />
      </div>

      {/* UI Overlay Layer */}
      <UIOverlay treeState={treeState} setTreeState={setTreeState} />
    </div>
  );
}

export default App;