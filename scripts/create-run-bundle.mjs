// Short-path runtime distribution. Historical evidence remains in the full Git repository.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const excludedTests = ['test/planning-comparison.test.mjs','test/run-bundle.test.mjs'];
function git(repo,...args) { return execFileSync('git',args,{cwd:repo,maxBuffer:32*1024*1024}); }
function crc32(bytes) {
  let value=0xffffffff;
  for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}
  return (value^0xffffffff)>>>0;
}

/** Standard non-ZIP64 STORE archive; fixed timestamps make output reproducible. No dependencies. */
export function makeZip(files) {
  assert.ok(files.length>0&&files.length<=4096,'Bundle file count is out of bounds');
  assert.ok(files.reduce((n,f)=>n+f.data.length,0)<=32*1024*1024,'Bundle is too large');
  const local=[],central=[];let offset=0;
  for(const {path,data} of files){
    assert.ok(path.startsWith('adtf-run/')&&path.length<=140&&!path.includes('\\')&&!path.split('/').some(x=>!x||x==='..'||/[<>:"|?*\x00-\x1f]|[. ]$/.test(x)),'Unsafe/long Windows bundle path');
    const name=Buffer.from(path,'utf8'),crc=crc32(data);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(33,12);
    h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(33,14);
    c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
    local.push(h,name,data);central.push(c,name);offset+=h.length+name.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}

export function buildRunBundle(repo,ref='HEAD') {
  assert.equal(resolve(git(repo,'rev-parse','--show-toplevel').toString().trim()),resolve(repo),'Build bundles from the full Git checkout');
  assert.ok(!ref.startsWith('-'),'Invalid source ref');
  const commit=git(repo,'rev-parse','--verify',`${ref}^{commit}`).toString().trim();assert.match(commit,/^[a-f0-9]{40}$/);
  const entries=git(repo,'ls-tree','-rz','--full-tree',commit).toString().split('\0').filter(Boolean);
  const source=new Map();
  for(const entry of entries){
    const [metadata,path]=entry.split('\t');const [mode,type]=metadata.split(' ');
    const allowed=['package.json','package-lock.json','tsconfig.json'].includes(path)||path.startsWith('src/')||path.startsWith('examples/')||path.startsWith('test/')&&!excludedTests.includes(path);
    if(!allowed)continue;
    assert.ok(type==='blob'&&['100644','100755'].includes(mode),'Bundle cannot include links/submodules');
    source.set(path,git(repo,'show',`${commit}:${path}`));
  }
  for(const p of ['package.json','package-lock.json','tsconfig.json','examples/review-evidence-live/run.mjs'])assert.ok(source.has(p),`Missing runtime source: ${p}`);
  const originalPackage=source.get('package.json');const pkg=JSON.parse(originalPackage);
  assert.ok(pkg.scripts.test.startsWith('npm run build && node --test '),'Review test command before packaging');
  for(const p of excludedTests)pkg.scripts.test=pkg.scripts.test.replaceAll(` ${p}`,'');
  delete pkg.scripts['bundle:windows']; // Building distributions requires Git; running this one does not.
  source.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)+'\n'));
  source.set('README.md',Buffer.from(`# ADTF 실행용 패키지\n\n소스 기준 커밋: ${commit}\n\nWindows 탐색기 경로 문제를 줄인 실행 패키지입니다. 과거 시험 원자료·문서는 전체 저장소에 보존하며 이 ZIP에는 넣지 않았습니다. src·예제·잠금파일은 기준 커밋의 원본 그대로입니다. package.json은 과거 원자료/배포도구 검사를 제외한 테스트 명령만 조정했습니다. 전체 저장소 테스트와 실행 패키지 테스트의 범위를 구분하세요.\n\n1. ZIP을 C:\\adtf에 풀고 package.json이 있는 adtf-run 폴더에서 PowerShell을 엽니다.\n2. npm.cmd ci\n3. npm.cmd run eval:review-evidence -- generate --run-live --bundle\n\n3번은 실제 Gemini 유료 요청 최대5회입니다. 기존 PC ADC 인증을 사용하며 로그인 코드/토큰을 전달하지 않습니다. 별도 CALL 입력은 없습니다. RESULT_ARCHIVE의 tar.gz 파일 하나를 전달하세요. 실패하면 generate를 반복하지 말고 기록을 보존하세요.\n\n모델 호출 없는 확인은 npm.cmd test 또는 npm.cmd run eval:review-evidence -- dry-run --bundle 입니다. TEST/STUB은 실제 모델 품질 근거가 아닙니다.\n\n기존 작업 폴더/실행 결과/인증정보를 이 폴더에 복사하지 마세요. 전체 소스와 과거 기록: https://github.com/yungoonkim/create_agent\n`));
  const manifest={schemaVersion:1,kind:'short_path_runtime_bundle',sourceCommit:commit,root:'adtf-run',
    excluded:['docs/','Git metadata','node_modules/','dist/','.adtf/','credentials',...excludedTests],
    testScope:'Offline source/runtime tests; historical-archive and distribution-builder tests require full repository',
    packageScriptAdjustmentOnly:true,originalPackageSha256:sha(originalPackage),
    files:Object.fromEntries([...source].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,bytes])=>[name,sha(bytes)]))};
  source.set('bundle-manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
  const files=[...source].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,data])=>({path:`adtf-run/${path}`,data}));
  return {bytes:makeZip(files),manifest,files:files.length,maxPathLength:Math.max(...files.map(x=>x.path.length))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');const opts={};
  for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];assert.ok(['--ref','--output'].includes(key)&&!opts[key]&&process.argv[i+1],'Use --ref REV and --output NEW.zip');opts[key]=process.argv[i+1];}
  const bundle=buildRunBundle(repo,opts['--ref']);const out=resolve(repo,opts['--output']??'downloads/adtf-run.zip');
  await mkdir(dirname(out),{recursive:true});await writeFile(out,bundle.bytes,{flag:'wx'});
  await writeFile(`${out}.sha256`,`${sha(bundle.bytes)}  ${out.split(/[\\/]/).at(-1)}\n`,{flag:'wx'});
  console.log(JSON.stringify({file:out,sourceCommit:bundle.manifest.sourceCommit,files:bundle.files,maxZipPathLength:bundle.maxPathLength,sha256:sha(bundle.bytes)}));
}
