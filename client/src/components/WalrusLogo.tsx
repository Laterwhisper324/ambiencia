import React from 'react';

interface Props {
  size?: number;
  className?: string;
}

export const WalrusLogo: React.FC<Props> = ({ size = 36, className = '' }) => {
  return (
    <div
      className={`relative rounded-full flex items-center justify-center shrink-0 walrus-logo-base ${className}`}
      style={{
        width: size,
        height: size,
      }}
      title="Ambiência Engine"
    >
      {/* 1. Outer Rotating Conic Crimson Ring */}
      <div
        className="absolute inset-0 rounded-full walrus-conic-ring pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg, #ff334b, #cc001e 40%, transparent 60%, #ff334b 100%)',
        }}
      />

      {/* 2. Inner Dark Orb Cavity */}
      <div className="absolute inset-[2px] rounded-full bg-[#120204] overflow-hidden flex items-center justify-center">
        {/* Swirling Lava Blobs */}
        <div className="absolute w-[140%] h-[140%] walrus-blob-layer-1" />
        <div className="absolute w-[120%] h-[120%] walrus-blob-layer-2" />
        <div className="absolute w-[80%] h-[80%] rounded-full bg-gradient-to-tr from-[#cc001e] to-[#ff4760] walrus-core-pulse blur-[1px]" />

        {/* Specular curved reflection highlight */}
        <div className="absolute top-1 left-2 w-3.5 h-1.5 bg-white/50 rounded-full -rotate-45 blur-[0.5px] pointer-events-none" />
      </div>

      {/* 3. Outer Glass Rim Overlay */}
      <div className="absolute inset-0 rounded-full walrus-orb-rim pointer-events-none z-10" />
    </div>
  );
};
