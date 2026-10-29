// Import before installing fake timers. Jest 27 ignores the newer doNotFake option.
const nativeChannels=[
  [globalThis,'performance'],[globalThis,'queueMicrotask'],[process,'nextTick'],
].map(([target,key])=>({target,key,descriptor:Object.getOwnPropertyDescriptor(target,key)}));

function restoreNativeChannels(){
  for(const {target,key,descriptor} of nativeChannels){
    if(descriptor)Object.defineProperty(target,key,descriptor);
    else delete target[key];
  }
}

export function useNativeAsyncClock(){
  const cleanup=()=>{
    // Sinon may delete an early-restored queueMicrotask during uninstall.
    try{jest.useRealTimers();}finally{restoreNativeChannels();}
  };
  try{
    jest.useFakeTimers('modern');
    restoreNativeChannels();
    return cleanup;
  }catch(error){cleanup();throw error;}
}
