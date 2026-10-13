declare module 'vanta/dist/vanta.waves.min.js' {
  import type * as THREE from 'three';

  export interface WavesEffect {
    destroy(): void;
    resize(): void;
    setOptions(options: { color: number }): void;
    renderer?: THREE.WebGLRenderer | null;
  }

  export default function waves(options: {
    el: HTMLElement;
    THREE: typeof THREE;
    color: number;
    shininess: number;
    waveHeight: number;
    waveSpeed: number;
    zoom: number;
    mouseControls: boolean;
    touchControls: boolean;
    gyroControls: boolean;
    minHeight: number;
    minWidth: number;
    scale: number;
    scaleMobile: number;
  }): WavesEffect;
}
