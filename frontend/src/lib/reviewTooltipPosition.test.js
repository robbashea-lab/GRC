import {placeReviewTooltip} from './reviewTooltipPosition';

test('a first-month tooltip fits beside its bar without covering the anchor', () => {
  const position = placeReviewTooltip({anchorX:48,anchorY:220,width:280,height:240,viewportWidth:1440,viewportHeight:875});
  expect(position).toEqual({left:62,top:220});
  expect(position.left).toBeGreaterThan(48);
});

test('a last-month tooltip flips left when the right side would leave the viewport', () => {
  const position = placeReviewTooltip({anchorX:1390,anchorY:220,width:280,height:240,viewportWidth:1440,viewportHeight:875});
  expect(position).toEqual({left:1096,top:220});
  expect(position.left + 280).toBeLessThan(1390);
});

test('a narrow viewport keeps the measured tooltip within both horizontal edges', () => {
  const position = placeReviewTooltip({anchorX:190,anchorY:180,width:374,height:240,viewportWidth:390,viewportHeight:875});
  expect(position.left).toBe(8);
  expect(position.left + 374).toBe(382);
});

test('a busy tooltip near the bottom flips above its bar', () => {
  const position = placeReviewTooltip({anchorX:370,anchorY:840,width:300,height:350,viewportWidth:390,viewportHeight:875,topInset:64});
  expect(position).toEqual({left:56,top:490});
  expect(position.top + 350).toBe(840);
});

test('a tall measured tooltip stays below the header while retaining the bottom margin', () => {
  // The caller limits measured height to the space below the fixed header.
  const position = placeReviewTooltip({anchorX:160,anchorY:840,width:300,height:770,viewportWidth:390,viewportHeight:875,topInset:80});
  expect(position.top).toBe(88);
  expect(position.top + 770).toBeLessThanOrEqual(867);
});

test('a bar above the header inset cannot place its tooltip behind the header', () => {
  const position = placeReviewTooltip({anchorX:48,anchorY:20,width:280,height:240,viewportWidth:1440,viewportHeight:875,topInset:64});
  expect(position.top).toBe(72);
});
