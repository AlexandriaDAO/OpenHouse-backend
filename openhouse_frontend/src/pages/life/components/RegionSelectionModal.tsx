/**
 * Region Selection Modal Component
 *
 * Allows players to choose their elemental faction
 * before joining the game.
 *
 * IMPROVEMENTS:
 * - Clear indication of taken regions
 * - Proper server selection integration
 * - Accessibility improvements
 */

import React, { useRef, useEffect } from 'react';
import type { RegionInfo, RiskServer } from '../../lifeConstants';
import { REGIONS, PLAYER_COLORS } from '../../lifeConstants';

// Textured cell preview for region cards
const TexturedCellPreview: React.FC<{
  regionId: number;
  size?: number;
  className?: string;
}> = ({ regionId, size = 64, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Draw a simple colored preview (actual texture would need the texture system)
    const color = PLAYER_COLORS[regionId] || '#888888';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    // Add some visual interest
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillRect(i * size / 8, j * size / 8, size / 8, size / 8);
        }
      }
    }
  }, [regionId, size]);

  return (
    <canvas
      ref={canvasRef}
      className={`rounded-lg ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

interface RegionSelectionModalProps {
  isOpen: boolean;
  takenRegions: Set<number>;
  servers: RiskServer[];
  selectedServer: RiskServer;
  activeServers: Record<string, boolean>;
  error: string | null;
  onSelectRegion: (region: RegionInfo) => void;
  onSelectServer: (server: RiskServer) => void;
  onCancel?: () => void;
}

export const RegionSelectionModal: React.FC<RegionSelectionModalProps> = ({
  isOpen,
  takenRegions,
  servers,
  selectedServer,
  activeServers,
  error,
  onSelectRegion,
  onSelectServer,
}) => {
  if (!isOpen) return null;

  const regions = Object.values(REGIONS);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] gap-6 p-4">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold text-white mb-2">Choose Your Region</h1>
        <p className="text-gray-400">Select an elemental faction to command</p>
      </div>

      {/* Server selector */}
      <div className="flex gap-2 mb-2">
        {servers.map((server) => (
          <button
            key={server.id}
            type="button"
            onClick={() => onSelectServer(server)}
            className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${
              selectedServer.id === server.id
                ? 'bg-white/20 text-white border border-white/50'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            {server.name}
            {activeServers[server.id] && <span className="ml-1 text-green-400">●</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Region grid - 2 rows of 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl">
        {regions.map((region) => {
          const isTaken = takenRegions.has(region.id);

          return (
            <button
              key={region.id}
              type="button"
              onClick={() => {
                if (!isTaken) {
                  onSelectRegion(region);
                }
              }}
              disabled={isTaken}
              className={`
                relative p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3
                ${isTaken
                  ? 'bg-gray-900/50 border-gray-700/50 opacity-50 cursor-not-allowed'
                  : 'bg-black/40 border-white/20 hover:border-opacity-100 cursor-pointer hover:scale-105'
                }
              `}
              style={{
                borderColor: isTaken ? undefined : PLAYER_COLORS[region.id],
              }}
            >
              {/* Textured preview */}
              <TexturedCellPreview
                regionId={region.id}
                size={64}
                className={isTaken ? 'opacity-50 grayscale' : ''}
              />

              {/* Region name */}
              <span
                className={`text-lg font-bold ${isTaken ? 'text-gray-500' : ''}`}
                style={{ color: isTaken ? undefined : PLAYER_COLORS[region.id] }}
              >
                {region.name}
              </span>

              {/* Taken indicator */}
              {isTaken && (
                <span className="absolute top-2 right-2 text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
                  TAKEN
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* All regions taken message */}
      {takenRegions.size >= regions.length && (
        <div className="text-center text-gray-400 mt-4">
          <p>All regions are currently occupied.</p>
          <p className="text-sm">Wait for a spot to open up or try a different server.</p>
        </div>
      )}
    </div>
  );
};

export default RegionSelectionModal;
