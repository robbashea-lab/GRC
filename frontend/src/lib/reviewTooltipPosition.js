// Coordinates are measured in the viewport; the chart's record/projection model is unchanged.
export function placeReviewTooltip({anchorX,anchorY,width,height,viewportWidth,viewportHeight,topInset=0,margin=8,gap=14}) {
  const beside = anchorX + gap;
  const preferredLeft = beside + width <= viewportWidth - margin ? beside : anchorX - width - gap;
  const left = Math.max(margin,Math.min(preferredLeft,viewportWidth-width-margin));
  const preferredTop = anchorY + height <= viewportHeight - margin ? anchorY : anchorY - height;
  const top = Math.max(topInset+margin,Math.min(preferredTop,viewportHeight-height-margin));
  return {left,top};
}
