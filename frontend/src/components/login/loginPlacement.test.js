import { characterPlacement, educationPlacement } from './loginPlacement';
test.each([1440,1024,768,390])('education stays above and clear of the character at %i px', width => {
  const box = { top:225,left:20,right:190 };
  const p = educationPlacement(box,450,{width,height:844});
  expect(p.left).toBeGreaterThanOrEqual(12);
  expect(p.left+p.width).toBeLessThanOrEqual(width-12);
  expect(p.top+Math.min(450,p.maxHeight)).toBeLessThanOrEqual(box.top-14);
});
test('drag bounds keep character out of authentication and card regions', () => {
  const p = characterPlacement({
    zone:{left:40,right:420,top:230,bottom:610,width:380,height:380},
    copy:{bottom:225},footer:{top:680},header:{bottom:80},
    login:{left:1020,top:90,bottom:700},cards:{left:480,top:450,bottom:650},
    viewport:{width:1440,height:900},
  });
  expect(p.bounds.maxX+p.width/2).toBeLessThan(480);
  expect(p.bounds.minY-p.height).toBeGreaterThanOrEqual(225);
  expect(p.bounds.maxY).toBeLessThan(680);
});

test('a scrolling header cannot make an entirely offscreen mobile character visible', () => {
  const p = characterPlacement({
    zone:{left:16,right:374,top:-500,bottom:-250,width:358,height:250},
    copy:{bottom:-510},footer:{top:-180},header:{bottom:-740},
    login:{left:16,top:-120,bottom:410},cards:{left:16,top:440,bottom:620},
    viewport:{width:390,height:844},
  });
  expect(p.visible).toBe(false);
});
