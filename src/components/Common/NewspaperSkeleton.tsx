import React from 'react';

export const NewspaperSkeleton: React.FC = () => {
  return (
    <div className="newspaper-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
      {/* Front Page Lead Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10 pb-10 border-b border-theme-border">
        {/* Lead story */}
        <div className="lg:col-span-8 lg:border-r lg:border-theme-border lg:pr-8">
          <div className="flex items-center justify-between mb-3">
            <div className="h-3 w-36 bg-theme-card rounded" />
            <div className="h-3 w-16 bg-theme-card rounded" />
          </div>
          <div className="h-8 sm:h-12 w-11/12 bg-theme-card rounded mb-3" />
          <div className="h-8 sm:h-12 w-3/4 bg-theme-card rounded mb-4" />
          <div className="w-full aspect-[21/9] bg-theme-card rounded mb-4" />
          <div className="space-y-2 mb-4">
            <div className="h-4 w-full bg-theme-card rounded" />
            <div className="h-4 w-5/6 bg-theme-card rounded" />
          </div>
          <div className="flex justify-between items-center pt-2">
            <div className="flex gap-2">
              <div className="h-4 w-16 bg-theme-card rounded" />
              <div className="h-4 w-16 bg-theme-card rounded" />
            </div>
            <div className="h-4 w-24 bg-theme-card rounded" />
          </div>
        </div>

        {/* Right column briefs */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="h-4 w-32 bg-theme-card rounded mb-2" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="pb-4 border-b border-theme-border last:border-b-0">
              <div className="flex justify-between mb-2">
                <div className="h-3 w-20 bg-theme-card rounded" />
                <div className="h-3 w-12 bg-theme-card rounded" />
              </div>
              <div className="h-5 w-full bg-theme-card rounded mb-2" />
              <div className="h-5 w-4/5 bg-theme-card rounded mb-2" />
              <div className="h-3 w-full bg-theme-card rounded mb-1" />
              <div className="h-3 w-2/3 bg-theme-card rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 Skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="aspect-video w-full bg-theme-card rounded" />
            <div className="h-4 w-full bg-theme-card rounded" />
            <div className="h-4 w-3/4 bg-theme-card rounded" />
            <div className="h-3 w-1/2 bg-theme-card rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};
