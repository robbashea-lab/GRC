const expectErrorName=(operation,name)=>{
 let error;
 try{operation();}catch(caught){error=caught;}
 expect(error?.name).toBe(name);
};

test('native test encoding preserves all Latin1 bytes and strict browser input contracts',()=>{
 const bytes=String.fromCharCode(...Array.from({length:256},(_,index)=>index));
 const known='AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==';
 expect(btoa(bytes)).toBe(known);expect(atob(known)).toBe(bytes);
 expect(atob(' Y Q==\n')).toBe('a');expect(atob('YQ')).toBe('a');
 expect(btoa('café')).toBe('Y2Fm6Q==');
 for(const value of ['日本語','🔐','\ud800'])expectErrorName(()=>btoa(value),'InvalidCharacterError');
 for(const value of ['YQ=','YQ===','Y','!!!!','AA-_','AA\u00a0=='])expectErrorName(()=>atob(value),'InvalidCharacterError');
 expectErrorName(()=>atob(),'TypeError');expectErrorName(()=>btoa(),'TypeError');
});
