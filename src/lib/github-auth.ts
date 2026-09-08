import { execFileSync } from 'node:child_process';
let cached:string|undefined;
export function githubToken():string|undefined {
 if(process.env.GITHUB_TOKEN)return process.env.GITHUB_TOKEN;
 if(process.env.GITHUB_USE_GH_AUTH!=='true')return undefined;
 if(cached)return cached;
 try {cached=execFileSync('gh',['auth','token','--hostname','github.com'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();return cached||undefined;}
 catch {throw new Error('서버의 GitHub CLI 인증을 읽지 못했습니다. gh auth login 또는 GITHUB_TOKEN을 설정해 주세요.');}
}
export const githubAuthMode=()=>process.env.GITHUB_TOKEN?'server-token':process.env.GITHUB_USE_GH_AUTH==='true'?'local-keychain':'anonymous';
