import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gzipSync,gunzipSync} from 'node:zlib';import {pool} from '../src/lib/db';
const tables=['sources','models','papers','code_repositories','jobs','model_papers','model_repositories','source_files','source_entries','claims','events','reviews','enrichment_jobs','document_jobs','model_relations'];
const file='data/state.json.gz';const c=await pool.connect();try{
 if(process.argv.includes('--restore')){
  if(process.env.ATLAS_ALLOW_RESTORE!=='1')throw new Error('Restore requires ATLAS_ALLOW_RESTORE=1 and an isolated database');
  const state=JSON.parse(gunzipSync(await readFile(file)).toString());if(state.version!==1)throw new Error('Unknown state version');
  await c.query('BEGIN');await c.query(`TRUNCATE ${tables.join(',')} CASCADE`);
  for(const table of tables){const rows=state.tables[table]||[];for(let i=0;i<rows.length;i+=200)await c.query(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table},$1::json)`,[JSON.stringify(rows.slice(i,i+200))]);}
  await c.query("SELECT setval(pg_get_serial_sequence('events','id'),coalesce((SELECT max(id) FROM events),1))");await c.query('COMMIT');console.log('Restored catalog state');
 }else{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const state:{version:number;tables:Record<string,unknown> }={version:1,tables:{}};
  for(const table of tables)state.tables[table]=(await c.query(`SELECT * FROM ${table}`)).rows;
  await c.query('COMMIT');await mkdir('data',{recursive:true});const bytes=gzipSync(JSON.stringify(state));await writeFile(file,bytes);console.log(`Saved catalog state: ${bytes.length} bytes`);
 }
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
