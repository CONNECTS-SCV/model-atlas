import { parseDocument, isSeq } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { hash, normalizeName, paperIdentifier, repoUrl, safeUrl } from './identity';
import type { Entry, Kind, TreeFile } from './types';

type Node = {type:string;value?:string;url?:string;depth?:number;children?:Node[];position?:{start:{line:number;offset:number};end:{line:number;offset:number}}};
const txt=(n:Node):string=>n.value??(n.children??[]).map(txt).join('');
const nodes=(n:Node,type:string):Node[]=>[...(n.type===type?[n]:[]),...(n.children??[]).flatMap(c=>nodes(c,type))];
const uniq=(a:string[])=>[...new Set(a.filter(Boolean))];
const arr=(v:unknown):string[]=>Array.isArray(v)?v.filter(x=>typeof x==='string'):typeof v==='string'?[v]:[];
const urls=(v:unknown[])=>uniq(v.flat().map(safeUrl).filter((s):s is string=>!!s));
function infer(text:string, fallback:string[]) {
 const t=text.toLowerCase();
 const matches=(rules:[RegExp,string][])=>rules.filter(([r])=>r.test(t)).map(([,s])=>s);
 const targets=matches([[/small.molecul|drug.design|ligand|molecular optimization/,'소분자'],[/protein|polypeptide/,'단백질'],[/antibod|cdr/,'항체'],[/vhh|nanobod/,'VHH'],[/peptide/,'펩타이드'],[/macrocycl/,'macrocycle'],[/enzyme/,'효소'],[/\bdna\b|genom/,'DNA'],[/\brna\b|rna_/,'RNA']]);
 const tasks=matches([[/generat|de.novo|design/,'생성'],[/inverse.fold|scaffold.to.sequence|structure.to.sequence/,'inverse folding'],[/folding|structure.predict|cofold|refold|complex.predict/,'refold/cofold'],[/dock/,'도킹'],[/evaluat|benchmark|scoring|fitness|prediction/,'평가'],[/optim|maturation/,'최적화'],[/dynamics|simulation|force.field|potential/,'시뮬레이션']]);
 const purposes=matches([[/binder/,'binder 설계'],[/cdr/,'CDR 설계'],[/affinity/,'친화도 개선'],[/developab/,'개발가능성'],[/rna.*design/,'RNA 서열 설계']]);
 const conditions=matches([[/target.structure|structure.condition/,'표적 구조'],[/epitope/,'epitope'],[/motif/,'motif'],[/framework/,'framework'],[/pocket/,'pocket'],[/property.condition|desired.propert/,'원하는 물성']]);
 const algorithms=matches([[/diffusion/,'diffusion'],[/flow.match/,'flow matching'],[/autoregressive/,'autoregressive'],[/gradient|backpropagation|hallucination/,'gradient optimization'],[/reinforcement|\brl\b/,'RL'],[/transformer/,'Transformer']]);
 return {targets:targets.length?targets:fallback,tasks,purposes,conditions,algorithms};
}
function base(name:string,title:string,kind:Kind,text:string,fallback:string[]):Entry {
 const tags=infer(text,fallback);
 return {key:'',name,aliases:[],kind,title,paperUrls:[],codeUrls:[],...tags,accessibility:[],description_ko:`${tags.targets.join('·')||'대상 미확인'} 분야의 ${tags.tasks.join('·')||'작업 미확인'} ${kind==='model'?'모델':kind==='tool'?'도구':'자료'}.`,first_public_date:null,publication_date:null,weights_url:null,demo_url:null,family:['germinal','opengerminal'].includes(normalizeName(name))?'Germinal':null,version:null,inputs:[],outputs:[],organization:null,runtime_requirements:null,code_license:null,weights_license:null,data_license:null,experimental_evidence:null,metadata:{classification:'inferred',summary:'rule-based; source title and section'},location:'',raw:null,needsReview:false};
}
const validDate=(v:unknown)=>typeof v==='string'&&/^\d{4}([.-]\d{2}){0,2}$/.test(v)?v.replaceAll('.','-'):null;

