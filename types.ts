export enum TreeState {
  SCATTERED = 'SCATTERED',
  TREE_SHAPE = 'TREE_SHAPE'
}

export interface ParticleData {
  scatterPosition: [number, number, number];
  treePosition: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  speed: number; // For individual movement noise
  phase: number; // For individual movement noise
}

export interface TreeConfig {
  needleCount: number;
  ornamentCount: number;
  treeHeight: number;
  treeRadius: number;
  scatterRadius: number;
}