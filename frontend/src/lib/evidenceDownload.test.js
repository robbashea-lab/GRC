import {downloadEvidence} from './evidenceContext';
import api from './api';

jest.mock('./api',()=>({__esModule:true,default:{get:jest.fn()}}));

let anchors,blobs,click,originalCreate,originalRevoke;
const readBytes=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve([...new Uint8Array(reader.result)]);reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(blob);
});
beforeEach(()=>{
  anchors=[];blobs=[];api.get.mockReset();
  originalCreate=URL.createObjectURL;originalRevoke=URL.revokeObjectURL;
  URL.createObjectURL=jest.fn(blob=>{blobs.push(blob);return 'blob:evidence-attachment';});
  URL.revokeObjectURL=jest.fn();
  click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){anchors.push({href:this.href,filename:this.download});});
});
afterEach(()=>{
  click.mockRestore();
  if(originalCreate===undefined)delete URL.createObjectURL;else URL.createObjectURL=originalCreate;
  if(originalRevoke===undefined)delete URL.revokeObjectURL;else URL.revokeObjectURL=originalRevoke;
});

test.each([
  ['raw binary',[0,1,127,128,254,255],null],
  ['binary data URL',[0,1,127,128,254,255],'data:application/octet-stream;base64,'],
  ['UTF-8 raw',[...Buffer.from('café ✓ 日本語\n','utf8')],null],
  ['UTF-8 FileReader-form data URL',[...Buffer.from('café ✓ 日本語\n','utf8')],'data:text/plain;charset=utf-8;base64,'],
])('%s preserves exact bytes, server filename and encoded resource identity',async(_label,bytes,prefix)=>{
  const response=Object.freeze({filename:'résumé QA 01.txt',mime_type:'text/html',content_base64:(prefix||'')+Buffer.from(bytes).toString('base64')});
  api.get.mockResolvedValue({data:response});
  await downloadEvidence({evidence_id:'evidence:/qa?x#1',filename:'catalog-name-must-not-replace-server-name.txt'});
  expect(api.get).toHaveBeenCalledTimes(1);expect(api.get).toHaveBeenCalledWith('/evidence/evidence%3A%2Fqa%3Fx%231/download');
  expect(anchors).toEqual([{href:'blob:evidence-attachment',filename:response.filename}]);
  expect(blobs).toHaveLength(1);expect(blobs[0].type).toBe('application/octet-stream');expect(blobs[0].size).toBe(bytes.length);
  expect(await readBytes(blobs[0])).toEqual(bytes);
  expect(response.mime_type).toBe('text/html');
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:evidence-attachment');
});

test.each(['','data:application/octet-stream;base64,'])('valid empty attachment %j remains downloadable',async content_base64=>{
  api.get.mockResolvedValue({data:{filename:'empty.txt',content_base64}});
  await downloadEvidence({evidence_id:'empty'});
  expect(blobs[0].size).toBe(0);expect(await readBytes(blobs[0])).toEqual([]);expect(anchors).toHaveLength(1);
});

test.each([undefined,null,42,{},'not_base64!','data:text/plain,unencoded text','data:text/plain;base64,%41'])('malformed content %j fails before creating a URL or clicking an attachment',async content_base64=>{
  api.get.mockResolvedValue({data:{filename:'invalid.txt',content_base64}});
  await expect(downloadEvidence({evidence_id:'invalid'})).rejects.toThrow(/Evidence file content/);
  expect(URL.createObjectURL).not.toHaveBeenCalled();expect(URL.revokeObjectURL).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();
});

test('API denial propagates unchanged without attempting a browser download',async()=>{
  const denied=Object.assign(new Error('Forbidden'),{response:{status:403}});api.get.mockRejectedValue(denied);
  await expect(downloadEvidence({evidence_id:'denied'})).rejects.toBe(denied);
  expect(URL.createObjectURL).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

test('a failed native anchor click still revokes the URL and propagates the failure',async()=>{
  api.get.mockResolvedValue({data:{filename:'sample.txt',content_base64:'eA=='}});
  const failure=new Error('Native click failed');click.mockImplementation(()=>{throw failure;});
  await expect(downloadEvidence({evidence_id:'sample'})).rejects.toBe(failure);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:evidence-attachment');
});
