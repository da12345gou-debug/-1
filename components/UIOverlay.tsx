import React from 'react';
import { TreeState } from '../types';

interface UIOverlayProps {
  treeState: TreeState;
  setTreeState: (state: TreeState) => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({ treeState, setTreeState }) => {
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-8 md:p-12 z-10">
      
      {/* Header */}
      <header className="flex flex-col items-center md:items-start space-y-2">
        <h1 className="text-4xl md:text-6xl font-serif text-transparent bg-clip-text bg-gradient-to-b from-[#FFD700] to-[#B8860B] drop-shadow-lg tracking-wider">
          ARIX
        </h1>
        <p className="text-[#a4cbb4] font-light tracking-[0.2em] text-xs md:text-sm uppercase">
          Signature Interactive Holiday Experience
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-col items-center pointer-events-auto space-y-6">
        <div className="flex space-x-8 bg-black/30 backdrop-blur-md p-4 rounded-full border border-[#FFD700]/30 shadow-[0_0_30px_rgba(255,215,0,0.1)]">
          <button
            onClick={() => setTreeState(TreeState.SCATTERED)}
            className={`
              relative px-8 py-3 rounded-full text-sm font-bold tracking-widest transition-all duration-500 overflow-hidden
              ${treeState === TreeState.SCATTERED 
                ? 'text-black bg-[#FFD700]' 
                : 'text-[#FFD700] hover:bg-[#FFD700]/10'}
            `}
          >
            <span className="relative z-10">SCATTER</span>
            {treeState === TreeState.SCATTERED && (
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            )}
          </button>

          <button
            onClick={() => setTreeState(TreeState.TREE_SHAPE)}
            className={`
              relative px-8 py-3 rounded-full text-sm font-bold tracking-widest transition-all duration-500 overflow-hidden
              ${treeState === TreeState.TREE_SHAPE 
                ? 'text-black bg-[#FFD700]' 
                : 'text-[#FFD700] hover:bg-[#FFD700]/10'}
            `}
          >
            <span className="relative z-10">GATHER</span>
            {treeState === TreeState.TREE_SHAPE && (
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            )}
          </button>
        </div>

        <p className="text-[#FFD700]/60 text-xs font-serif italic max-w-md text-center">
          "Witness the convergence of luxury and light."
        </p>
      </div>

      {/* Footer / Branding */}
      <div className="text-center md:text-right">
         <span className="text-[#0f5c42] text-xs tracking-widest opacity-50">EST. 2024 • WEBGL EXPERIENCE</span>
      </div>
    </div>
  );
};