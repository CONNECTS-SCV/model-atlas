import { createHash } from 'node:crypto';
export const hash = (v:unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const normalizeName = (s:string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function safeUrl(value:unknown):string|null {
 if(typeof value!=='string') return null;
 try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null; } catch {return null;}
}
export function paperIdentifier(url:string) {
 const arxiv=url.match(/(?:arxiv(?:\.org\/(?:abs|pdf)\/|[.:]))(\d{4}\.\d{4,5})(?:v\d+)?/i);
 if(arxiv) return `arxiv:${arxiv[1]}`;
 const doi=url.match(/10\.\d{4,9}\/[\w.\-;()/:]+/i);
 if(doi) return `doi:${doi[0].replace(/(?:\.full|\.abstract|\.pdf)$/,'').replace(/v\d+$/,'').replace(/[.,;]+$/,'').toLowerCase()}`;
 return `url:${url.replace(/\/$/,'')}`;
}
export function repoUrl(url:string):string|null {
 const u=safeUrl(url);if(!u)return null;
 const m=u.match(/^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/i);
 return m?`https://github.com/${m[1]}/${m[2].replace(/\.git$/,'')}`:null;
}
export function namesCompatible(a:string,b:string) {return normalizeName(a)===normalizeName(b);}
