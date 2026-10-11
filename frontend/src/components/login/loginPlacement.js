export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Geometry is presentation-only. The safe area excludes the form, cards and headline.
export function characterPlacement({ zone, copy, footer, login, cards, viewport, header }) {
  const mobile = viewport.width <= 760;
  const wide = viewport.width >= 1200;
  const unit = mobile ? 1 : clamp(viewport.width * .0003125 + viewport.height * .000555, .85, 2.25);
  const height = Math.max(140, Math.min(zone.height, zone.width * (wide ? 1.1 : mobile ? .85 : .8) * 1.5, 470 * unit));
  const width = height * 2 / 3;
  const x = wide ? zone.left + zone.width / 2 : zone.left + Math.max(width / 2 + 2, zone.width * .3);
  const y = zone.bottom;
  let right = Math.min(zone.right, viewport.width - 12);
  for (const obstacle of [login, cards]) {
    if (obstacle.top < zone.bottom && obstacle.bottom > zone.top) right = Math.min(right, obstacle.left - 12);
  }
  return {
    x, y, width, height, unit, mobile,
    visible: zone.bottom > Math.max(0, header.bottom) && zone.top < viewport.height - 30,
    bounds: {
      minX: Math.min(x, zone.left + width / 2), maxX: Math.max(x, right - width / 2),
      minY: Math.min(y, Math.max(copy.bottom + height + 12, header.bottom + height + 12)),
      maxY: Math.max(y, Math.min(footer.top - 46 * unit, viewport.height - 60 * unit)),
    },
  };
}

export function educationPlacement(character, panelHeight, viewport) {
  const width = Math.min(460, viewport.width - 24);
  const maxHeight = Math.max(0, character.top - 26);
  return {
    width, maxHeight,
    left: clamp((character.left + character.right) / 2 - width / 2, 12, viewport.width - width - 12),
    top: Math.max(12, character.top - 14 - Math.min(panelHeight, maxHeight)),
  };
}