export function selectFiles(adapter:string,tree:TreeFile[]):TreeFile[] {
 const blobs=tree.filter(x=>x.type==='blob');
 let selected:TreeFile[]=[];
 if(adapter==='antibody') selected=blobs.filter(x=>/^data\/(methods|databases|software|reading)\/[^/]+\.ya?ml$/.test(x.path));
 else if(adapter==='nucleotide') selected=blobs.filter(x=>/^data\/(models|benchmarks|surveys)\.yaml$/.test(x.path));
 else if(adapter==='molecular') selected=blobs.filter(x=>/^(README|Molecular_Optimization)\.md$/i.test(x.path));
 else selected=blobs.filter(x=>/^README\.md$/i.test(x.path));
 if(!selected.length) throw new Error(`Adapter ${adapter}: expected source files missing; previous data preserved`);
 if(adapter==='nucleotide'&&!selected.some(x=>x.path==='data/models.yaml'))throw new Error('Nucleotide models.yaml missing');
 return selected;
}

export function parseStructured(adapter:string,path:string,content:string):Entry[] {
 const doc=parseDocument(content,{uniqueKeys:true,maxAliasCount:0} as never);
 if(doc.errors.length) throw new Error(`YAML parse error: ${doc.errors[0].message}`);
 const rows=doc.toJS({maxAliasCount:0});
 if(!Array.isArray(rows)||!rows.length)throw new Error('Expected nonempty YAML list');
 const result:Entry[]=[];
 for(let i=0;i<rows.length;i++) {
  const r=rows[i];
  if(!r||typeof r.name!=='string'||!r.name.trim())throw new Error(`Invalid name at ${path}[${i}]`);
  const nuc=adapter==='nucleotide';const title=r.title||r.paper?.title||r.name;
  let kind:Kind=path.includes('databases/')?'dataset':path.includes('reading/')||path.includes('surveys')?'review':path.includes('benchmarks')?'benchmark':path.includes('software/')?'tool':'model';
  if(r.category==='ml_library')kind='library';
  if(path.includes('methods/')&&kind==='model'){
   const evidence=[r.name,title,...arr(r.tags),...arr(r.keywords)].join(' ').toLowerCase();
   const ml=/neural|deep.learning|machine.learning|language.model|protein.language|diffusion|flow.match|transformer|autoencoder|autoregressive|inverse.fold|graph.network|graph.attention|contrastive.learning|generative.model|variational|lstm|\bcnn\b|\bgnn\b|\bbert\b|\besm\b|random.forest|support.vector|gaussian.process|transfer.learning|message.passing|supervised|boosting|score.match|score.based|hallucination|backpropagation|gan\b|mpnn|deformation.field/.test(evidence);
   if(/software.tool|python.bindings/.test(evidence))kind='tool';
   else if(!ml&&/force.field|water.model|empirical.energy|numbering|community.standards|canonical.structures|molecular.dynamics|replica.exchange|metadynamics|end.state.methods|framework.selection|display.librar|sequencing.landscape|conformational.selection/.test(evidence))kind=(r.code?.url||r.url)?'tool':'paper';
  }
  if(kind==='model'&&(/\breview\b|\bsurvey\b/i.test(title)))kind='review';
  if(kind==='model'&&(/\bdatabase\b|\bdataset\b/i.test(title)))kind='dataset';
  const text=[title,r.route,...arr(r.routes),...arr(r.tags),...arr(r.keywords),r.domain,...arr(r.domains),r.architecture,r.objective].join(' ');
  const e=base(r.name,title,kind,text,nuc?[]:path.includes('methods/')?['항체']:[]);
  e.aliases=arr(r.aliases);e.key=String(r.id||normalizeName(r.name));
  e.paperUrls=urls([r.paper_url,r.first_public_url,nuc&&kind!=='model'?r.url:null,r.paper?.doi?`https://doi.org/${r.paper.doi}`:null,r.paper?.arxiv?`https://arxiv.org/abs/${r.paper.arxiv}`:null,r.paper?.biorxiv?`https://doi.org/10.1101/${r.paper.biorxiv}`:null,r.doi?`https://doi.org/${r.doi}`:null,...arr(r.key_papers).map(x=>`https://doi.org/${x}`)]);
  e.codeUrls=urls([r.code_url,r.code?.url,kind==='tool'?repoUrl(r.url||''):null]).map(x=>repoUrl(x)||x).filter(x=>!x.startsWith('https://github.com/')||!!repoUrl(x));
  e.weights_url=safeUrl(r.weights_url||r.weights?.url);e.demo_url=safeUrl(r.demo_url||(kind==='tool'?r.url:null));
  e.first_public_date=validDate(r.first_public_date);e.publication_date=validDate(r.publication_date);
  e.accessibility=[...(e.codeUrls.length?['코드 공개']:[]),...(e.weights_url?['가중치 공개']:[]),...(r.access==='commercial'?['상용 서비스']:[])];
  e.family=r.family||e.family;e.version=r.version?String(r.version):null;
  e.inputs=arr(r.inputs);e.outputs=arr(r.outputs);e.organization=r.organization||null;
  e.runtime_requirements=r.runtime_requirements||(arr(r.platforms).length?'지원 환경: '+arr(r.platforms).join(', '):null);
  e.metadata={...e.metadata,kind_evidence:path.includes('methods/')?'원문 소프트웨어·표준·물리 방법 태그로 분류; 나머지는 원본 모델 분류 유지':'원본 자료 경로',source_summary:r.summary||null,reported_year:r.year||null,roles:path.includes('software/')||kind==='tool'||kind==='library'||arr(r.tags).some(t=>/software_tool|sequence_numbering/.test(String(t)))?['tool']:[],reported_code_status:r.code?.status||null,reported_code_license:r.code?.license||r.license||null,reported_weights_license:r.weights?.license||null,reported_data_license:r.data_license||null,parameters:r.parameters||null,context_length:r.context_length||null,architecture:r.architecture||null,lineage_children:r.lineage_children||[],domain:r.domain||null};
  const range=isSeq(doc.contents)?doc.contents.items[i]?.range:null;
  const line=range?content.slice(0,range[0]).split('\n').length:i+1;
  e.location=`L${line}`;e.raw=r;result.push(e);
 }
 return result;
}

