import {cp,mkdir,rm,symlink} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import path from 'node:path';
const stage=path.resolve('.pages-build');await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
for(const name of ['src','public','package.json','tsconfig.json','next-env.d.ts'])await cp(name,path.join(stage,name),{recursive:true});
await rm(path.join(stage,'src/app/api'),{recursive:true,force:true});
await symlink(path.resolve('node_modules'),path.join(stage,'node_modules'),'dir');
await (await import('node:fs/promises')).writeFile(path.join(stage,'next.config.mjs'),"export default {output:'export',basePath:'/model-atlas',trailingSlash:true,images:{unoptimized:true},poweredByHeader:false};\n");
const result=spawnSync(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:stage,stdio:'inherit',env:{...process.env,NEXT_PUBLIC_STATIC_ATLAS:'true'}});process.exitCode=result.status||0;
