import {useNativeAsyncClock} from './nativeAsyncClock';

let restoreClock;
afterEach(() => restoreClock?.());

test('the lifecycle application clock preserves real async scheduling APIs', async () => {
  const nativePerformance = globalThis.performance;
  const nativeMicrotask = globalThis.queueMicrotask;
  const nativeNextTick = process.nextTick;
  restoreClock=useNativeAsyncClock();
  expect([globalThis.performance === nativePerformance,
    globalThis.queueMicrotask === nativeMicrotask, process.nextTick === nativeNextTick]).toEqual([true, true, true]);
  jest.setSystemTime(new Date('2030-01-01T12:00:00Z'));
  expect(Date.now()).toBe(Date.parse('2030-01-01T12:00:00Z'));
});

test('two clock lifetimes preserve real async progress, fake application timers and exact cleanup descriptors',async()=>{
  const {setImmediate:yieldEventLoop}=jest.requireActual('timers');
  const nativeDate=Date,nativePerformance=performance;
  const channels=[[globalThis,'performance'],[globalThis,'queueMicrotask'],[process,'nextTick']];
  const originals=channels.map(([target,key])=>Object.getOwnPropertyDescriptor(target,key));
  const storageMethods=['getItem','setItem','removeItem','clear','key'];
  const originalStorage=storageMethods.map(key=>Object.getOwnPropertyDescriptor(Storage.prototype,key));
  const expectNativeStorage=()=>storageMethods.forEach((key,index)=>
    expect(Object.getOwnPropertyDescriptor(Storage.prototype,key)).toEqual(originalStorage[index]));
  for(let cycle=0;cycle<2;cycle++){
    restoreClock=useNativeAsyncClock();
    channels.forEach(([target,key],index)=>expect(Object.getOwnPropertyDescriptor(target,key)).toEqual(originals[index]));
    expectNativeStorage();
    const start=Date.parse('2030-01-01T12:00:00Z');
    jest.setSystemTime(start);expect(Date.now()).toBe(start);
    expect(Date).not.toBe(nativeDate);
    const realStart=nativePerformance.now(),timeout=jest.fn(),interval=jest.fn();
    setTimeout(timeout,10);const repeating=setInterval(interval,5);
    const completed=[];
    queueMicrotask(()=>completed.push('microtask'));
    process.nextTick(()=>completed.push('nextTick'));
    const key='synthetic-native-clock-probe';sessionStorage.setItem(key,String(cycle));
    await new Promise(resolve=>yieldEventLoop(resolve));
    expect(completed.sort()).toEqual(['microtask','nextTick'].sort());
    expect(timeout).not.toHaveBeenCalled();expect(interval).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBe(String(cycle));
    // Installed JSDOM Storage dispatches through its host realm; only these two application timers are fake.
    expect(jest.getTimerCount()).toBe(2);
    jest.advanceTimersByTime(5);expect(interval).toHaveBeenCalledTimes(1);expect(timeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5);expect(interval).toHaveBeenCalledTimes(2);expect(timeout).toHaveBeenCalledTimes(1);
    expect(Date.now()).toBe(start+10);clearInterval(repeating);
    const fakeDay=24*60*60*1000;
    jest.advanceTimersByTime(fakeDay);expect(Date.now()).toBe(start+10+fakeDay);
    const realElapsed=nativePerformance.now()-realStart;
    expect(realElapsed).toBeGreaterThanOrEqual(0);expect(realElapsed).toBeLessThan(fakeDay);
    expect(sessionStorage.getItem(key)).toBe(String(cycle));expectNativeStorage();
    sessionStorage.removeItem(key);expect(sessionStorage.getItem(key)).toBeNull();
    jest.advanceTimersByTime(0);expect(jest.getTimerCount()).toBe(0);
    restoreClock();restoreClock=null;
    expect(Date).toBe(nativeDate);expect(performance).toBe(nativePerformance);
    channels.forEach(([target,channel],index)=>expect(Object.getOwnPropertyDescriptor(target,channel)).toEqual(originals[index]));
    expectNativeStorage();
  }
});
