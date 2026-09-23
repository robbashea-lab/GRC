import {readEvidenceFile} from './evidenceFile';
import * as api from './api';
jest.mock('./api',()=>({__esModule:true,PREVIEW_MODE:true}));
jest.mock('sonner',()=>({toast:{info:jest.fn()}}));
afterEach(()=>{jest.restoreAllMocks();api.PREVIEW_MODE=true;});
test('Demo size rejection occurs before allocating a FileReader',async()=>{
 const reader=jest.spyOn(window,'FileReader');
 await expect(readEvidenceFile(new File(['x'.repeat(1048577)],'large.txt'))).rejects.toMatchObject({storage_code:'FILE_TOO_LARGE'});
 expect(reader).not.toHaveBeenCalled();
});
test('small Demo evidence can be read',async()=>{
 await expect(readEvidenceFile(new File(['demo'],'small.txt',{type:'text/plain'}))).resolves.toBe('data:text/plain;base64,ZGVtbw==');
});
test('standard mode does not apply the Demo upload limit',async()=>{
 api.PREVIEW_MODE=false;
 await expect(readEvidenceFile(new File(['x'.repeat(1048577)],'real.txt'))).resolves.toMatch(/^data:/);
});
