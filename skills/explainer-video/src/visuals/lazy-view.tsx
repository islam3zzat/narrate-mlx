import React from 'react';
import {continueRender, delayRender} from 'remotion';

/** Lazy-load a 2D/3D visual view while holding Remotion's frame paint via delayRender. */
export function lazyView<P extends Record<string, any>>(
  loader: () => Promise<{default: React.FC<P>}>,
  label: string,
): React.FC<P> {
  const Comp = React.lazy(() => {
    const handle = delayRender(`lazy:${label}`);
    return loader().finally(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => continueRender(handle)));
    });
  }) as React.ComponentType<any>;
  return (props: P) => (
    <React.Suspense fallback={null}>
      <Comp {...props} />
    </React.Suspense>
  );
}
