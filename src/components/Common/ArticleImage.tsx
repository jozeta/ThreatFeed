import React, { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { getEditorialPlaceholder } from '../../utils/imagePlaceholder';
import { ShieldAlert, Terminal, Cpu } from 'lucide-react';

interface ArticleImageProps {
  src?: string;
  alt: string;
  sourceName: string;
  category: string;
  aspectClass?: string;
  className?: string;
}

export const ArticleImage: React.FC<ArticleImageProps> = ({
  src,
  alt,
  sourceName,
  category,
  aspectClass = 'aspect-video',
  className = '',
}) => {
  const { settings } = useSettings();
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // If user disabled images in settings
  if (settings.imageBehavior === 'hidden') {
    return null;
  }

  const placeholder = getEditorialPlaceholder(sourceName, category);

  if (!src || loadFailed) {
    return (
      <div
        className={`w-full overflow-hidden flex flex-col items-center justify-center relative select-none ${aspectClass} ${className}`}
        style={{ background: placeholder.bgGradient }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        <div className="flex flex-col items-center text-center p-4 z-10">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mb-2.5 opacity-80 border border-white/10"
            style={{ backgroundColor: `${placeholder.accent}22`, color: placeholder.accent }}
          >
            {category.toLowerCase().includes('vuln') ? (
              <ShieldAlert className="w-5 h-5" />
            ) : category.toLowerCase().includes('red') ? (
              <Terminal className="w-5 h-5" />
            ) : (
              <Cpu className="w-5 h-5" />
            )}
          </div>
          <span className="font-mono text-[10px] tracking-widest font-semibold opacity-70 uppercase text-white/80">
            {placeholder.label}
          </span>
          <span className="text-xs font-serif italic text-white/50 mt-0.5 max-w-[200px] truncate">
            {sourceName}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden bg-theme-surface ${aspectClass} ${className}`}>
      {/* Loading Skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-theme-card animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setLoadFailed(true)}
        className={`w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-105 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
