export function splitRoutingTargetDisplay(value: string): {
  minLabel: string | null;
  routingLabel: string | null;
  routingParts: string[];
} {
  const segments = value
    .split(' · ')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { minLabel: null, routingLabel: null, routingParts: [] };
  }

  if (segments[0].startsWith('min ')) {
    const routingParts = segments.slice(1);
    return {
      minLabel: segments[0],
      routingLabel:
        routingParts.length > 0 ? routingParts.join(' · ') : null,
      routingParts,
    };
  }

  return {
    minLabel: null,
    routingLabel: segments.join(' · '),
    routingParts: segments,
  };
}
