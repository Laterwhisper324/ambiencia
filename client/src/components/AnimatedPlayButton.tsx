import React from 'react';

interface AnimatedPlayButtonProps {
  isPlaying: boolean;
  onToggle: () => void;
  title?: string;
  disabled?: boolean;
}

/**
 * Animated Play/Pause button from Uiverse.io by MuhammadHasann (popular-seahorse-73),
 * adapted to the Ambiência carmine-red & obsidian palette.
 */
export const AnimatedPlayButton: React.FC<AnimatedPlayButtonProps> = ({
  isPlaying,
  onToggle,
  title,
  disabled = false,
}) => {
  return (
    <div
      className={`popular-seahorse-cont ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      title={title || (isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)')}
    >
      <input
        className="toggle-input"
        id="popular-seahorse-play-toggle"
        name="popular-seahorse-play-toggle"
        type="checkbox"
        checked={isPlaying}
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={disabled}
      />
      <label
        className="toggle-label"
        htmlFor="popular-seahorse-play-toggle"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-label={title || (isPlaying ? 'Pausar' : 'Reproduzir')}
      >
        <div className="cont-label-play">
          <span className="label-play" />
        </div>
      </label>
    </div>
  );
};