export function parseMarkdown(adapter:string,path:string,content:string):Entry[] {
 const ast=unified().use(remarkParse).use(remarkGfm).parse(content) as Node;
 const headings:string[]=[];const result:Entry[]=[];
 function add(n:Node,following:Node[]=[]) {
  const section=headings.filter(Boolean).join(' / ');
  const toolSection=/engines|frameworks|visualization|trajectory processing|package/i.test(headings.filter(Boolean).at(-1)||'');
  const bold=nodes(n,'strong')[0];const primary=nodes(n,'link').find(l=>safeUrl(l.url)&&!String(l.url).includes('shields.io'));
  if(!bold&&!(toolSection&&primary))return;
  const title=txt(bold||primary!).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();if(title.length<2)return;
  const all=[n,...following];const links=all.flatMap(x=>nodes(x,'link')).filter(l=>safeUrl(l.url));
  const paperLinks=links.filter(l=>!/code|github|data|website|project|supplement|demo|weight|slide|video/i.test(txt(l))&&/arxiv|doi\.org|biorxiv|nature\.com|science\.org|openreview|aclanthology|pmlr|pubmed|academic\.oup|wiley|springer|sciencedirect|ieee|acm\.org|cell\.com|chemrxiv|liebertpub/i.test(l.url||''));
  const codes=uniq(links.filter(l=>/^(code|github|source|implementation)/i.test(txt(l).trim())||!!repoUrl(l.url!)).map(l=>repoUrl(l.url!)||l.url!).filter(x=>!x.startsWith('https://github.com/')||!!repoUrl(x)));
  if(!paperLinks.length){
   if(!toolSection||!links.length||title.length>70)return;
   const e=base(title,title,'tool',section+' '+all.map(txt).join(' '),[]);e.key='tool:'+normalizeName(title);e.codeUrls=codes;e.demo_url=links.find(l=>!repoUrl(l.url!))?.url||null;e.accessibility=codes.length?['코드 공개']:['웹사이트 제공'];e.location=`L${n.position!.start.line}-L${all.at(-1)!.position!.end.line}`;e.metadata={...e.metadata,section,roles:['tool'],source_summary:all.map(txt).join(' ')};e.raw={title,text:all.map(txt).join('\n'),links:links.map(l=>({label:txt(l),url:l.url}))};result.push(e);return;
  }
  let kind:Kind=/review|survey/i.test(section)||/\breview\b|\bsurvey\b/i.test(title)?'review':/dataset/i.test(section)?'dataset':/benchmark/i.test(section)?'benchmark':/package|framework|engine|visualization/i.test(section)?'library':'paper';
  let name=title;const prefix=title.match(/^([\w][\w .+\-/]{1,38}):\s/);
  if(prefix&&prefix[1].split(' ').length<=4&&!/^(a |the |toward|review|beyond|from |machine learning|deep learning)/i.test(prefix[1]))name=prefix[1];
  if(name===title) {
   const candidates=codes.map(x=>x.split('/').at(-1)!).filter(x=>x.length>=3&&x.length<=35&&normalizeName(title).includes(normalizeName(x)));
   if(candidates.length===1)name=candidates[0];
  }
  if(kind==='paper'&&name!==title)kind='model';
  const e=base(name,title,kind,`${section} ${title}`,adapter==='protein'?['단백질']:adapter==='molecular'?['소분자']:[]);
  if(adapter==='protein'&&/scaffold.to.sequence|structure.to.sequence/i.test(section)){e.inputs=['단백질 구조'];e.outputs=['아미노산 서열'];}
  e.paperUrls=uniq(paperLinks.map(l=>l.url!));e.codeUrls=codes;e.accessibility=codes.length?['코드 공개']:[];
  e.key=hash([normalizeName(name),paperIdentifier(e.paperUrls[0])]).slice(0,32);
  e.location=`L${n.position!.start.line}-L${all.at(-1)!.position!.end.line}`;
  e.metadata={...e.metadata,section,reported_year:all.map(txt).join(' ').match(/\b(20\d{2})\b/)?.[1]||null};
  e.raw={title,text:all.map(txt).join('\n'),links:links.map(l=>({label:txt(l),url:l.url}))};e.needsReview=kind==='paper';result.push(e);
 }
 const children=ast.children||[];
 for(let i=0;i<children.length;i++) {
  const n=children[i];
  if(n.type==='heading'){headings.length=n.depth!;headings[n.depth!-1]=txt(n);continue;}
  if(n.type==='list')for(const item of n.children||[])add(item);
  else if(n.type==='paragraph'&&nodes(n,'strong').length) {
   const following:Node[]=[];
   for(let j=i+1;j<children.length&&children[j].type==='paragraph'&&!nodes(children[j],'strong').length;j++)following.push(children[j]);
   add(n,following);
  }
 }
 if(!result.length)throw new Error(`No paper entries parsed from ${path}; refusing deletion`);
 // Repeated listings under different headings retain every source location and merge inferred tags.
 const unique=new Map<string,Entry>();
 for(const e of result){const p=unique.get(e.key);if(p){p.location+=`, ${e.location}`;for(const k of ['targets','tasks','algorithms','purposes','conditions','paperUrls','codeUrls'] as const)p[k]=uniq([...p[k],...e[k]]);}else unique.set(e.key,e);}
 return [...unique.values()];
}
export const parseFile=(adapter:string,path:string,content:string)=>['antibody','nucleotide'].includes(adapter)?parseStructured(adapter,path,content):parseMarkdown(adapter,path,content);
export const semantic=(e:Entry)=>{const {raw,location,...rest}=e;void raw;void location;return rest;};
