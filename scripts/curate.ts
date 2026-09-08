/** Evidence-reviewed catalog corrections. Run after db:migrate and initial sync. */
import { pool } from '../src/lib/db';
import { setSuccessor } from '../src/lib/lifecycle';
import { event } from '../src/lib/sync';
const c=await pool.connect();
try {
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(782134)');
 const models=async(name:string)=>(await c.query("SELECT * FROM models WHERE lower(name)=lower($1) AND kind='model' ORDER BY id",[name])).rows;
 const one=async(name:string)=>{const rows=await models(name);if(rows.length!==1)throw new Error(`Expected exactly one model: ${name}, got ${rows.length}`);return rows[0];};
 async function field(id:string,key:string,value:unknown,url:string,evidence:string){
  if(!['description_ko','inputs','outputs','runtime_requirements','weights_license'].includes(key))throw new Error('Unsupported curation field');
  await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,$2,$3,'official',$4,$5) ON CONFLICT(model_id,field,origin,url) DO UPDATE SET value=excluded.value,evidence=excluded.evidence,checked_at=now()",[id,key,JSON.stringify(value),evidence,url]);
  await c.query(`UPDATE models SET ${key}=$2,updated_at=now() WHERE id=$1 AND NOT overrides ? $3`,[id,value,key]);
 }
 async function repo(name:string,url:string,evidenceUrl:string,evidence:string){
  for(const m of await models(name)){
   const r=(await c.query('INSERT INTO code_repositories(url) VALUES($1) ON CONFLICT(url) DO UPDATE SET url=excluded.url RETURNING id',[url])).rows[0];
   const linked=await c.query("INSERT INTO model_repositories(model_id,repository_id,link_origin,active) VALUES($1,$2,'official',true) ON CONFLICT(model_id,repository_id) DO UPDATE SET link_origin='official',active=true WHERE model_repositories.link_origin<>'official' RETURNING *",[m.id,r.id]);
   await c.query("INSERT INTO enrichment_jobs(repository_id) VALUES($1) ON CONFLICT(repository_id) DO UPDATE SET next_run=now()",[r.id]);
   await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,'official_code_link',$2,'official',$3,$4) ON CONFLICT(model_id,field,origin,url) DO UPDATE SET evidence=excluded.evidence,checked_at=now()",[m.id,JSON.stringify(url),evidence,evidenceUrl]);
   await c.query("UPDATE models SET accessibility=ARRAY(SELECT DISTINCT unnest(accessibility||ARRAY['코드 공개'])) WHERE id=$1",[m.id]);
   if(linked.rowCount)await event(c,m.id,null,null,'code_released',`${m.name} · 공식 구현 링크 보완`,null,{url,evidenceUrl});
  }
 }
 await repo('AntBO','https://github.com/huawei-noah/HEBO','https://github.com/huawei-noah/HEBO/tree/master/AntBO','공식 HEBO 저장소의 AntBO 디렉터리에 AntBO 논문 구현과 실행 안내가 있다. 사용 범위는 AntBO 하위 디렉터리이며 다른 HEBO 알고리즘과 구분한다.');
 await repo('AlphaFold-Multimer','https://github.com/google-deepmind/alphafold','https://github.com/google-deepmind/alphafold#running-alphafold-multimer','공식 AlphaFold README의 Running AlphaFold-Multimer에서 다중 서열 FASTA와 --model_preset=multimer 사용법을 제공한다.');
 await repo('RNAFM','https://github.com/ml4bio/RNA-FM','https://github.com/ml4bio/RNA-FM','공식 README가 카탈로그와 같은 arXiv:2204.00300 논문을 인용하고 RNA-FM 구현·사전학습 모델의 사용법을 제공한다.');
 await repo('AbLang','https://github.com/oxpig/AbLang','https://github.com/oxpig/AbLang','공식 구현에서 AbLang 논문 Bioinformatics Advances vbac046을 인용한다. 출판사 페이지와 DOI로 분리된 같은 이름의 두 항목에 동일 구현을 연결한다.');
 await repo('AIDO.RNA','https://github.com/genbio-ai/ModelGenerator','https://github.com/genbio-ai/AIDO','공식 AIDO README가 AIDO.RNA와 해당 사전학습 모델의 downstream utility layer를 AIDO.ModelGenerator 저장소로 안내한다.');
 await repo('protpardelle-1c','https://github.com/ProteinDesignLab/protpardelle-1c','https://github.com/ProteinDesignLab/protpardelle-1c','공식 구현이 Conditional Protein Structure Generation with Protpardelle-1C, DOI 10.1101/2025.08.18.670959를 인용한다.');
 const changes=[
  {old:'DNABERT',next:'DNABERT-2',scope:'DNA 서열의 범용 표현 학습·새 프로젝트에서 2세대를 우선 탐색',caveats:'다종 유전체 학습과 토크나이저가 달라 기존 미세조정 가중치를 그대로 교체할 수는 없다. 원래 DNABERT 재현과 특화 작업에는 이전 항목을 참조한다. DNABERT-S는 별도 목적이므로 유지한다.',evidence:'원저자 DNABERT README의 2023-06-26 공지가 DNABERT-2를 더 효율적이고 사용하기 쉬운 2세대로 소개하고 새 패키지 사용을 권장한다.',url:'https://github.com/jerryji1993/DNABERT#update-20230626'},
  {old:'ESM-1b',next:'ESM-2 / ESMFold',scope:'단일 단백질 서열의 범용 표현·구조 관련 작업에서 ESM-2를 우선 탐색',caveats:'후속 항목의 ESM-2 부분에 해당하는 관계다. ESMFold와 동일 기능이라는 뜻은 아니며 모델 크기·임베딩 차원·계산량이 달라진다. 변이 효과 특화 ESM-1v와 역접힘 ESM-IF1은 유지한다.',evidence:'공식 ESM README가 ESM-2를 범용 단백질 언어모델로 소개하고 시험한 여러 단일 서열 모델보다 구조 예측 작업에서 좋은 결과를 보고한다. 이를 해당 범위의 탐색 우선순위 근거로 사용한다.',url:'https://github.com/facebookresearch/esm'},
  {old:'AbLang',next:'AbLang2',scope:'항체의 비생식세포계열 잔기 예측·변이 제안에서 AbLang2를 우선 탐색',caveats:'특정 변이 제안 목적의 후속 모델이며 모든 임베딩·복원 작업에서 우월하다는 뜻은 아니다. paired/unpaired 학습과 API 차이가 있어 기존 AbLang 분석 재현에는 이전 정보를 사용한다. 같은 논문을 가리키는 두 AbLang 항목을 함께 보관한다.',evidence:'공식 AbLang2 README가 germline 편향을 줄이는 비생식세포계열 잔기 예측 목적과 paired/unpaired 학습, 다양한 유효 변이 제안 결과를 설명한다.',url:'https://github.com/oxpig/AbLang2'},
  {old:'Protpardelle',next:'protpardelle-1c',scope:'모티프 스캐폴딩·조건부 단백질 구조 생성에서 업데이트된 1c 모델을 우선 탐색',caveats:'단일 사슬·다중 사슬, backbone·all-atom 목적에 맞는 체크포인트를 선택해야 한다. 기존 논문 재현과 동일 샘플러 설정의 호환성을 보장하지 않는다.',evidence:'공식 Protpardelle-1c README가 기존 Protpardelle의 업데이트 모델임을 밝히고 모티프 스캐폴딩 개선과 다중 사슬 지원을 설명한다.',url:'https://github.com/ProteinDesignLab/protpardelle-1c'}
 ];
 for(const x of changes){const next=await one(x.next);for(const old of await models(x.old)){
  if(!(await c.query('SELECT 1 FROM model_relations WHERE predecessor_id=$1 AND successor_id=$2',[old.id,next.id])).rowCount)await setSuccessor(c,{predecessorId:old.id,successorId:next.id,scope:x.scope,caveats:x.caveats,evidence:x.evidence,evidenceUrl:x.url,hide:true});
 }}
 const rna=await one('RNAFM');await field(rna.id,'description_ko','RNA 서열에서 잔기별 표현을 추출해 구조·기능 예측에 활용하는 사전학습 RNA 언어모델.','https://github.com/ml4bio/RNA-FM','공식 README의 RNA-FM 소개와 RNA 임베딩 추출 사용 예제.');await field(rna.id,'inputs',['RNA 염기 서열'],'https://github.com/ml4bio/RNA-FM','공식 quick start의 서열 입력 예제.');await field(rna.id,'outputs',['잔기별 RNA 임베딩'],'https://github.com/ml4bio/RNA-FM','공식 quick start의 representation 출력.');
 const af=await one('AlphaFold-Multimer');await field(af.id,'inputs',['여러 단백질 서열을 담은 FASTA'],'https://github.com/google-deepmind/alphafold#running-alphafold-multimer','공식 multimer 실행 안내.');await field(af.id,'outputs',['단백질 복합체의 예측 3차원 구조'],'https://github.com/google-deepmind/alphafold#running-alphafold-multimer','공식 multimer 모델의 예측 목적.');
 await c.query('COMMIT');console.log('공식 코드 링크 및 후속 모델 메모 적용 완료');
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
