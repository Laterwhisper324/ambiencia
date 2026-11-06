import React, { useEffect, useState } from 'react';

export const InteractiveBackground: React.FC = () => {
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: -1000, y: -1000 });

  useEffect(() => {
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        setCoords({ x: e.clientX, y: e.clientY });
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none"
      aria-hidden="true"
      style={{ zIndex: 0 }}
    >
      {/* Base Escannord Hard-Rabbit-4 Dark Dotted Pattern */}
      <div className="absolute inset-0 escannord-dots-base" />

      {/* Reactive Red Proximity Overlay (fades opacity outward from mouse center) */}
      <div
        className="absolute inset-0 escannord-dots-glow"
        style={{
          WebkitMaskImage: `radial-gradient(circle 260px at ${coords.x}px ${coords.y}px, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.75) 35%, rgba(0, 0, 0, 0.25) 70%, rgba(0, 0, 0, 0) 100%)`,
          maskImage: `radial-gradient(circle 260px at ${coords.x}px ${coords.y}px, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.75) 35%, rgba(0, 0, 0, 0.25) 70%, rgba(0, 0, 0, 0) 100%)`,
        }}
      />

      {/* Soft crimson ambient lighting follower */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle 320px at ${coords.x}px ${coords.y}px, rgba(204, 0, 30, 0.08), transparent 75%)`,
        }}
      />
    </div>
  );
};
