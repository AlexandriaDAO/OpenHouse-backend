import React, { useRef, useEffect } from 'react';
import { Application } from 'pixi.js';
import { LAYOUT } from './pixi/LayoutConfig';
import { PlinkoController } from './PlinkoController';

interface PlinkoStageProps {
  rows: number;
  multipliers: number[];
  onControllerReady: (controller: PlinkoController) => void;
  onDropClick: () => void;
  disabled: boolean;
}

export const PlinkoStage: React.FC<PlinkoStageProps> = ({
  rows,
  multipliers,
  onControllerReady,
  onDropClick,
  disabled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const controllerRef = useRef<PlinkoController | null>(null);

  // Store callback refs to avoid stale closures
  const onDropClickRef = useRef(onDropClick);
  const onControllerReadyRef = useRef(onControllerReady);

  useEffect(() => {
    onDropClickRef.current = onDropClick;
    onControllerReadyRef.current = onControllerReady;
  }, [onDropClick, onControllerReady]);

  // Initialize Pixi application and controller
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let isDestroyed = false;

    const initApp = async () => {
      // Create Pixi application
      const app = new Application();

      try {
        await app.init({
          width: LAYOUT.CANVAS_WIDTH,
          height: LAYOUT.CANVAS_HEIGHT,
          backgroundColor: 0x0a0a14,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          preference: 'webgl',
          powerPreference: 'default',
        });
      } catch (err) {
        console.error('WebGL init failed, trying fallback:', err);
        await app.init({
          width: LAYOUT.CANVAS_WIDTH,
          height: LAYOUT.CANVAS_HEIGHT,
          backgroundColor: 0x0a0a14,
          antialias: false,
          resolution: 1,
          autoDensity: false,
          preference: 'webgl',
        });
      }

      // Check if destroyed during async init
      if (isDestroyed) {
        app.destroy(true, { children: true, texture: true });
        return;
      }

      // Configure canvas
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      // Handle WebGL context loss
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost');
      });
      canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored');
      });

      appRef.current = app;

      // Create controller
      const controller = new PlinkoController(app, {
        rows,
        multipliers,
        onDropClick: () => {
          onDropClickRef.current();
        },
      });

      await controller.init();

      // Check if destroyed during async init
      if (isDestroyed) {
        controller.destroy();
        app.destroy(true, { children: true, texture: true });
        return;
      }

      controllerRef.current = controller;

      // Notify parent that controller is ready
      onControllerReadyRef.current(controller);
    };

    initApp().catch(console.error);

    // Cleanup
    return () => {
      isDestroyed = true;
      if (controllerRef.current) {
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
    };
  }, [rows]); // Only re-init if rows change

  // Update multipliers when they change
  useEffect(() => {
    if (controllerRef.current && multipliers.length > 0) {
      controllerRef.current.updateMultipliers(multipliers);
    }
  }, [multipliers]);

  // Update interactive state when disabled changes
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setDropEnabled(!disabled);
    }
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
};
