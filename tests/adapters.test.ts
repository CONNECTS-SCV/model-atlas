import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMarkdown,parseStructured,selectFiles,semantic } from '../src/lib/adapters';
import { paperIdentifier,namesCompatible,hash,safeUrl } from '../src/lib/identity';
const markdown=`# Protein design\n## Diffusion models\n* **RFdiffusion: Protein generation** [2023]\n  [paper](https://arxiv.org/abs/2301.12345v1) | [code](https://github.com/RosettaCommons/RFdiffusion)\n\n* **RFpeptides: Macrocycle generation** [2024]\n  [paper](https://doi.org/10.1000/peptides) | [code](https://github.com/RosettaCommons/RFdiffusion)\n`;
test('DOI and arXiv normalization preserves identity across versions',()=>{
 assert.equal(paperIdentifier('https://doi.org/10.48550/arXiv.2301.12345v2'),'arxiv:2301.12345');
 assert.equal(paperIdentifier('https://arxiv.org/pdf/2301.12345v3.pdf'),'arxiv:2301.12345');
 assert.equal(paperIdentifier('https://www.biorxiv.org/content/10.1101/2025.01.01.123456v2'),'doi:10.1101/2025.01.01.123456');
});
test('independent named implementations are never name-normalized into one',()=>{
 for(const [a,b] of [['Germinal','OpenGerminal'],['Proteina','Proteina-Complexa'],['RFdiffusion','RFpeptides']])assert.equal(namesCompatible(a,b),false);
 const entries=parseMarkdown('protein','README.md',markdown);
 const [g]=parseStructured('antibody','data/methods/design.yaml','- name: OpenGerminal\n  paper:\n    title: Open-source implementation of the Germinal pipeline\n');assert.equal(g.family,'Germinal');
 assert.equal(entries.length,2);assert.notEqual(entries[0].name,entries[1].name);assert.equal(entries[0].codeUrls[0],entries[1].codeUrls[0]);
});
test('structured adapters exclude generated catalogs, candidates and metadata',()=>{
 const files=['README.md','docs/catalog.md','data/index.json','data/methods/folding.yaml','data/models.yaml','data/catalog.yaml','data/candidates.yaml','data/excluded.yaml'].map(path=>({path,type:'blob',sha:'a'}));
 assert.deepEqual(selectFiles('antibody',files).map(x=>x.path),['data/methods/folding.yaml']);
 assert.deepEqual(selectFiles('nucleotide',files).map(x=>x.path),['data/models.yaml']);
});
test('source license claims are not promoted to officially verified license',async()=>{
 const es=parseStructured('antibody','data/methods/generative_design.yaml',await readFile('tests/fixtures/antibody.yaml','utf8'));
 const m=es.find(x=>x.name==='Absci HER2 De Novo')!;
 assert.equal(m.code_license,null);assert.equal(m.metadata.reported_code_license,'BSD-3-Clause');
 assert.equal(m.first_public_date,null);assert.equal(es.find(x=>x.name==='AbDesign')!.kind,'dataset');
});
test('format-only changes produce identical semantic hashes',()=>{
 const a=parseMarkdown('protein','README.md',markdown);
 const b=parseMarkdown('protein','README.md','\n\n'+markdown.replace('Protein generation','Protein  generation'));
 assert.deepEqual(a.map(x=>hash(semantic(x))),b.map(x=>hash(semantic(x))));
});
test('failed, empty or ambiguous YAML schemas fail closed',()=>{
 for(const s of ['[]','foo: bar','- name: Good\n  name: Bad','- other: no-name'])assert.throws(()=>parseStructured('antibody','data/methods/x.yaml',s));
 assert.throws(()=>parseMarkdown('protein','README.md','# Missing all entries'));
});
test('nucleotide keeps month date precision and separates publication date',()=>{
 const [e]=parseStructured('nucleotide','data/models.yaml',"- name: DNATest\n  title: Genomic modeling\n  domain: dna\n  first_public_date: '2020.09'\n  publication_date: '2021.02'\n  paper_url: https://doi.org/10.1000/example\n");
 assert.equal(e.first_public_date,'2020-09');assert.equal(e.publication_date,'2021-02');assert.deepEqual(e.targets,['DNA']);
});
test('untrusted document URLs cannot become executable links',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('https://secret@example.com'),null);});
test('paperless tools keep named website and repository links without inventing papers',()=>{
 const entries=parseMarkdown('conformation','README.md','# Molecular dynamics\n## MD Engines and Frameworks\n- [OpenMM](https://github.com/openmm/openmm)\n- [VMD](https://www.ks.uiuc.edu/Research/vmd/)\n');
 assert.equal(entries.length,2);assert.ok(entries.every(e=>e.kind==='tool'&&e.paperUrls.length===0));assert.equal(entries[0].codeUrls[0],'https://github.com/openmm/openmm');assert.equal(entries[1].demo_url,'https://www.ks.uiuc.edu/Research/vmd/');
});
test('method classification distinguishes explicit software and standards without dropping ML models',()=>{
 const entries=parseStructured('antibody','data/methods/methods.yaml','- name: PyRosetta\n  tags: [software_tool]\n- name: AIRR standards\n  tags: [community_standards]\n- name: ThermoMPNN\n  tags: [message_passing, transfer_learning]\n- name: Germinal\n  tags: [hallucination]\n- name: UnspecifiedMethod\n');
 assert.deepEqual(entries.map(e=>e.kind),['tool','paper','model','model','model']);
});
